import { sanitizeWorkingPercent } from "./ltft";
import { normalizeStageName, type StageName } from "./stage";

export type StageWindow = {
  label: string;
  durationYears: number;
  completedYearsBeforeCurrent: number;
};

const STAGE_WINDOW_BY_STAGE: Record<StageName, StageWindow> = {
  ST1: {
    label: "Stage 1 (ST1-2)",
    durationYears: 2,
    completedYearsBeforeCurrent: 0,
  },
  ST2: {
    label: "Stage 1 (ST1-2)",
    durationYears: 2,
    completedYearsBeforeCurrent: 1,
  },
  ST3: {
    label: "Stage 2 (ST3-5)",
    durationYears: 3,
    completedYearsBeforeCurrent: 0,
  },
  ST4: {
    label: "Stage 2 (ST3-5)",
    durationYears: 3,
    completedYearsBeforeCurrent: 1,
  },
  ST5: {
    label: "Stage 2 (ST3-5)",
    durationYears: 3,
    completedYearsBeforeCurrent: 2,
  },
  ST6: {
    label: "Stage 3 (ST6-7)",
    durationYears: 2,
    completedYearsBeforeCurrent: 0,
  },
  ST7: {
    label: "Stage 3 (ST6-7)",
    durationYears: 2,
    completedYearsBeforeCurrent: 1,
  },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function getStageWindowForProgress(stageInput: string | null | undefined): StageWindow | null {
  const stage = normalizeStageName(stageInput);
  if (!stage) return null;
  return STAGE_WINDOW_BY_STAGE[stage];
}

export function calculateReviewYearElapsedFraction(
  daysToArcpCalendar: number | null | undefined,
): number | null {
  if (daysToArcpCalendar === null || daysToArcpCalendar === undefined) return null;
  if (!Number.isFinite(daysToArcpCalendar)) return null;
  return clamp((365 - daysToArcpCalendar) / 365, 0, 1);
}

export type KeySkillsProRataCheckpoint = {
  stageWindowLabel: string | null;
  stageElapsedFraction: number | null;
  reviewYearElapsedFraction: number | null;
  workingPercent: number;
  expectedByNowRaw: number | null;
  expectedByNowRounded: number | null;
  expectedByNowThreshold: number | null;
  expectedPctByNow: number | null;
  actualConfirmed: number;
  deltaToExpected: number | null;
  onTrack: boolean | null;
};

export type ProRataProgress = {
  expectedRaw: number | null;
  expectedRounded: number | null;
  expectedThreshold: number | null;
  expectedPct: number | null;
  deltaToExpected: number | null;
  onTrack: boolean | null;
};

export function calculateProRataProgress(params: {
  total: number;
  actual: number;
  stageElapsedFraction: number | null;
  workingPercentInput: unknown;
}): ProRataProgress {
  const { total, actual, stageElapsedFraction, workingPercentInput } = params;
  const workingPercent = sanitizeWorkingPercent(workingPercentInput);

  if (stageElapsedFraction === null) {
    return {
      expectedRaw: null,
      expectedRounded: null,
      expectedThreshold: null,
      expectedPct: null,
      deltaToExpected: null,
      onTrack: null,
    };
  }

  const expectedRaw = total * stageElapsedFraction * (workingPercent / 100);
  const expectedRounded = Number(expectedRaw.toFixed(1));
  const expectedThreshold = Math.ceil(expectedRaw);
  const expectedPct =
    total === 0 ? 0 : Number(((expectedRaw / total) * 100).toFixed(1));
  const deltaToExpected = Number((actual - expectedRaw).toFixed(1));
  const onTrack = actual >= expectedRaw;

  return {
    expectedRaw,
    expectedRounded,
    expectedThreshold,
    expectedPct,
    deltaToExpected,
    onTrack,
  };
}

export function calculateKeySkillsProRataCheckpoint(params: {
  totalSkills: number;
  confirmedSkills: number;
  currentStage: string | null | undefined;
  daysToArcpCalendar: number | null | undefined;
  workingPercentInput: unknown;
}): KeySkillsProRataCheckpoint {
  const { totalSkills, confirmedSkills, currentStage, daysToArcpCalendar, workingPercentInput } =
    params;
  const workingPercent = sanitizeWorkingPercent(workingPercentInput);

  const stageWindow = getStageWindowForProgress(currentStage);
  const reviewYearElapsedFraction = calculateReviewYearElapsedFraction(daysToArcpCalendar);

  const stageElapsedFraction =
    stageWindow && reviewYearElapsedFraction !== null
      ? clamp(
          (stageWindow.completedYearsBeforeCurrent + reviewYearElapsedFraction) /
            stageWindow.durationYears,
          0,
          1,
        )
      : null;

  const proRata = 
    calculateProRataProgress({
      total: totalSkills,
      actual: confirmedSkills,
      stageElapsedFraction,
      workingPercentInput: workingPercent,
    });

  return {
    stageWindowLabel: stageWindow?.label ?? null,
    stageElapsedFraction: stageElapsedFraction === null ? null : Number(stageElapsedFraction.toFixed(3)),
    reviewYearElapsedFraction:
      reviewYearElapsedFraction === null ? null : Number(reviewYearElapsedFraction.toFixed(3)),
    workingPercent,
    expectedByNowRaw: proRata.expectedRaw,
    expectedByNowRounded: proRata.expectedRounded,
    expectedByNowThreshold: proRata.expectedThreshold,
    expectedPctByNow: proRata.expectedPct,
    actualConfirmed: confirmedSkills,
    deltaToExpected: proRata.deltaToExpected,
    onTrack: proRata.onTrack,
  };
}
