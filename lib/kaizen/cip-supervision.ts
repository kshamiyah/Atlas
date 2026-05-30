import { SUPERVISION_LEVELS } from "@/lib/constants/curriculum-ids";

export const CLINICAL_CIP_NUMBERS = [9, 10, 11, 12] as const;

export type ClinicalCipNumber = (typeof CLINICAL_CIP_NUMBERS)[number];

/** Matches `stage_requirements` seed for clinical CiPs. */
export const CLINICAL_CIP_EXPECTED_ENTRUSTMENT: Record<
  ClinicalCipNumber,
  Record<string, number>
> = {
  9: { ST1: 1, ST2: 2, ST3: 3, ST4: 3, ST5: 4, ST6: 4, ST7: 5 },
  10: { ST1: 1, ST2: 2, ST3: 3, ST4: 3, ST5: 4, ST6: 4, ST7: 5 },
  11: { ST1: 1, ST2: 2, ST3: 2, ST4: 2, ST5: 3, ST6: 4, ST7: 5 },
  12: { ST1: 1, ST2: 2, ST3: 2, ST4: 2, ST5: 3, ST6: 4, ST7: 5 },
};

export function isClinicalCip(cipNumber: number | null | undefined): cipNumber is ClinicalCipNumber {
  return (
    typeof cipNumber === "number" &&
    CLINICAL_CIP_NUMBERS.includes(cipNumber as ClinicalCipNumber)
  );
}

export function getExpectedClinicalEntrustment(
  cipNumber: number,
  stage: string,
): number | null {
  if (!isClinicalCip(cipNumber)) return null;
  return CLINICAL_CIP_EXPECTED_ENTRUSTMENT[cipNumber][stage] ?? null;
}

export function formatEntrustmentLevel(level: number | null | undefined): string | null {
  if (level == null) return null;
  const match = SUPERVISION_LEVELS.find((entry) => entry.level === level);
  if (match) return `Level ${level}: ${match.descriptor}`;
  return `Level ${level}`;
}

export function formatMeetsExpectations(value: boolean | null | undefined): string | null {
  if (value === true) return "Meeting expectations";
  if (value === false) return "Below expectations";
  return null;
}

export function parseEntrustmentLevel(value: unknown): number | null {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const levelMatch = text.match(/level\s*(\d)\s*[:\-—]?\s*(?:entrusted|$)/i);
  if (levelMatch) {
    const level = Number.parseInt(levelMatch[1], 10);
    if (level >= 1 && level <= 5) return level;
  }

  if (/^(\d)\s*[:\-—]/.test(text)) {
    const level = Number.parseInt(text, 10);
    if (level >= 1 && level <= 5) return level;
  }

  return null;
}

export function parseMeetsExpectations(value: unknown): boolean | null {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return null;

  if (text === "605" || /meeting expectations|meeting the expected|above expectations|well above|exceed/.test(text)) {
    return true;
  }
  if (text === "604" || /below expectations|not meeting|does not meet/.test(text)) {
    return false;
  }

  return null;
}

export type SupervisionRequirementRow = {
  cip_number: number;
  stage: string;
  expected_level: number;
};

export function buildClinicalEntrustmentExpectations(
  rows: SupervisionRequirementRow[],
): Map<number, Map<string, number>> {
  const map = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (!isClinicalCip(row.cip_number)) continue;
    if (!map.has(row.cip_number)) map.set(row.cip_number, new Map());
    map.get(row.cip_number)!.set(row.stage, row.expected_level);
  }
  return map;
}

export function resolveExpectedClinicalEntrustment(
  expectations: Map<number, Map<string, number>>,
  cipNumber: number,
  stage: string,
): number | null {
  return expectations.get(cipNumber)?.get(stage) ?? getExpectedClinicalEntrustment(cipNumber, stage);
}

export type CipAssessmentJudgmentInput = {
  cip_number: number | null;
  status?: string | null;
  trainee_entrustment?: number | null;
  es_entrustment?: number | null;
  es_meets_expectations?: boolean | null;
  trainee_level?: number | null;
  es_level?: number | null;
  es_comments?: string | null;
  trainee_comments?: string | null;
  es_agrees?: boolean | null;
};

