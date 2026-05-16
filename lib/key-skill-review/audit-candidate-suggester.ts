import {
  callLiveModel,
  LIVE_AUDIT_MODEL,
} from "@/lib/ai/live-models";

export type AuditCandidateInput = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  descriptor_snippets: string[];
  portfolio_need_score?: number;
  missing_descriptor_count?: number;
  total_descriptor_count?: number;
  confirmed_portfolio_count?: number;
  cip_confirmed_portfolio_count?: number;
  portfolio_need_reasons?: string[];
};

export type CurrentLinkedSkillQualityInput = {
  key_skill_id: string;
  key_skill_title: string;
  verdict: "weak" | "moderate" | "strong";
  evidence_score: number;
  removal_cost?: number;
  portfolio_risk_reasons?: string[];
};

export type AuditCandidateSuggestion = {
  key_skill_id: string;
  action: "add" | "replace" | "none";
  replace_skill_id: string | null;
  confidence: number;
  rationale: string;
};

export type AuditCandidateSuggesterMetrics = {
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type SuggestAuditCandidatesWithMetricsResult = {
  suggestions: AuditCandidateSuggestion[];
  metrics: AuditCandidateSuggesterMetrics;
};

type SuggesterEntry = {
  entry_text: string;
  entry_type: string | null;
};

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;
const KEY_SKILL_REVIEW_LLM_ENABLED =
  String(process.env.KEY_SKILL_REVIEW_LLM_ENABLED ?? "").toLowerCase() ===
  "true";

type ErrorLike = {
  status?: number;
  code?: string | number;
  name?: string;
  message?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorLike(err: unknown): ErrorLike {
  return err && typeof err === "object" ? (err as ErrorLike) : {};
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const fallback = extractErrorLike(err).message;
  return fallback ? String(fallback) : "Unknown error";
}

function getErrorStatus(err: unknown): number | null {
  const status = extractErrorLike(err).status;
  return Number.isFinite(status) ? Number(status) : null;
}

function isRetryableError(err: unknown): boolean {
  const message = formatError(err).toLowerCase();
  const status = getErrorStatus(err);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }
  if (status != null && status >= 500) {
    return true;
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("temporar") ||
    message.includes("overloaded") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("unexpected non-whitespace character after json")
  ) {
    return true;
  }
  return false;
}

async function withTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new Error(
              `Gemini 2.5 Flash request timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function buildPrompt(params: {
  entry: SuggesterEntry;
  available_slots: number;
  current_linked_skill_quality: CurrentLinkedSkillQualityInput[];
  candidates: AuditCandidateInput[];
}): string {
  return [
    "You are an RCOG curriculum expert proposing missing key-skill links for a single portfolio entry.",
    "Return strict JSON only (array). No prose, no markdown.",
    "",
    "Decision rules:",
    "- Prefer action='add' when available_slots > 0.",
    "- Use action='replace' only when available_slots == 0 and the candidate is stronger than a weak/moderate current link.",
    "- Never replace a strong current linked skill unless confidence is very high.",
    "- Prioritize candidates that close uncovered descriptors or strengthen under-evidenced CiPs in the wider portfolio.",
    "- Avoid replacing a linked skill when the current linked skill is one of the only confirmed pieces of evidence for that key skill or CiP elsewhere in the portfolio.",
    "- Return max 2 recommendations.",
    "- If no good recommendation exists, return [].",
    "",
    "Output schema (array of objects):",
    '[{"key_skill_id":"...","action":"add|replace|none","replace_skill_id":"...|null","confidence":0.0,"rationale":"short phrase"}]',
    "",
    `Entry type: ${params.entry.entry_type ?? "unspecified"}`,
    `Available slots: ${params.available_slots}`,
    "Entry text:",
    '"""',
    params.entry.entry_text,
    '"""',
    "",
    "Current linked skill quality summary:",
    JSON.stringify(params.current_linked_skill_quality, null, 2),
    "",
    "Gap candidate skills:",
    JSON.stringify(params.candidates, null, 2),
  ].join("\n");
}

export async function suggestAuditCandidates(params: {
  entry: SuggesterEntry;
  available_slots: number;
  current_linked_skill_quality: CurrentLinkedSkillQualityInput[];
  candidates: AuditCandidateInput[];
}): Promise<AuditCandidateSuggestion[]> {
  const detailed = await suggestAuditCandidatesWithMetrics(params);
  return detailed.suggestions;
}

export async function suggestAuditCandidatesWithMetrics(params: {
  entry: SuggesterEntry;
  available_slots: number;
  current_linked_skill_quality: CurrentLinkedSkillQualityInput[];
  candidates: AuditCandidateInput[];
}): Promise<SuggestAuditCandidatesWithMetricsResult> {
  if (!KEY_SKILL_REVIEW_LLM_ENABLED) {
    throw new Error(
      "Key-skill review LLM is disabled. Set KEY_SKILL_REVIEW_LLM_ENABLED=true to enable.",
    );
  }
  if (!process.env.GOOGLE_AI_STUDIO_API_KEY) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
  }

  if (!params.candidates.length) {
    return {
      suggestions: [],
      metrics: {
        api_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    };
  }

  const prompt = buildPrompt(params);
  let lastError: unknown = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let apiCalls = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const message = await withTimeout(
        () =>
          callLiveModel(LIVE_AUDIT_MODEL, {
            userMessage: prompt,
            maxTokens: 1200,
            temperature: 0,
            prefillArray: true,
            timeoutMs: REQUEST_TIMEOUT_MS,
          }),
        REQUEST_TIMEOUT_MS,
      );
      totalInputTokens += message.inputTokens;
      totalOutputTokens += message.outputTokens;
      apiCalls += 1;

      if (!message.rawText) {
        throw new Error("Gemini 2.5 Flash response missing text content");
      }

      const jsonText = message.rawText.trim();
      const parsed = JSON.parse(jsonText) as unknown;
      if (!Array.isArray(parsed)) {
        return {
          suggestions: [],
          metrics: {
            api_calls: apiCalls,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
    };
  }

      const suggestions = parsed
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object"),
        )
        .slice(0, 2)
        .map((item) => {
          const action: "add" | "replace" | "none" =
            item.action === "add" || item.action === "replace" || item.action === "none"
              ? item.action
              : "none";
          return {
            key_skill_id: String(item.key_skill_id ?? ""),
            action,
            replace_skill_id:
              typeof item.replace_skill_id === "string" && item.replace_skill_id.trim()
                ? item.replace_skill_id.trim()
                : null,
            confidence: Number(item.confidence ?? Number.NaN),
            rationale: String(item.rationale ?? "").trim(),
          };
        });

      return {
        suggestions,
        metrics: {
          api_calls: apiCalls,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
      };
    } catch (err) {
      lastError = err;
      const shouldRetry = attempt < MAX_ATTEMPTS && isRetryableError(err);
      if (!shouldRetry) break;
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  const error = new Error(
    `Audit candidate suggester failed after ${MAX_ATTEMPTS} attempts: ${formatError(lastError)}`,
  ) as Error & { metrics?: AuditCandidateSuggesterMetrics };
  error.metrics = {
    api_calls: apiCalls,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
  };
  throw error;
}
