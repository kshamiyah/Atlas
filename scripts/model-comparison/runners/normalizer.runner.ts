import { callModel } from "../providers";
import { tryParseJson } from "../scoring/shared";
import { scoreNormalizer } from "../scoring/normalizer.scorer";
import type { ModelConfig, NormalizerTestCase, RawCallResult, ScoredResult } from "../types";

const SYSTEM_PROMPT = `You are editing a CiP trainee reflection to satisfy strict format constraints while preserving meaning.

Return JSON only:
{ "trainee_comments": "<rewritten text>" }

Rules:
- Keep the same core meaning, clinical facts, and learning points. Do not invent new facts.
- Make the minimum edits needed to meet constraints. Preserve original voice and wording where possible.
- Keep exactly 5 paragraphs.
- Keep paragraph roles:
  1) opening reflection arc only (no case narrative),
  2) case 1 with insight and concrete change,
  3) case 2 with insight and concrete change,
  4) honest current gaps,
  5) specific next steps.
- Use plain, direct wording and shorter sentences.
- Include at least one candid uncertainty line in simple language (for example: "I wasn't sure...", "I hesitated...", "I realised I had missed...").
- Keep first-person reflective voice.
- Avoid introducing stock template phrases (for example: "Over this period", "This taught me", "I recognise", "My next steps are") unless they are already in the source text.
- Meet the required word range exactly (inclusive).`;

export async function runNormalizer(
  testCase: NormalizerTestCase,
  model: ModelConfig,
): Promise<ScoredResult> {
  const userMessage = JSON.stringify(
    {
      target_length: testCase.length,
      target_word_range: testCase.targetRange,
      current_word_count: testCase.currentWordCount,
      current_paragraph_count: testCase.currentParagraphCount,
      current_text: testCase.traineeComments,
    },
    null,
    2,
  );

  const callResult = await callModel(model, {
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 1600,
    temperature: 0.2,
    prefillArray: false,
  });

  const { parsed, method } = tryParseJson(callResult.rawText);
  const parseSuccess = method !== "failed";

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "normalizer",
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

  const { checks, score, maxScore } = scoreNormalizer(testCase, parsed, parseSuccess);

  return { ...raw, checks, score, maxScore };
}
