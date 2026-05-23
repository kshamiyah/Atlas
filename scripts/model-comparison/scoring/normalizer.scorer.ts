import {
  binaryCheck,
  proportionalCheck,
  sumScore,
  sumMax,
  countWords,
  countParagraphs,
  hasEmDash,
  hasBannedPhrase,
} from "./shared";
import type { CheckResult, NormalizerTestCase } from "../types";

export interface NormalizerScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreNormalizer(
  testCase: NormalizerTestCase,
  parsed: unknown,
  parseSuccess: boolean,
): NormalizerScoreResult {
  const checks: CheckResult[] = [];

  // ── 1. Format integrity (20 pts) ─────────────────────────────────────────

  checks.push(binaryCheck("valid_json", parseSuccess, 15));

  if (!parseSuccess) {
    checks.push(binaryCheck("trainee_comments_present", false, 5, "skipped"));
    checks.push(binaryCheck("five_paragraphs", false, 30, "skipped"));
    checks.push(proportionalCheck("word_count_in_range", 0, 30, "skipped"));
    checks.push(binaryCheck("no_em_dashes", false, 10, "skipped"));
    checks.push(binaryCheck("no_banned_phrases", false, 10, "skipped"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  const data = parsed as Record<string, unknown>;
  const comments = String(data.trainee_comments ?? "").trim();

  checks.push(
    binaryCheck("trainee_comments_present", comments.length > 0, 5),
  );

  if (!comments) {
    checks.push(binaryCheck("five_paragraphs", false, 30, "empty output"));
    checks.push(proportionalCheck("word_count_in_range", 0, 30, "empty output"));
    checks.push(binaryCheck("no_em_dashes", false, 10, "empty output"));
    checks.push(binaryCheck("no_banned_phrases", false, 10, "empty output"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  // ── 2. Constraint compliance (60 pts) ─────────────────────────────────────

  const pc = countParagraphs(comments);
  checks.push(
    binaryCheck(
      "five_paragraphs",
      pc === 5,
      30,
      `${pc} paragraph(s) (expected exactly 5)`,
    ),
  );

  const wc = countWords(comments);
  const { min, max } = testCase.targetRange;
  let wcPts: number;
  let wcDetail: string;

  if (wc >= min && wc <= max) {
    wcPts = 30;
    wcDetail = `${wc} words — in range [${min}–${max}]`;
  } else if (wc >= min - 10 && wc <= max + 10) {
    wcPts = 20;
    wcDetail = `${wc} words — near range [${min}–${max}]`;
  } else if (wc >= min - 25 && wc <= max + 25) {
    wcPts = 10;
    wcDetail = `${wc} words — outside range [${min}–${max}] by ${Math.min(Math.abs(wc - min), Math.abs(wc - max))}`;
  } else {
    wcPts = 0;
    wcDetail = `${wc} words — well outside range [${min}–${max}]`;
  }

  checks.push(proportionalCheck("word_count_in_range", wcPts, 30, wcDetail));

  // ── 3. Content rules (20 pts) ─────────────────────────────────────────────

  checks.push(
    binaryCheck(
      "no_em_dashes",
      !hasEmDash(comments),
      10,
      hasEmDash(comments) ? "Em dash found in output" : undefined,
    ),
  );

  // Check for banned phrases NOT present in the original input (introduced by model)
  const originalLower = testCase.traineeComments.toLowerCase();
  const outputPhrasesFound = hasBannedPhrase(comments);
  const newBannedPhrases = outputPhrasesFound.filter(
    (p) => !originalLower.includes(p.toLowerCase()),
  );
  checks.push(
    binaryCheck(
      "no_new_banned_phrases",
      newBannedPhrases.length === 0,
      10,
      newBannedPhrases.length > 0
        ? `Introduced: ${newBannedPhrases.slice(0, 2).join("; ")}`
        : undefined,
    ),
  );

  return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
}
