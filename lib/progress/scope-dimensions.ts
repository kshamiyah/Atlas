import {
  getStageGroupForStage,
  getStageScopeForStage,
  normalizeStageName,
  STAGE_SCOPE_TO_GROUP,
  type StageName,
  type StageScope,
} from "@/lib/profile/stage";

/** Curriculum band (CiPs, key skills, descriptors) for a training year. */
export function curriculumBandScopeForYear(
  year: StageName | string | null | undefined,
): StageScope | null {
  const normalized = normalizeStageName(year);
  if (!normalized) return null;
  return getStageScopeForStage(normalized);
}

export function curriculumBandLabelForYear(
  year: StageName | string | null | undefined,
): string | null {
  const group = getStageGroupForStage(year);
  return group;
}

export function curriculumBandLabelForScope(
  scope: StageScope | string | null | undefined,
): string | null {
  if (!scope || !(scope in STAGE_SCOPE_TO_GROUP)) return null;
  return STAGE_SCOPE_TO_GROUP[scope as StageScope];
}

/** Training year used for checkpoint / formal-requirement expectations. */
export function resolveCheckpointStageForProgress(
  viewingYear: StageName | string | null | undefined,
  profileStage: StageName | string | null | undefined,
): StageName | null {
  return normalizeStageName(viewingYear) ?? normalizeStageName(profileStage) ?? null;
}