export function resolveAssessmentJudgments(
  record: CipAssessmentJudgmentInput,
): {
  trainee_entrustment: number | null;
  es_entrustment: number | null;
  es_meets_expectations: boolean | null;
} {
  const clinical = isClinicalCip(record.cip_number);

  const trainee_entrustment = clinical
    ? normalizeEntrustment(record.trainee_entrustment ?? record.trainee_level)
    : null;

  const es_entrustment = clinical
    ? normalizeEntrustment(record.es_entrustment ?? (record.es_level != null && record.es_level >= 1 && record.es_level <= 5 ? record.es_level : null))
    : null;

  let es_meets_expectations =
    typeof record.es_meets_expectations === "boolean" ? record.es_meets_expectations : null;

  if (es_meets_expectations == null && !clinical && record.es_level != null) {
    es_meets_expectations = record.es_level >= 1;
  }

  if (es_meets_expectations == null && clinical && record.es_level != null && (record.es_level === 0 || record.es_level === 1)) {
    es_meets_expectations = record.es_level >= 1;
  }

  return { trainee_entrustment, es_entrustment, es_meets_expectations };
}

function normalizeEntrustment(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value >= 1 && value <= 5) return value;
  return null;
}

export function isCipAssessmentComplete(record: CipAssessmentJudgmentInput): boolean {
  const normalizedStatus = String(record.status ?? "").trim().toLowerCase();
  const judgments = resolveAssessmentJudgments(record);

  if (isClinicalCip(record.cip_number)) {
    const hasSupervisorJudgment =
      judgments.es_meets_expectations != null && judgments.es_entrustment != null;
    if (/pending|awaiting|requested|in progress|draft|incomplete/.test(normalizedStatus)) {
      return hasSupervisorJudgment;
    }
    if (normalizedStatus === "complete") {
      return hasSupervisorJudgment;
    }
    return hasSupervisorJudgment;
  }

  if (normalizedStatus === "complete") return true;

  return (
    judgments.es_meets_expectations != null ||
    Boolean(record.es_comments?.trim() || record.trainee_comments?.trim())
  );
}

export function formatCipJudgmentSummary(record: CipAssessmentJudgmentInput): {
  es_entrustment: string | null;
  es_meets_expectations: string | null;
  trainee_entrustment: string | null;
} {
  const judgments = resolveAssessmentJudgments(record);
  return {
    trainee_entrustment: isClinicalCip(record.cip_number)
      ? formatEntrustmentLevel(judgments.trainee_entrustment)
      : null,
    es_entrustment: isClinicalCip(record.cip_number)
      ? formatEntrustmentLevel(judgments.es_entrustment)
      : null,
    es_meets_expectations: formatMeetsExpectations(judgments.es_meets_expectations),
  };
}

export type CipEntrustmentEvaluation = {
  cipsBelowEntrustment: number[];
  cipsBelowExpectations: number[];
  entrustmentGap: number;
};

export function evaluateClinicalEntrustment(params: {
  assessments: CipAssessmentJudgmentInput[];
  stage: string;
  expectations?: Map<number, Map<string, number>>;
}): CipEntrustmentEvaluation {
  const { assessments, stage, expectations } = params;
  const cipsBelowEntrustment: number[] = [];
  const cipsBelowExpectations: number[] = [];
  let entrustmentGap = 0;

  for (const assessment of assessments) {
    const cipNumber = assessment.cip_number;
    if (cipNumber == null) continue;

    const judgments = resolveAssessmentJudgments(assessment);

    if (judgments.es_meets_expectations === false) {
      cipsBelowExpectations.push(cipNumber);
    }

    if (!isClinicalCip(cipNumber)) continue;

    const expected = expectations
      ? resolveExpectedClinicalEntrustment(expectations, cipNumber, stage)
      : getExpectedClinicalEntrustment(cipNumber, stage);

    if (expected == null || judgments.es_entrustment == null) continue;
    if (judgments.es_entrustment < expected) {
      cipsBelowEntrustment.push(cipNumber);
      entrustmentGap += expected - judgments.es_entrustment;
    }
  }

  return { cipsBelowEntrustment, cipsBelowExpectations, entrustmentGap };
}
