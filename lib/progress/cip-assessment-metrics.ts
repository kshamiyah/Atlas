import { TOTAL_CIP_COUNT } from "@/lib/kaizen/cip-assessment";
import {
  buildClinicalEntrustmentExpectations,
  formatCipJudgmentSummary,
  formatEntrustmentLevel,
  isClinicalCip,
  isCipAssessmentComplete,
  resolveAssessmentJudgments,
  resolveExpectedClinicalEntrustment,
  type CipAssessmentJudgmentInput,
  type SupervisionRequirementRow,
} from "@/lib/kaizen/cip-supervision";
import type {
  ProgressCheckpointType,
  ProgressCipAssessmentStatus,
  ProgressCipAssessmentSummary,
  ProgressKpiBlock,
  ProgressRagStatus,
} from "@/lib/types/progress";

export type { ProgressCipAssessmentStatus, ProgressCipAssessmentSummary };

export type CipAssessmentDbRow = CipAssessmentJudgmentInput & {
  date?: string | null;
};

type SupervisionRequirementQueryRow = {
  target_value: string;
  cips: { number: number } | { number: number }[] | null;
  stages: { name: string } | { name: string }[] | null;
};

export function parseSupervisionRequirementRows(
  rows: SupervisionRequirementQueryRow[],
): SupervisionRequirementRow[] {
  return rows
    .map((row) => {
      const cip = Array.isArray(row.cips) ? row.cips[0] : row.cips;
      const stage = Array.isArray(row.stages) ? row.stages[0] : row.stages;
      if (!cip?.number || !stage?.name) return null;
      const expected_level = Number.parseInt(row.target_value, 10);
      if (!Number.isInteger(expected_level)) return null;
      return {
        cip_number: cip.number,
        stage: stage.name,
        expected_level,
      };
    })
    .filter((row): row is SupervisionRequirementRow => row != null);
}

function assessmentCompletenessScore(row: CipAssessmentDbRow): number {
  const judgments = resolveAssessmentJudgments(row);
  let score = 0;
  if (isCipAssessmentComplete(row)) score += 100;
  if (judgments.es_entrustment != null) score += 20;
  if (judgments.es_meets_expectations != null) score += 10;
  if (judgments.trainee_entrustment != null) score += 5;
  return score;
}

export function indexBestCipAssessmentsByNumber(
  rows: CipAssessmentDbRow[],
): Map<number, CipAssessmentDbRow> {
  const byNumber = new Map<number, CipAssessmentDbRow>();

  for (const row of rows) {
    const cipNumber = row.cip_number;
    if (cipNumber == null || cipNumber < 1 || cipNumber > TOTAL_CIP_COUNT) continue;

    const existing = byNumber.get(cipNumber);
    if (!existing) {
      byNumber.set(cipNumber, row);
      continue;
    }

    const nextScore = assessmentCompletenessScore(row);
    const existingScore = assessmentCompletenessScore(existing);
    if (nextScore > existingScore) {
      byNumber.set(cipNumber, row);
      continue;
    }
    if (nextScore < existingScore) continue;

    const nextDate = row.date ?? "";
    const existingDate = existing.date ?? "";
    if (nextDate > existingDate) {
      byNumber.set(cipNumber, row);
    }
  }

  return byNumber;
}

function ragRank(status: ProgressRagStatus): number {
  if (status === "green") return 0;
  if (status === "amber") return 1;
  return 2;
}

export function assessmentStatusToRag(
  status: ProgressCipAssessmentStatus,
  checkpointType: ProgressCheckpointType,
): ProgressRagStatus {
  switch (status) {
    case "on_track":
      return "green";
    case "pending_entrustment":
      return "amber";
    case "missing":
      return checkpointType === "annual" ? "amber" : "red";
    case "below_expectations":
    case "below_entrustment":
      return "red";
  }
}

export function mergeEvidenceAndAssessmentRag(
  evidenceStatus: ProgressRagStatus,
  assessmentStatus: ProgressCipAssessmentStatus,
  checkpointType: ProgressCheckpointType,
): ProgressRagStatus {
  const assessmentRag = assessmentStatusToRag(assessmentStatus, checkpointType);
  return ragRank(evidenceStatus) >= ragRank(assessmentRag) ? evidenceStatus : assessmentRag;
}

