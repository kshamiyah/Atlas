import {
  binaryCheck,
  proportionalCheck,
  hasEmDash,
  hasBannedPhrase,
  countWords,
  wordCountInRange,
  sumScore,
  sumMax,
} from "./shared";
import { FIELD_WORD_RANGES } from "../config";
import type { CheckResult, FieldRegenTestCase } from "../types";

export interface FieldScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreFieldRegen(
  testCase: FieldRegenTestCase,
  parsed: unknown,
  _rawText: string,
  parseSuccess: boolean,
): FieldScoreResult {
  const checks: CheckResult[] = [];

  checks.push(
    binaryCheck("valid_json", parseSuccess, 15, parseSuccess ? undefined : "JSON parse failed"),
  );

  if (!parseSuccess) {
    checks.push(binaryCheck("has_value_field", false, 15, "skipped — parse failed"));
    checks.push(binaryCheck("value_non_empty", false, 10, "skipped — parse failed"));
    checks.push(proportionalCheck("word_count_compliance", 0, 30, "skipped — parse failed"));
    checks.push(binaryCheck("no_em_dashes", false, 15, "skipped — parse failed"));
    checks.push(proportionalCheck("no_banned_phrases", 0, 15, "skipped — parse failed"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  const data = parsed as Record<string, unknown>;
  const value = data.value;
  const isString = typeof value === "string";

  checks.push(
    binaryCheck(
      "has_value_field",
      isString,
      15,
      !isString ? `value field is ${typeof value}` : undefined,
    ),
  );

  const text = isString ? (value as string).trim() : "";
  checks.push(
    binaryCheck(
      "value_non_empty",
      text.length > 20,
      10,
      text.length <= 20 ? "value too short or empty" : undefined,
    ),
  );

  // Word count against length target
  const range = FIELD_WORD_RANGES[testCase.length] ?? FIELD_WORD_RANGES.standard;
  const wc = countWords(text);
  const inRange = wordCountInRange(text, range.min, range.max);
  const nearRange = wc >= range.min - 30 && wc <= range.max + 30;
  const wcPts = inRange ? 30 : nearRange ? 15 : 0;
  checks.push(
    proportionalCheck(
      "word_count_compliance",
      wcPts,
      30,
      `${wc} words (target ${range.min}–${range.max})`,
    ),
  );

  // No em-dashes
  const emDashFound = isString && hasEmDash(value as string);
  checks.push(
    binaryCheck("no_em_dashes", !emDashFound, 15, emDashFound ? "Em dash found" : undefined),
  );

  // No banned phrases
  const bannedFound = isString ? hasBannedPhrase(value as string) : [];
  const bannedPts = Math.max(0, 15 - bannedFound.length * 3);
  checks.push(
    proportionalCheck(
      "no_banned_phrases",
      bannedPts,
      15,
      bannedFound.length > 0 ? `Found: ${bannedFound.slice(0, 3).join("; ")}` : undefined,
    ),
  );

  return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
}
