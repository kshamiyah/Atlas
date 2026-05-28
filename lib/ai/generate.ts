import { callGeminiCompletion } from "./gemini-client";
import { maxTokensForEntryLength, parseModelJson } from "./parse-model-json";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompts";
import type { GeneratedEntryType } from "@/lib/types/entries";

export type GeneratedAIOutput = {
  entry_type: string;
  fields: Record<string, string | number | boolean | null>;
  suggested_key_skill_ids: string[];
  key_skill_rationale: Record<string, string>;
  suggested_key_skills_detail: {
    key_skill_id: string;
    title: string;
    cip_number: number | null;
    covered: boolean | null;
    rationale: string;
    evidenced_descriptors: string[];
    all_descriptors: string[];
  }[];
  stage_id: string;
  inferred_level: number | null;
  notes: string[];
};

const MAX_GENERATION_ATTEMPTS = 3;

export async function generatePortfolioEntry(params: {
  entry_type: GeneratedEntryType;
  free_text: string;
  stage_id: string;
  date_hint?: string;
  length?: "short" | "standard" | "detailed";
  target_key_skills?: { id: string; title: string; descriptors: string[] }[];
}): Promise<GeneratedAIOutput> {
  const userMessage = buildUserMessage({
    entry_type: params.entry_type,
    free_text: params.free_text,
    current_stage_id: params.stage_id,
    date_hint: params.date_hint,
    length: params.length,
    target_key_skills: params.target_key_skills,
  });

  let parsed: GeneratedAIOutput | null = null;
  let lastError = "Unknown parse error";

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const maxTokens =
      maxTokensForEntryLength(params.length) + attempt * 2048;

    const { content, finishReason } = await callGeminiCompletion({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens,
      temperature: attempt === 0 ? 0.2 : 0.15,
      jsonObject: true,
    });

    if (!content.trim()) {
      lastError = "Empty response from Gemini";
      continue;
    }

    const result = parseModelJson(content);
    if (!result.ok) {
      lastError =
        finishReason === "length"
          ? "Gemini response was truncated (increase max tokens and retry)"
          : "Gemini returned invalid JSON";
      continue;
    }

    parsed = result.value as GeneratedAIOutput;
    break;
  }

  if (!parsed) {
    throw new Error(`Gemini returned invalid JSON: ${lastError}`);
  }

  if (!parsed.fields || typeof parsed.fields !== "object") {
    throw new Error("Gemini response missing fields object");
  }

  parsed.entry_type = params.entry_type;

  // Normalise arrays and primitives — models can return null for optional fields.
  // Pass 1 does not do key-skill matching; Pass 2 will fill these in.
  parsed.suggested_key_skill_ids = [];
  parsed.key_skill_rationale = {};
  parsed.suggested_key_skills_detail = [];
  parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  parsed.stage_id = typeof parsed.stage_id === "string" ? parsed.stage_id : "ST1";
  parsed.inferred_level =
    typeof parsed.inferred_level === "number" ? parsed.inferred_level : null;

  return parsed;
}
