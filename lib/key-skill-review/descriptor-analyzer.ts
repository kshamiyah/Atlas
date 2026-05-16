import {
  callLiveModel,
  LIVE_AUDIT_MODEL,
} from "@/lib/ai/live-models";

export type AnalyzerKeySkill = {
  key_skill_id: string;
  cip_number: number;
  title: string;
  is_confirmed: boolean;
  descriptors: { descriptor_id: string; text: string; sort_order: number }[];
};

export type AnalyzerEntry = {
  entry_text: string;
  entry_type: string | null;
};

export type DescriptorResult = {
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  confidence: number;
  evidence_quote: string | null;
};

export type DescriptorAnalyzerMetrics = {
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type AnalyzeDescriptorsWithMetricsResult = {
  results: DescriptorResult[];
  metrics: DescriptorAnalyzerMetrics;
};

type PromptDescriptor = {
  descriptor_id: string;
  key_skill_id: string;
  key_skill_title: string;
  descriptor_text: string;
};

const MAX_DESCRIPTORS_PER_CALL = 30;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

type CallUsage = { input_tokens: number; output_tokens: number };
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
    message.includes("failed to parse gemini 2.5 flash response as json")
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

function buildPrompt(
  entry: AnalyzerEntry,
  descriptors: PromptDescriptor[],
): string {
  const entryType = entry.entry_type ?? "unspecified";

  return [
    "You are an RCOG curriculum expert. Analyse whether a portfolio entry provides evidence for specific descriptors.",
    "",
    `Entry type: ${entryType}`,
    "Entry text:",
    '"""',
    entry.entry_text,
    '"""',
    "",
    "For each descriptor below, determine if the entry provides direct evidence.",
    "Only mark covered=true if the entry text explicitly demonstrates that descriptor.",
    "",
    "Continue the JSON array that has already been started. Output one object per descriptor:",
    '  { "descriptor_id": "<id>", "covered": true, "confidence": 0.0 },',
    "",
    "Rules:",
    "- covered: true only if the entry text explicitly demonstrates that descriptor",
    "- confidence: number between 0.0 and 1.0",
    "- Output ONLY the array items and the closing ]. No prose. No code fences. No extra fields.",
    "",
    "Descriptors to analyse:",
    JSON.stringify(
      descriptors.map((d) => ({
        descriptor_id: d.descriptor_id,
        key_skill_id: d.key_skill_id,
        key_skill_title: d.key_skill_title,
        descriptor_text: d.descriptor_text,
      })),
      null,
      2,
    ),
  ].join("\n");
}

async function callGeminiOnce(
  prompt: string,
): Promise<{ data: unknown; usage: CallUsage }> {
  const message = await callLiveModel(LIVE_AUDIT_MODEL, {
    userMessage: prompt,
    maxTokens: 8192,
    temperature: 0,
    prefillArray: true,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  const usage: CallUsage = {
    input_tokens: message.inputTokens,
    output_tokens: message.outputTokens,
  };
  if (!message.rawText) {
    throw new Error("Gemini 2.5 Flash response missing text content");
  }

  const jsonText = message.rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const preview = jsonText.slice(0, 400).replace(/\n/g, " ");
    throw new Error(
      `Failed to parse Gemini 2.5 Flash response as JSON. Preview: ${preview}`,
    );
  }

  return { data: parsed, usage };
}

async function callGemini(
  prompt: string,
): Promise<{ data: unknown; usage: CallUsage }> {
  if (!KEY_SKILL_REVIEW_LLM_ENABLED) {
    throw new Error(
      "Key-skill review LLM is disabled. Set KEY_SKILL_REVIEW_LLM_ENABLED=true to enable.",
    );
  }
  if (!process.env.GOOGLE_AI_STUDIO_API_KEY) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(
        () => callGeminiOnce(prompt),
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      lastError = err;
      const shouldRetry = attempt < MAX_ATTEMPTS && isRetryableError(err);
      if (!shouldRetry) break;
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw new Error(
    `Descriptor analyzer failed after ${MAX_ATTEMPTS} attempts: ${formatError(lastError)}`,
  );
}

export async function analyzeDescriptorsWithMetrics(
  entry: AnalyzerEntry,
  keySkills: AnalyzerKeySkill[],
): Promise<AnalyzeDescriptorsWithMetricsResult> {
  const promptDescriptors: PromptDescriptor[] = [];

  for (const ks of keySkills) {
    for (const d of ks.descriptors) {
      promptDescriptors.push({
        descriptor_id: d.descriptor_id,
        key_skill_id: ks.key_skill_id,
        key_skill_title: ks.title,
        descriptor_text: d.text,
      });
    }
  }

  if (promptDescriptors.length === 0) {
    return {
      results: [],
      metrics: {
        api_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    };
  }

  const chunks: PromptDescriptor[][] = [];
  for (let i = 0; i < promptDescriptors.length; i += MAX_DESCRIPTORS_PER_CALL) {
    chunks.push(promptDescriptors.slice(i, i + MAX_DESCRIPTORS_PER_CALL));
  }

  const results: DescriptorResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let apiCalls = 0;

  for (const chunk of chunks) {
    const prompt = buildPrompt(entry, chunk);
    try {
      const { data: raw, usage } = await callGemini(prompt);
      totalInputTokens += usage.input_tokens;
      totalOutputTokens += usage.output_tokens;
      apiCalls += 1;

      if (!Array.isArray(raw)) {
        continue;
      }

      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const parsedItem = item as Record<string, unknown>;

        const descriptor_id = String(parsedItem.descriptor_id ?? "");
        if (!descriptor_id) continue;

        const meta = chunk.find((d) => d.descriptor_id === descriptor_id);
        if (!meta) continue;

        const covered = Boolean(parsedItem.covered);
        const confidenceRaw = Number(parsedItem.confidence ?? 0);
        const confidence =
          Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1
            ? confidenceRaw
            : 0;

        results.push({
          key_skill_id: meta.key_skill_id,
          descriptor_id,
          covered,
          confidence,
          evidence_quote: null, // not requested from LLM to avoid JSON escaping issues
        });
      }
    } catch (err) {
      const error = new Error(
        `Descriptor analyzer failed for chunk: ${formatError(err)}`,
      ) as Error & { metrics?: DescriptorAnalyzerMetrics };
      error.metrics = {
        api_calls: apiCalls,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };
      throw error;
    }
  }

  return {
    results,
    metrics: {
      api_calls: apiCalls,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    },
  };
}

export async function analyzeDescriptors(
  entry: AnalyzerEntry,
  keySkills: AnalyzerKeySkill[],
): Promise<DescriptorResult[]> {
  const detailed = await analyzeDescriptorsWithMetrics(entry, keySkills);
  return detailed.results;
}
