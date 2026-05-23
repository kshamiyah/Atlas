import {
  binaryCheck,
  proportionalCheck,
  sumScore,
  sumMax,
} from "./shared";
import type { CheckResult, MatchKeySkillsTestCase } from "../types";

export interface MatchKeySkillsScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreMatchKeySkills(
  testCase: MatchKeySkillsTestCase,
  parsed: unknown,
  parseSuccess: boolean,
): MatchKeySkillsScoreResult {
  const checks: CheckResult[] = [];
  const candidateIds = new Set(testCase.candidates.map((c) => c.key_skill_id));

  // ── 1. Format integrity (35 pts) ─────────────────────────────────────────

  checks.push(binaryCheck("valid_json", parseSuccess, 15));

  if (!parseSuccess) {
    checks.push(binaryCheck("ids_is_array", false, 10, "skipped"));
    checks.push(binaryCheck("rationale_is_object", false, 5, "skipped"));
    checks.push(binaryCheck("rationale_keys_match", false, 5, "skipped"));
    checks.push(binaryCheck("count_2_to_5", false, 20, "skipped"));
    checks.push(binaryCheck("no_hallucinated_ids", false, 30, "skipped"));
    checks.push(proportionalCheck("rationale_non_empty", 0, 15, "skipped"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  const data = parsed as Record<string, unknown>;
  const suggestedIds: string[] = Array.isArray(data.suggested_key_skill_ids)
    ? data.suggested_key_skill_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  const rationale =
    data.rationale && typeof data.rationale === "object"
      ? (data.rationale as Record<string, unknown>)
      : {};

  checks.push(
    binaryCheck(
      "ids_is_array",
      Array.isArray(data.suggested_key_skill_ids),
      10,
    ),
  );
  checks.push(
    binaryCheck(
      "rationale_is_object",
      Boolean(data.rationale && typeof data.rationale === "object"),
      5,
    ),
  );

  // Rationale keys must match suggested IDs exactly
  const rationaleKeys = new Set(Object.keys(rationale));
  const suggestedSet = new Set(suggestedIds);
  const keysMatch =
    suggestedIds.every((id) => rationaleKeys.has(id)) &&
    [...rationaleKeys].every((k) => suggestedSet.has(k));
  checks.push(binaryCheck("rationale_keys_match", keysMatch, 5));

  // ── 2. Rules compliance (65 pts) ─────────────────────────────────────────

  // Count: must be 2-5
  const count = suggestedIds.length;
  const countValid = count >= 2 && count <= 5;
  checks.push(
    binaryCheck(
      "count_2_to_5",
      countValid,
      20,
      `Returned ${count} skill(s) (expected 2–5)`,
    ),
  );

  // No hallucinated IDs — any ID not in the candidate list = instant 0
  const hallucinated = suggestedIds.filter((id) => !candidateIds.has(id));
  checks.push(
    binaryCheck(
      "no_hallucinated_ids",
      hallucinated.length === 0,
      30,
      hallucinated.length > 0
        ? `Hallucinated: ${hallucinated.slice(0, 3).join(", ")}`
        : undefined,
    ),
  );

  // All rationale values non-empty strings
  const rationaleValues = Object.values(rationale);
  const nonEmptyRationale = rationaleValues.filter(
    (v) => typeof v === "string" && (v as string).trim().length > 0,
  );
  const rationalePts =
    rationaleValues.length > 0
      ? Math.round((nonEmptyRationale.length / rationaleValues.length) * 15)
      : 15;
  checks.push(
    proportionalCheck(
      "rationale_non_empty",
      rationalePts,
      15,
      `${nonEmptyRationale.length}/${rationaleValues.length} non-empty`,
    ),
  );

  return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
}