export function summarizeCipAssessment(params: {
  cipNumber: number;
  record: CipAssessmentDbRow | null | undefined;
  stage: string | null;
  expectations: Map<number, Map<string, number>>;
}): ProgressCipAssessmentSummary {
  const { cipNumber, record, stage, expectations } = params;
  const clinical = isClinicalCip(cipNumber);
  const expectedEntrustment =
    clinical && stage
      ? resolveExpectedClinicalEntrustment(expectations, cipNumber, stage)
      : null;

  if (!record) {
    return {
      status: "missing",
      status_reason: "No CiP assessment recorded for this ARCP cycle.",
      is_complete: false,
      is_clinical: clinical,
      expected_entrustment: expectedEntrustment,
      expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
      es_entrustment: null,
      es_entrustment_label: null,
      es_meets_expectations: null,
      es_meets_expectations_label: null,
      trainee_entrustment: null,
      trainee_entrustment_label: null,
      assessment_date: null,
      record_status: null,
    };
  }

  const judgments = resolveAssessmentJudgments(record);
  const labels = formatCipJudgmentSummary(record);
  const isComplete = isCipAssessmentComplete(record);

  if (!isComplete) {
    return {
      status: "missing",
      status_reason: "CiP assessment started but supervisor judgment is not yet recorded.",
      is_complete: false,
      is_clinical: clinical,
      expected_entrustment: expectedEntrustment,
      expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
      es_entrustment: judgments.es_entrustment,
      es_entrustment_label: labels.es_entrustment,
      es_meets_expectations: judgments.es_meets_expectations,
      es_meets_expectations_label: labels.es_meets_expectations,
      trainee_entrustment: judgments.trainee_entrustment,
      trainee_entrustment_label: labels.trainee_entrustment,
      assessment_date: record.date ?? null,
      record_status: record.status ?? null,
    };
  }

  if (judgments.es_meets_expectations === false) {
    return {
      status: "below_expectations",
      status_reason: "Educational Supervisor rated this CiP below expectations.",
      is_complete: true,
      is_clinical: clinical,
      expected_entrustment: expectedEntrustment,
      expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
      es_entrustment: judgments.es_entrustment,
      es_entrustment_label: labels.es_entrustment,
      es_meets_expectations: judgments.es_meets_expectations,
      es_meets_expectations_label: labels.es_meets_expectations,
      trainee_entrustment: judgments.trainee_entrustment,
      trainee_entrustment_label: labels.trainee_entrustment,
      assessment_date: record.date ?? null,
      record_status: record.status ?? null,
    };
  }

  if (
    clinical &&
    expectedEntrustment != null &&
    judgments.es_entrustment != null &&
    judgments.es_entrustment < expectedEntrustment
  ) {
    return {
      status: "below_entrustment",
      status_reason: `ES entrustment is below the ${stage ?? "stage"} expectation (Level ${expectedEntrustment}).`,
      is_complete: true,
      is_clinical: clinical,
      expected_entrustment: expectedEntrustment,
      expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
      es_entrustment: judgments.es_entrustment,
      es_entrustment_label: labels.es_entrustment,
      es_meets_expectations: judgments.es_meets_expectations,
      es_meets_expectations_label: labels.es_meets_expectations,
      trainee_entrustment: judgments.trainee_entrustment,
      trainee_entrustment_label: labels.trainee_entrustment,
      assessment_date: record.date ?? null,
      record_status: record.status ?? null,
    };
  }

  if (clinical && judgments.es_entrustment == null) {
    return {
      status: "pending_entrustment",
      status_reason:
        stage && expectedEntrustment != null
          ? `Meeting expectations recorded; ES entrustment level for ${stage} (expected Level ${expectedEntrustment}) not yet synced.`
          : "Meeting expectations recorded; ES entrustment level not yet synced.",
      is_complete: true,
      is_clinical: clinical,
      expected_entrustment: expectedEntrustment,
      expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
      es_entrustment: judgments.es_entrustment,
      es_entrustment_label: labels.es_entrustment,
      es_meets_expectations: judgments.es_meets_expectations,
      es_meets_expectations_label: labels.es_meets_expectations,
      trainee_entrustment: judgments.trainee_entrustment,
      trainee_entrustment_label: labels.trainee_entrustment,
      assessment_date: record.date ?? null,
      record_status: record.status ?? null,
    };
  }

  const onTrackReason = clinical
    ? stage && expectedEntrustment != null && judgments.es_entrustment != null
      ? `ES entrustment meets ${stage} expectation (Level ${expectedEntrustment}).`
      : "Supervisor judgment recorded and meeting expectations."
    : "Supervisor judgment recorded and meeting expectations.";

  return {
    status: "on_track",
    status_reason: onTrackReason,
    is_complete: true,
    is_clinical: clinical,
    expected_entrustment: expectedEntrustment,
    expected_entrustment_label: formatEntrustmentLevel(expectedEntrustment),
    es_entrustment: judgments.es_entrustment,
    es_entrustment_label: labels.es_entrustment,
    es_meets_expectations: judgments.es_meets_expectations,
    es_meets_expectations_label: labels.es_meets_expectations,
    trainee_entrustment: judgments.trainee_entrustment,
    trainee_entrustment_label: labels.trainee_entrustment,
    assessment_date: record.date ?? null,
    record_status: record.status ?? null,
  };
}

function kpiBlock(covered: number, total: number): ProgressKpiBlock {
  if (total <= 0) {
    return { covered, total, pct: 0 };
  }
  return {
    covered,
    total,
    pct: Math.round((covered / total) * 100),
  };
}

export function computeCipAssessmentKpis(params: {
  cipNumbers: number[];
  assessmentsByNumber: Map<number, CipAssessmentDbRow>;
  stage: string | null;
  expectations: Map<number, Map<string, number>>;
}): {
  complete: ProgressKpiBlock;
  on_track: ProgressKpiBlock;
  byNumber: Map<number, ProgressCipAssessmentSummary>;
} {
  const { cipNumbers, assessmentsByNumber, stage, expectations } = params;
  const total = cipNumbers.length > 0 ? cipNumbers.length : TOTAL_CIP_COUNT;
  let completeCount = 0;
  let onTrackCount = 0;
  const byNumber = new Map<number, ProgressCipAssessmentSummary>();

  for (const cipNumber of cipNumbers.length > 0 ? cipNumbers : Array.from({ length: TOTAL_CIP_COUNT }, (_, i) => i + 1)) {
    const summary = summarizeCipAssessment({
      cipNumber,
      record: assessmentsByNumber.get(cipNumber) ?? null,
      stage,
      expectations,
    });
    byNumber.set(cipNumber, summary);
    if (summary.is_complete) completeCount += 1;
    if (summary.status === "on_track") onTrackCount += 1;
  }

  return {
    complete: kpiBlock(completeCount, total),
    on_track: kpiBlock(onTrackCount, total),
    byNumber,
  };
}

export function buildClinicalEntrustmentExpectationsFromRows(
  rows: SupervisionRequirementQueryRow[],
): Map<number, Map<string, number>> {
  return buildClinicalEntrustmentExpectations(parseSupervisionRequirementRows(rows));
}
