import { callModel } from "../providers";
import { tryParseJson } from "../scoring/shared";
import { scoreMatchKeySkills } from "../scoring/match-key-skills.scorer";
import type { ModelConfig, MatchKeySkillsTestCase, RawCallResult, ScoredResult } from "../types";

const SYSTEM_PROMPT = `You are an RCOG curriculum expert. Your task is to identify which key skills from the RCOG O&G curriculum are genuinely evidenced by a portfolio entry.

For each candidate skill you receive: its ID, title, CiP number, descriptor phrases (what the skill looks like in practice), and whether the trainee currently has portfolio evidence for it.

RULES:
- Read the entry holistically and understand the clinical scenario — do not just match keywords
- A skill is evidenced if the entry demonstrates the competency described by its descriptors, even if the exact words do not appear
- Consider what the clinical situation implicitly requires (e.g. an emergency LSCS inherently evidences consent and surgical safety even if not stated explicitly)
- Suggest 2–5 skills maximum. Quality over quantity.
- When two skills are equally applicable, prefer those with "covered: false" — this helps fill genuine portfolio gaps
- NEVER suggest a skill that is not genuinely demonstrated by this entry

Return ONLY valid JSON:
{
  "suggested_key_skill_ids": ["KS001", "KS015"],
  "rationale": {
    "KS001": "brief reason why this entry evidences this skill",
    "KS015": "brief reason — note if it fills a portfolio gap"
  }
}`;

export async function runMatchKeySkills(
  testCase: MatchKeySkillsTestCase,
  model: ModelConfig,
): Promise<ScoredResult> {
  const userMessage = JSON.stringify(
    {
      entry_type: testCase.entryType,
      entry: testCase.entryFields,
      candidate_key_skills: testCase.candidates,
    },
    null,
    2,
  );

  const callResult = await callModel(model, {
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 800,
    temperature: 0,
    prefillArray: false,
  });

  const { parsed, method } = tryParseJson(callResult.rawText);
  const parseSuccess = method !== "failed";

  const raw: RawCallResult = {
    testCaseId: testCase.id,
    callType: "match-key-skills",
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

  const { checks, score, maxScore } = scoreMatchKeySkills(
    testCase,
    parsed,
    parseSuccess,
  );

  return { ...raw, checks, score, maxScore };
}
