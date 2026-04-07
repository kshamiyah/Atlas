import {
  binaryCheck,
  proportionalCheck,
  hasEmDashAnywhere,
  bannedPhrasesInObj,
  hasMarkdownFences,
  countWords,
  countParagraphs,
  wordCountInRange,
  sumScore,
  sumMax,
} from "./shared";
import {
  REQUIRED_FIELDS,
  NARRATIVE_FIELDS,
  FIELD_WORD_RANGES,
  CIP_WORD_RANGES,
  VALID_EVIDENCE_TYPES,
} from "../config";
import type { CheckResult, GenerateTestCase } from "../types";

export interface GenerateScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreGenerate(
  testCase: GenerateTestCase,
  parsed: unknown,
  rawText: string,
  parseSuccess: boolean,
): GenerateScoreResult {
  const checks: CheckResult[] = [];

  // ── 1. Format integrity (35 pts) ─────────────────────────────────────────

  checks.push(
    binaryCheck("valid_json", parseSuccess, 15, parseSuccess ? undefined : "JSON parse failed"),
  );

  if (!parseSuccess) {
    // If JSON parse failed, all other checks get 0 — add them as failed
    checks.push(binaryCheck("no_markdown_fences", false, 5, "skipped — parse failed"));
    checks.push(proportionalCheck("required_fields_present", 0, 10, "skipped — parse failed"));
    checks.push(binaryCheck("no_extra_fields", false, 5, "skipped — parse failed"));
    checks.push(binaryCheck("correct_entry_type", false, 5, "skipped — parse failed"));
    checks.push(binaryCheck("no_em_dashes", false, 15, "skipped — parse failed"));
    checks.push(proportionalCheck("no_banned_phrases", 0, 15, "skipped — parse failed"));
    checks.push(proportionalCheck("all_fields_non_empty", 0, 10, "skipped — parse failed"));
    checks.push(proportionalCheck("word_count_compliance", 0, 25, "skipped — parse failed"));
    const score = sumScore(checks);
    return { checks, score, maxScore: sumMax(checks) };
  }

  checks.push(binaryCheck("no_markdown_fences", !hasMarkdownFences(rawText), 5));

  const data = parsed as Record<string, unknown>;
  const entryType = String(data.entry_type ?? "").toLowerCase();
  const fields = (data.fields ?? {}) as Record<string, unknown>;

  // Required fields check
  const requiredFields = REQUIRED_FIELDS[entryType] ?? [];
  const missingFields = requiredFields.filter(
    (f) => !(f in fields),
  );
  const presentCount = requiredFields.length - missingFields.length;
  const requiredPts = requiredFields.length > 0
    ? Math.round((presentCount / requiredFields.length) * 10)
    : 10;
  checks.push(
    proportionalCheck(
      "required_fields_present",
      requiredPts,
      10,
      missingFields.length > 0 ? `Missing: ${missingFields.join(", ")}` : undefined,
    ),
  );

  // No extra fields
  const knownFields = new Set(requiredFields);
  const extraFields = Object.keys(fields).filter((f) => !knownFields.has(f));
  checks.push(
    binaryCheck(
      "no_extra_fields",
      extraFields.length === 0,
      5,
      extraFields.length > 0 ? `Extra: ${extraFields.join(", ")}` : undefined,
    ),
  );

  // Correct entry type returned
  const expectedType = testCase.entryType === "auto" ? entryType : testCase.entryType;
  const typeCorrect = entryType === expectedType || testCase.entryType === "auto";
  checks.push(
    binaryCheck(
      "correct_entry_type",
      typeCorrect,
      5,
      !typeCorrect ? `Got ${entryType}, expected ${expectedType}` : undefined,
    ),
  );

  // ── 2. Content rules (40 pts) ─────────────────────────────────────────────

  // Em dash check (zero tolerance)
  const hasEmDash = hasEmDashAnywhere(data);
  checks.push(
    binaryCheck("no_em_dashes", !hasEmDash, 15, hasEmDash ? "Em dash found in output" : undefined),
  );

  // Banned phrases
  const bannedFound = bannedPhrasesInObj(data);
  const bannedPts = Math.max(0, 15 - bannedFound.length * 3);
  checks.push(
    proportionalCheck(
      "no_banned_phrases",
      bannedPts,
      15,
      bannedFound.length > 0 ? `Found: ${bannedFound.slice(0, 3).join("; ")}` : undefined,
    ),
  );

  // All string fields non-empty
  const stringFields = Object.entries(fields).filter(([, v]) => typeof v === "string");
  const emptyFields = stringFields.filter(([, v]) => (v as string).trim().length === 0);
  const nonEmptyPts = stringFields.length > 0
    ? Math.round(((stringFields.length - emptyFields.length) / stringFields.length) * 10)
    : 10;
  checks.push(
    proportionalCheck(
      "all_fields_non_empty",
      nonEmptyPts,
      10,
      emptyFields.length > 0 ? `Empty: ${emptyFields.map(([k]) => k).join(", ")}` : undefined,
    ),
  );

  // ── 3. Word count compliance (25 pts) ─────────────────────────────────────

  const length = testCase.length;

  if (entryType === "cip_assessment") {
    const comments = String(fields.trainee_comments ?? "");
    const range = CIP_WORD_RANGES[length] ?? CIP_WORD_RANGES.standard;
    const wc = countWords(comments);
    const pc = countParagraphs(comments);

    const wcInRange = wordCountInRange(comments, range.min, range.max);
    const wcNear = wc >= range.min - 20 && wc <= range.max + 20;
    const wcPts = wcInRange ? 20 : wcNear ? 10 : 0;
    checks.push(
      proportionalCheck(
        "cip_word_count",
        wcPts,
        20,
        `${wc} words (target ${range.min}–${range.max})`,
      ),
    );
    checks.push(
      binaryCheck(
        "cip_five_paragraphs",
        pc === 5,
        5,
        `${pc} paragraph(s) (expected 5)`,
      ),
    );
  } else {
    // Score narrative fields
    const narrativeFields = NARRATIVE_FIELDS[entryType] ?? [];
    const fieldRange = FIELD_WORD_RANGES[length] ?? FIELD_WORD_RANGES.standard;

    if (narrativeFields.length === 0) {
      checks.push(proportionalCheck("word_count_compliance", 25, 25, "no narrative fields defined"));
    } else {
      let totalPts = 0;
      const fieldDetails: string[] = [];

      for (const fieldName of narrativeFields) {
        const val = String(fields[fieldName] ?? "");
        const wc = countWords(val);
        const inRange = wordCountInRange(val, fieldRange.min, fieldRange.max);
        const nearRange = wc >= fieldRange.min - 30 && wc <= fieldRange.max + 30;
        const fieldPts = inRange ? 1 : nearRange ? 0.5 : 0;
        totalPts += fieldPts;
        fieldDetails.push(`${fieldName}:${wc}w`);
      }

      const earnedPts = Math.round((totalPts / narrativeFields.length) * 25);
      checks.push(
        proportionalCheck(
          "word_count_compliance",
          earnedPts,
          25,
          fieldDetails.join(", "),
        ),
      );
    }

    // Special: other_evidence evidence_type must be a valid code
    if (entryType === "other_evidence") {
      const evidenceType = String(fields.evidence_type ?? "");
      checks.push(
        binaryCheck(
          "valid_evidence_type",
          VALID_EVIDENCE_TYPES.has(evidenceType),
          0, // Bonus check — informational only, no points deducted
          `evidence_type="${evidenceType}"`,
        ),
      );
    }
  }

  const score = sumScore(checks);
  return { checks, score, maxScore: sumMax(checks) };
}
