import {
  binaryCheck,
  proportionalCheck,
  sumScore,
  sumMax,
  countWords,
} from "./shared";
import type { CheckResult, CrossCipTestCase } from "../types";

export interface CrossCipScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreCrossCip(
  testCase: CrossCipTestCase,
  parsed: unknown,
  parseSuccess: boolean,
  referenceOutput: unknown, // Haiku's output for agreement scoring
): CrossCipScoreResult {
  const checks: CheckResult[] = [];
  const candidateIds = new Set(testCase.crossCipSkills.map((s) => s.key_skill_id));
  const candidateCipMap = new Map(
    testCase.crossCipSkills.map((s) => [s.key_skill_id, s.cip_number]),
  );

  // ── 1. Format integrity (25 pts) ─────────────────────────────────────────

  const isValidArray = parseSuccess && Array.isArray(parsed);
  checks.push(binaryCheck("valid_json_array", isValidArray, 15));

  if (!isValidArray) {
    checks.push(binaryCheck("no_hallucinated_ids", false, 10, "skipped"));
    checks.push(proportionalCheck("confidence_is_0_to_1", 0, 10, "skipped"));
    checks.push(proportionalCheck("rationale_non_empty", 0, 10, "skipped"));
    checks.push(proportionalCheck("rationale_max_8_words", 0, 20, "skipped"));
    checks.push(proportionalCheck("cip_number_correct", 0, 5, "skipped"));
    checks.push(binaryCheck("confidence_not_all_identical", false, 10, "skipped"));
    checks.push(binaryCheck("confidence_range_spans_0_2", false, 10, "skipped"));
    checks.push(proportionalCheck("agreement_with_reference", 0, 20, "skipped"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  const items = parsed as Record<string, unknown>[];

  // No hallucinated IDs
  const hallucinated = items.filter(
    (i) => !candidateIds.has(String(i.key_skill_id ?? "")),
  );
  checks.push(
    binaryCheck(
      "no_hallucinated_ids",
      hallucinated.length === 0,
      10,
      hallucinated.length > 0
        ? `${hallucinated.length} hallucinated ID(s)`
        : undefined,
    ),
  );

  // Only score valid items (those with IDs from the candidate list)
  const validItems = items.filter((i) =>
    candidateIds.has(String(i.key_skill_id ?? "")),
  );

  // ── 2. Field validity per item (45 pts) ──────────────────────────────────

  const validConf = validItems.filter((i) => {
    const c = Number(i.confidence ?? -1);
    return Number.isFinite(c) && c >= 0 && c <= 1;
  });
  const confPts = validItems.length > 0
    ? Math.round((validConf.length / validItems.length) * 10)
    : 10;
  checks.push(
    proportionalCheck(
      "confidence_is_0_to_1",
      confPts,
      10,
      `${validConf.length}/${validItems.length} valid`,
    ),
  );

  // Rationale non-empty
  const nonEmptyRationale = validItems.filter(
    (i) => typeof i.rationale === "string" && (i.rationale as string).trim().length > 0,
  );
  const rationalePts = validItems.length > 0
    ? Math.round((nonEmptyRationale.length / validItems.length) * 10)
    : 10;
  checks.push(proportionalCheck("rationale_non_empty", rationalePts, 10));

  // Rationale ≤ 8 words (hard rule from prompt)
  const shortRationale = validItems.filter((i) => {
    const r = String(i.rationale ?? "");
    return countWords(r) <= 8;
  });
  const shortRationalePts = validItems.length > 0
    ? Math.round((shortRationale.length / validItems.length) * 20)
    : 20;
  const longRationale = validItems.filter((i) => countWords(String(i.rationale ?? "")) > 8);
  checks.push(
    proportionalCheck(
      "rationale_max_8_words",
      shortRationalePts,
      20,
      longRationale.length > 0
        ? `${longRationale.length} rationale(s) exceed 8 words`
        : undefined,
    ),
  );

  // CiP number matches candidate
  const correctCip = validItems.filter(
    (i) =>
      candidateCipMap.get(String(i.key_skill_id ?? "")) === Number(i.cip_number ?? -1),
  );
  const cipPts = validItems.length > 0
    ? Math.round((correctCip.length / validItems.length) * 5)
    : 5;
  checks.push(proportionalCheck("cip_number_correct", cipPts, 5));

  // ── 3. Calibration (30 pts) ───────────────────────────────────────────────

  const confidenceValues = validConf.map((i) => Number(i.confidence));
  const allIdentical =
    confidenceValues.length > 1 &&
    confidenceValues.every((v) => v === confidenceValues[0]);
  checks.push(
    binaryCheck(
      "confidence_not_all_identical",
      !allIdentical || confidenceValues.length <= 1,
      10,
      allIdentical ? "All confidence scores are identical" : undefined,
    ),
  );

  const confMin = confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0;
  const confMax = confidenceValues.length > 0 ? Math.max(...confidenceValues) : 0;
  const confRange = confMax - confMin;
  checks.push(
    binaryCheck(
      "confidence_range_spans_0_2",
      confidenceValues.length <= 1 || confRange >= 0.2,
      10,
      confidenceValues.length > 1
        ? `Range: ${confMin.toFixed(2)}–${confMax.toFixed(2)}`
        : undefined,
    ),
  );

  // Agreement with reference model
  if (referenceOutput && Array.isArray(referenceOutput) && referenceOutput.length > 0) {
    const refIds = new Set(
      (referenceOutput as Record<string, unknown>[]).map((i) =>
        String(i.key_skill_id ?? ""),
      ),
    );
    const currentIds = new Set(validItems.map((i) => String(i.key_skill_id ?? "")));
    const allIds = new Set([...refIds, ...currentIds]);

    if (allIds.size > 0) {
      // Jaccard similarity: intersection / union
      const intersection = [...refIds].filter((id) => currentIds.has(id)).length;
      const union = allIds.size;
      const jaccard = intersection / union;
      const agreementPts = Math.round(jaccard * 20);
      checks.push(
        proportionalCheck(
          "agreement_with_reference",
          agreementPts,
          20,
          `Jaccard similarity with Haiku: ${Math.round(jaccard * 100)}% (${intersection} shared / ${union} total)`,
        ),
      );
    } else {
      checks.push(proportionalCheck("agreement_with_reference", 20, 20, "both empty"));
    }
  } else {
    // This is the reference model — full points
    checks.push(
      proportionalCheck("agreement_with_reference", 20, 20, "reference model — full points"),
    );
  }

  return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
}
