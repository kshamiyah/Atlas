export const STAGE_ORDER = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7"] as const;

export type StageName = (typeof STAGE_ORDER)[number];
export type StageScope = "BAND_ST1_2" | "BAND_ST3_5" | "BAND_ST6_7";
export type StageGroup = "Stage One" | "Stage Two" | "Stage Three";

export const STAGE_SCOPE_TO_STAGES: Record<StageScope, readonly StageName[]> = {
  BAND_ST1_2: ["ST1", "ST2"],
  BAND_ST3_5: ["ST3", "ST4", "ST5"],
  BAND_ST6_7: ["ST6", "ST7"],
};

export const STAGE_SCOPE_TO_GROUP: Record<StageScope, StageGroup> = {
  BAND_ST1_2: "Stage One",
  BAND_ST3_5: "Stage Two",
  BAND_ST6_7: "Stage Three",
};

export const STAGE_GROUP_TO_SCOPE: Record<StageGroup, StageScope> = {
  "Stage One": "BAND_ST1_2",
  "Stage Two": "BAND_ST3_5",
  "Stage Three": "BAND_ST6_7",
};

const STAGE_NAME_TO_GROUP: Record<StageName, StageGroup> = {
  ST1: "Stage One",
  ST2: "Stage One",
  ST3: "Stage Two",
  ST4: "Stage Two",
  ST5: "Stage Two",
  ST6: "Stage Three",
  ST7: "Stage Three",
};

export type ResolvedStageContext = {
  selectedStageId: string | null;
  selectedStageName: StageName | null;
  selectedStageGroup: StageGroup | null;
  curriculumBandId: StageScope | null;
  curriculumBandLabel: StageGroup | null;
  curriculumStageNames: readonly StageName[];
  curriculumStageIds: string[];
  checkpointStageId: string | null;
  checkpointStageName: StageName | null;
};

export function normalizeStageName(value: string | null | undefined): StageName | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;

  if ((STAGE_ORDER as readonly string[]).includes(raw)) {
    return raw as StageName;
  }

  const matched = raw.match(/\bST\s*([1-7])\b/i);
  if (!matched) return null;

  const stage = `ST${matched[1]}`;
  return (STAGE_ORDER as readonly string[]).includes(stage)
    ? (stage as StageName)
    : null;
}

export function stageRank(stage: string): number {
  const normalized = normalizeStageName(stage);
  if (!normalized) return 0;
  return STAGE_ORDER.indexOf(normalized) + 1;
}

export function findStageIdByName(
  stageRows: Array<{ id: string; name: string }>,
  stageName: string | null | undefined,
): string | null {
  const normalized = normalizeStageName(stageName);
  if (!normalized) return null;
  const row = stageRows.find((entry) => normalizeStageName(entry.name) === normalized);
  return row?.id ?? null;
}

export function getStageGroupForStage(stage: string | null | undefined): StageGroup | null {
  const normalized = normalizeStageName(stage);
  if (!normalized) return null;
  return STAGE_NAME_TO_GROUP[normalized];
}

export function getStageScopeForStage(stage: string | null | undefined): StageScope | null {
  const group = getStageGroupForStage(stage);
  if (!group) return null;
  return STAGE_GROUP_TO_SCOPE[group];
}

export function getStageNamesForGroup(
  group: StageGroup | null | undefined,
): readonly StageName[] {
  if (!group) return [];
  const scope = STAGE_GROUP_TO_SCOPE[group];
  return STAGE_SCOPE_TO_STAGES[scope];
}

export function stagesUpTo(stage: string): Set<string> {
  const rank = stageRank(stage);
  return new Set(STAGE_ORDER.filter((name) => stageRank(name) <= rank));
}

export function stagesForScope(scope: string | null | undefined): readonly StageName[] | null {
  if (!scope) return null;
  if (scope in STAGE_SCOPE_TO_STAGES) {
    return STAGE_SCOPE_TO_STAGES[scope as StageScope];
  }
  return null;
}

export function resolveStageContext(params: {
  selectedStageId?: string | null;
  selectedStageName?: string | null;
  stageRows?: Array<{ id: string; name: string; stage_group?: string | null }>;
}): ResolvedStageContext {
  const stageRows = params.stageRows ?? [];
  const selectedStageName =
    normalizeStageName(params.selectedStageName) ??
    normalizeStageName(
      params.selectedStageId
        ? stageRows.find((row) => row.id === params.selectedStageId)?.name ?? null
        : null,
    );
  const selectedStageGroup = getStageGroupForStage(selectedStageName);
  const curriculumBandId = selectedStageName
    ? getStageScopeForStage(selectedStageName)
    : null;
  const curriculumStageNames = curriculumBandId
    ? STAGE_SCOPE_TO_STAGES[curriculumBandId]
    : [];
  const curriculumStageIds = curriculumStageNames
    .map((stageName) => stageRows.find((row) => normalizeStageName(row.name) === stageName)?.id)
    .filter((id): id is string => Boolean(id));

  return {
    selectedStageId: params.selectedStageId ?? null,
    selectedStageName,
    selectedStageGroup,
    curriculumBandId,
    curriculumBandLabel: selectedStageGroup,
    curriculumStageNames,
    curriculumStageIds,
    checkpointStageId: params.selectedStageId ?? null,
    checkpointStageName: selectedStageName,
  };
}
