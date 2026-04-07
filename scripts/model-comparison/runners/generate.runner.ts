import { SYSTEM_PROMPT, buildUserMessage } from "../../../lib/ai/prompts";
import { callModel } from "../providers";
import { tryParseJson } from "../scoring/shared";
import { scoreGenerate } from "../scoring/generate.scorer";
import type { ModelConfig, GenerateTestCase, RawCallResult, ScoredResult } from "../types";

export async function runGenerate(
  testCase: GenerateTestCase,
  model: ModelConfig,
): Promise<ScoredResult> {
  const userMessage = buildUserMessage({
    entry_type: testCase.entryType,
    free_text: testCase.rawInput,
    current_stage_id: testCase.stageId,
    length: testCase.length,
  });

  const callResult = await callModel(model, {
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 3000,
    temperature: 0.35,
    prefillArray: false,
  });

  const { parsed, method } = tryParseJson(callResult.rawText);
  const parseSuccess = method !== "failed";

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "generate",
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

  const { checks, score, maxScore } = scoreGenerate(
    testCase,
    parsed,
    callResult.rawText,
    parseSuccess,
  );

  return { ...raw, checks, score, maxScore };
}
