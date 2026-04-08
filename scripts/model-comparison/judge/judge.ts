/**
 * LLM-as-judge: runs Sonnet 4.6 once per test case to produce ground-truth
 * verdicts for descriptor and cross-cip tasks. These replace the Haiku
 * self-reference so all models are scored against the same independent standard.
 */

import { callModel } from "../providers";
import { tryParseJsonArray } from "../scoring/shared";
import type { ModelConfig, DescriptorTestCase, CrossCipTestCase, AnyTestCase } from "../types";

async function judgeDescriptor(
  testCase: DescriptorTestCase,
  model: ModelConfig,
): Promise<unknown> {
  const prompt = [
    "You are an expert RCOG curriculum assessor acting as ground-truth judge.",
    "Your verdicts will be used to evaluate other AI models — be accurate, specific, and well-calibrated.",
    "",
    `Entry type: ${testCase.entryType}`,
    "Entry text:",
    '"""',
    testCase.entryText,
    '"""',
    "",
    "For each descriptor below, decide whether the entry genuinely demonstrates that competency.",
    "",
    "Calibration guide:",
    "- covered=true, confidence 0.9+  → clear, specific evidence in the entry text",
    "- covered=true, confidence 0.7–0.89 → reasonable evidence but not fully explicit",
    "- covered=false, confidence 0.7+  → descriptor is clearly NOT evidenced",
    "- covered=false, confidence <0.7  → ambiguous — entry touches on it but not directly",
    "",
    "Most entries will cover some descriptors and miss others. Do not over-claim.",
    "",
    "Output ONLY a JSON array, one object per descriptor:",
    '  { "descriptor_id": "<id>", "covered": true, "confidence": 0.0 }',
    "No prose. No code fences.",
    "",
    "Descriptors to judge:",
    JSON.stringify(testCase.descriptors, null, 2),
  ].join("\n");

  const result = await callModel(model, {
    system: "",
    userMessage: prompt,
    maxTokens: 4096,
    temperature: 0,
    prefillArray: true,
  });

  const { parsed } = tryParseJsonArray(result.rawText, true);
  return parsed;
}

async function judgeCrossCip(
  testCase: CrossCipTestCase,
  model: ModelConfig,
): Promise<unknown> {
  const prompt = [
    "You are an expert RCOG curriculum assessor acting as ground-truth judge.",
    "Your verdicts will be used to evaluate other AI models — be conservative and accurate.",
    "",
    `Entry type: ${testCase.entryType}`,
    `Primary CiP: ${testCase.linkedCipNumber}`,
    "Entry text:",
    '"""',
    testCase.entryText,
    '"""',
    "",
    "Identify skills from OTHER CiPs that are genuinely evidenced by this entry.",
    "Only include skills with specific, concrete evidence — not vague or coincidental matches.",
    "",
    `Existing linked-CiP skills (do not duplicate): ${testCase.linkedSkillTitles.join(", ")}`,
    "",
    "Output ONLY a JSON array of genuinely evidenced cross-CiP skills:",
    '  { "key_skill_id": "<id>", "cip_number": <n>, "confidence": 0.0, "rationale": "<max 8 words>" }',
    "",
    "If no cross-CiP skills are clearly evidenced, return an empty array: []",
    "No prose. No code fences.",
    "",
    "Candidate skills to consider:",
    JSON.stringify(testCase.crossCipSkills, null, 2),
  ].join("\n");

  const result = await callModel(model, {
    system: "",
    userMessage: prompt,
    maxTokens: 4096,
    temperature: 0,
    prefillArray: true,
  });

  const { parsed } = tryParseJsonArray(result.rawText, true);
  return parsed;
}

export async function runJudge(
  testCase: AnyTestCase,
  model: ModelConfig,
): Promise<unknown> {
  if (testCase.callType === "descriptor") {
    return judgeDescriptor(testCase as DescriptorTestCase, model);
  }
  if (testCase.callType === "cross-cip") {
    return judgeCrossCip(testCase as CrossCipTestCase, model);
  }
  return null;
}
