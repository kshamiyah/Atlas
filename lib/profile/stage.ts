export const STAGE_ORDER = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7"] as const;

export type StageName = (typeof STAGE_ORDER)[number];
export type StageScope = "BAND_ST1_2" | "BAND_ST3_5" | "BAND_ST6_7";

export const STAGE_SCOPE_TO_STAGES: Record<StageScope, readonly StageName[]> = {
  BAND_ST1_2: ["ST1", "ST2"],
  BAND_ST3_5: ["ST3", "ST4", "ST5"],
  BAND_ST6_7: ["ST6", "ST7"],
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
