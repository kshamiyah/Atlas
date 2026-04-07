import { callModel } from "../providers";
import { tryParseJsonArray } from "../scoring/shared";
import { scoreCrossCip } from "../scoring/cross-cip.scorer";
import type { ModelConfig, CrossCipTestCase, RawCallResult, ScoredResult } from "../types";

function buildPrompt(
  entryText: string,
  entryType: string,
  linkedCipNumber: number,
  crossCipSkills: { key_skill_id: string; cip_number: number; title: string }[],
  linkedSkillTitles: string[],
): string {
  const cipLabel = linkedCipNumber === 0 ? "None (unlinked entry)" : String(linkedCipNumber);
  const skillsHeader =
    linkedCipNumber === 0
      ? "Key skills to consider (all CiPs — entry has no primary CiP):"
      : `Cross-CiP key skills to consider (from CiPs other than CiP ${linkedCipNumber}):`;
  const conservativeNote =
    linkedCipNumber === 0
      ? "- Entry has no primary CiP — match any skills the text directly evidences"
      : "- Be conservative — clinical procedures usually only evidence their primary CiP";
  const linkedCoverageSection =
    linkedSkillTitles.length > 0
      ? [
          "Existing linked-CiP coverage already identified for this entry:",
          JSON.stringify(linkedSkillTitles, null, 2),
          "",
        ].join("\n")
      : "Existing linked-CiP coverage already identified for this entry: []\n";

  return [
    "You are an RCOG curriculum expert. Given a portfolio entry, identify which key skills the entry provides direct evidence for.",
    "",
    `Entry type: ${entryType || "unspecified"}`,
    `Linked CiP: ${cipLabel}`,
    "Entry text:",
    '"""',
    entryText,
    '"""',
    "",
    linkedCoverageSection,
    skillsHeader,
    JSON.stringify(crossCipSkills, null, 2),
    "",
    "Rules:",
    "- Only return skills where the entry TEXT clearly and explicitly demonstrates that skill",
    "- Prioritize skills that add NEW coverage beyond linked-CiP coverage listed above",
    "- If a candidate substantially overlaps linked-CiP coverage, only include it when evidence is distinct and explicit",
    conservativeNote,
    "- confidence: 0.0–1.0 (use 0.8+ for explicit strong evidence, 0.6–0.79 for moderate, <0.6 only if weak)",
    "- rationale: short phrase max 8 words explaining the specific evidence",
    "- If no skills are evidenced, output just ]",
    "- Output ONLY array items and closing ]. No prose. No code fences.",
    "",
    "Continue the JSON array that has already been started. Output one object per evidenced skill:",
    '  { "key_skill_id": "<id>", "cip_number": N, "confidence": 0.0, "rationale": "short phrase" },',
  ].join("\n");
}

export async function runCrossCip(
  testCase: CrossCipTestCase,
  model: ModelConfig,
  referenceOutput: unknown,
): Promise<ScoredResult> {
  const prompt = buildPrompt(
    testCase.entryText,
    testCase.entryType,
    testCase.linkedCipNumber,
    testCase.crossCipSkills,
    testCase.linkedSkillTitles,
  );

  const callResult = await callModel(model, {
    system: "",
    userMessage: prompt,
    maxTokens: 4000,
    temperature: 0,
    prefillArray: true,
  });

  const { parsed, method } = tryParseJsonArray(callResult.rawText, true);
  const parseSuccess = method !== "failed" && Array.isArray(parsed);

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "cross-cip",
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

  const { checks, score, maxScore } = scoreCrossCip(
    testCase,
    parsed,
    parseSuccess,
    referenceOutput,
  );

  return { ...raw, checks, score, maxScore };
}
