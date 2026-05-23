import { callModel } from "../providers";
import { tryParseJson } from "../scoring/shared";
import { scoreFieldRegen } from "../scoring/field.scorer";
import type { ModelConfig, FieldRegenTestCase, RawCallResult, ScoredResult } from "../types";

const FIELD_SYSTEM_PROMPT = `You are an expert RCOG portfolio writing assistant. Given an existing portfolio entry and a specific field that needs to be regenerated, produce a fresh, high-quality replacement for that single field.

Return EXACTLY one JSON object and NOTHING ELSE:
{ "value": "<regenerated field text>" }

No prose. No markdown. No code fences. Your entire response must be parseable by JSON.parse() with no pre-processing.

Rules:
- Match the style, tone and length of the other fields in the entry.
- Ensure clinical accuracy — do not invent details not present in the original narrative or existing fields.
- Do not repeat verbatim sentences from other fields.
- Keep the same entry_type conventions (e.g. first-person for reflection, concise for procedure).
- Do NOT use em dashes (—). Use commas, full stops, or restructure the sentence instead.
- Do NOT use AI-sounding phrases like "closing the loop", "this taught me", "genuinely shifted something".
- Write like a practising clinician filling in a form, not an essayist.`;

export async function runFieldRegen(
  testCase: FieldRegenTestCase,
  model: ModelConfig,
): Promise<ScoredResult> {
  // Build user message mirroring the production /api/generate/field route
  const contextParts: string[] = [];
  contextParts.push(`Entry type: ${testCase.entryType}`);
  if (testCase.rawInput) {
    contextParts.push(`Original narrative: ${testCase.rawInput}`);
  }
  const otherFields = Object.entries(testCase.currentFields)
    .filter(([k]) => k !== testCase.targetFieldId)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  if (otherFields) {
    contextParts.push(`Other fields (for context):\n${otherFields}`);
  }
  contextParts.push(
    `Field to regenerate: "${testCase.targetFieldLabel}" (id: ${testCase.targetFieldId})`,
  );
  contextParts.push(
    `Length target: ${testCase.length} (short≈100-150w, standard≈250-350w, detailed≈450-600w). Non-narrative fields should stay brief.`,
  );

  const userMessage = contextParts.join("\n\n");

  const callResult = await callModel(model, {
    system: FIELD_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 1200,
    temperature: 0.35,
    prefillArray: false,
  });

  const { parsed, method } = tryParseJson(callResult.rawText);
  const parseSuccess = method !== "failed";

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "field-regen",
    modelKey: model.key,
    rawText: callResult.rawText,
    parsed,
    parseSuccess,
    parseMethod: method,
    inputTokens: callResult.inputTokens,
    outputTokens: callResult.outputTokens,
    latencyMs: callResult.latencyMs,
    error: callResult.error,
  };

  const { checks, score, maxScore } = scoreFieldRegen(
    testCase,
    parsed,
    callResult.rawText,
    parseSuccess,
  );

  return { ...raw, checks, score, maxScore };
}
