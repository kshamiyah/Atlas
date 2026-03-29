import { sanitizeWorkingPercent } from "../profile/ltft";
import { normalizeStageName } from "../profile/stage";
import type {
  ProgressCheckpointType,
  ProgressCheckpointTypeLabel,
  ProgressRagStatus,
} from "../types/progress";

const WAYPOINT_STAGES = new Set(["ST2", "ST5"]);
const STAGE_END_STAGES = new Set(["ST7"]);

function pct(covered: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((covered / total) * 100);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function resolveProgressCheckpointType(
  currentStageInput: string | null | undefined,
): ProgressCheckpointType {
  const stage = normalizeStageName(currentStageInput);
  if (!stage) return "annual";
  if (WAYPOINT_STAGES.has(stage)) return "waypoint";
  if (STAGE_END_STAGES.has(stage)) return "stage_end";
  return "annual";
}

export function checkpointTypeLabel(
  checkpointType: ProgressCheckpointType,
): ProgressCheckpointTypeLabel {
  if (checkpointType === "waypoint") return "Waypoint ARCP";
  if (checkpointType === "stage_end") return "Stage-End ARCP";
  return "Annual ARCP";
}

export function classifyCipCheckpointStatus(params: {
  checkpointType: ProgressCheckpointType;
  confirmedSkills: number;
  totalSkills: number;
  coveredDescriptors: number;
  totalDescriptors: number;
  stageElapsedFraction: number | null;
  workingPercent: number;
}): {
  status: ProgressRagStatus;
  reason: string;
  expectedSkillsByNow: number | null;
} {
  const {
    checkpointType,
    confirmedSkills,
    totalSkills,
    coveredDescriptors,
    totalDescriptors,
    stageElapsedFraction,
    workingPercent,
  } = params;

  const safeWorkingPercent = sanitizeWorkingPercent(workingPercent);
  const descriptorPct = pct(coveredDescriptors, totalDescriptors);
  const skillPct = pct(confirmedSkills, totalSkills);

  if (checkpointType === "stage_end" || checkpointType === "waypoint") {
    if (skillPct >= 100 && descriptorPct >= 100) {
      return {
        status: "green",
        reason: "Stage-end standard met (100% key skills and descriptors).",
        expectedSkillsByNow: totalSkills,
      };
    }
    if (skillPct >= 90 && descriptorPct >= 90) {
      return {
        status: "amber",
        reason:
          "Near stage-end standard (target is 100% key skills and descriptors).",
        expectedSkillsByNow: totalSkills,
      };
    }
    return {
      status: "red",
      reason: "Below stage-end standard (requires full completion).",
      expectedSkillsByNow: totalSkills,
    };
  }

  if (totalSkills <= 0) {
    return {
      status: "green",
      reason: "No key skills in scope.",
      expectedSkillsByNow: null,
    };
  }

  const expectedSkillsByNow =
    stageElapsedFraction === null
      ? null
      : clamp(
          Math.ceil(totalSkills * stageElapsedFraction * (safeWorkingPercent / 100)),
          0,
          totalSkills,
        );

  if (expectedSkillsByNow === null) {
    if (skillPct >= 50 && descriptorPct >= 40) {
      return {
        status: "green",
        reason:
          "On annual trajectory from current evidence (set ARCP date for precise pacing).",
        expectedSkillsByNow: null,
      };
    }
    if (skillPct >= 30 || descriptorPct >= 25) {
      return {
        status: "amber",
        reason:
          "Partially on annual trajectory (set ARCP date for precise pacing).",
        expectedSkillsByNow: null,
      };
    }
    return {
      status: "red",
      reason: "Off annual trajectory from current evidence.",
      expectedSkillsByNow: null,
    };
  }

  const skillsVsExpectedPct =
    expectedSkillsByNow === 0
      ? 100
      : Math.round((confirmedSkills / expectedSkillsByNow) * 100);

  if (skillsVsExpectedPct >= 100 && descriptorPct >= 40) {
    return {
      status: "green",
      reason: `On annual trajectory (${confirmedSkills}/${expectedSkillsByNow} expected skills by now).`,
      expectedSkillsByNow,
    };
  }
  if (skillsVsExpectedPct >= 80 || descriptorPct >= 25) {
    return {
      status: "amber",
      reason: `Slightly below annual trajectory (${confirmedSkills}/${expectedSkillsByNow} expected skills by now).`,
      expectedSkillsByNow,
    };
  }
  return {
    status: "red",
    reason: `Off annual trajectory (${confirmedSkills}/${expectedSkillsByNow} expected skills by now).`,
    expectedSkillsByNow,
  };
}
