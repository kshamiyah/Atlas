import { callModel } from "../providers";
import { tryParseJsonArray } from "../scoring/shared";
import { scoreDescriptor } from "../scoring/descriptor.scorer";
import type { ModelConfig, DescriptorTestCase, RawCallResult, ScoredResult } from "../types";

function buildPrompt(
  entryText: string,
  entryType: string,
  descriptors: { descriptor_id: string; key_skill_id: string; key_skill_title: string; descriptor_text: string }[],
): string {
  return [
    "You are an RCOG curriculum expert. Analyse whether a portfolio entry provides evidence for specific descriptors.",
    "",
    `Entry type: ${entryType || "unspecified"}`,
    "Entry text:",
    '"""',
    entryText,
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
    JSON.stringify(descriptors, null, 2),
  ].join("\n");
}

export async function runDescriptor(
  testCase: DescriptorTestCase,
  model: ModelConfig,
  referenceOutput: unknown,
): Promise<ScoredResult> {
  const prompt = buildPrompt(
    testCase.entryText,
    testCase.entryType,
    testCase.descriptors,
  );

  const callResult = await callModel(model, {
    system: "",  // No separate system prompt — everything in user message (mirrors live code)
    userMessage: prompt,
    maxTokens: 8192,
    temperature: 0,
    prefillArray: true, // Uses "[" prefill trick
  });

  const { parsed, method } = tryParseJsonArray(callResult.rawText, true);
  const parseSuccess = method !== "failed" && Array.isArray(parsed);

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "descriptor",
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

  const { checks, score, maxScore } = scoreDescriptor(
    testCase,
    parsed,
    parseSuccess,
    referenceOutput,
  );

  return { ...raw, checks, score, maxScore };
}
