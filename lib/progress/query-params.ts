import type { ProgressSummaryScope } from "../types/progress";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ALLOWED_STAGE_SCOPES = new Set(["BAND_ST1_2", "BAND_ST3_5", "BAND_ST6_7"]);
export const ALLOWED_STAGE_GROUPS = new Set(["Stage One", "Stage Two", "Stage Three"]);

export type KeySkillsSortMode = "impact" | "recent" | "skill_number";

export function parseStageScopeParam(raw: string | null): { value: string | null; error: string | null } {
  if (raw == null || raw === "") {
    return { value: null, error: null };
  }
  if (!ALLOWED_STAGE_SCOPES.has(raw)) {
    return {
      value: null,
      error: "Invalid stage_scope (expected BAND_ST1_2, BAND_ST3_5, or BAND_ST6_7)",
    };
  }
  return { value: raw, error: null };
}

export function parseStageGroupParam(raw: string | null): { value: string | null; error: string | null } {
  if (raw == null || raw === "") {
    return { value: null, error: null };
  }
  if (!ALLOWED_STAGE_GROUPS.has(raw)) {
    return {
      value: null,
      error: "Invalid stage_group (expected Stage One, Stage Two, or Stage Three)",
    };
  }
  return { value: raw, error: null };
}

export function parseCipParam(raw: string | null): { value: number | null; error: string | null } {
  if (raw == null || raw === "") {
    return { value: null, error: null };
  }
  if (!/^\d+$/.test(raw)) {
    return { value: null, error: "Invalid cip (expected integer 1–14)" };
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 14) {
    return { value: null, error: "Invalid cip (expected integer 1–14)" };
  }
  return { value: n, error: null };
}

export function parseIsoDateParam(
  raw: string | null,
  label: "date_from" | "date_to",
): { value: string | null; error: string | null } {
  if (raw == null || raw === "") {
    return { value: null, error: null };
  }
  if (!ISO_DATE_RE.test(raw)) {
    return { value: null, error: `Invalid ${label} (expected YYYY-MM-DD)` };
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    return { value: null, error: `Invalid ${label} (expected YYYY-MM-DD)` };
  }
  return { value: raw, error: null };
}

export type ParsedProgressScope = {
  scopeEcho: ProgressSummaryScope;
  stageScope: string | null;
  stageGroup: string | null;
  cipNumber: number | null;
};

export function parseProgressScopeFromUrl(url: URL): ParsedProgressScope | { error: string } {
  const stageIdParam = url.searchParams.get("stage_id");
  const stageScopeParam = parseStageScopeParam(url.searchParams.get("stage_scope"));
  if (stageScopeParam.error) return { error: stageScopeParam.error };
  const stageGroupParam = parseStageGroupParam(url.searchParams.get("stage_group"));
  if (stageGroupParam.error) return { error: stageGroupParam.error };
  const cipParam = parseCipParam(url.searchParams.get("cip"));
  if (cipParam.error) return { error: cipParam.error };
  const dateFromParam = parseIsoDateParam(url.searchParams.get("date_from"), "date_from");
  if (dateFromParam.error) return { error: dateFromParam.error };
  const dateToParam = parseIsoDateParam(url.searchParams.get("date_to"), "date_to");
  if (dateToParam.error) return { error: dateToParam.error };
  if (
    dateFromParam.value &&
    dateToParam.value &&
    dateFromParam.value > dateToParam.value
  ) {
    return { error: "Invalid date range (date_from must be on or before date_to)" };
  }

  return {
    scopeEcho: {
      stage_id: stageIdParam && stageIdParam.length > 0 ? stageIdParam : null,
      date_from: dateFromParam.value,
      date_to: dateToParam.value,
      cip: cipParam.value,
    },
    stageScope: stageScopeParam.value,
    stageGroup: stageGroupParam.value,
    cipNumber: cipParam.value,
  };
}

export function validateStageIdInCatalog(
  stageId: string | null,
  stageRows: Array<{ id: string }>,
): string | null {
  if (!stageId) return null;
  const ok = stageRows.some((r) => r.id === stageId);
  return ok ? null : "Invalid stage_id (not found)";
}

function truthyFlag(raw: string | null): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type ParsedKeySkillsListParams = {
  gapsOnly: boolean;
  confirmedOnly: boolean;
  sort: KeySkillsSortMode;
};

export function parseKeySkillsListParams(url: URL): ParsedKeySkillsListParams | { error: string } {
  const gapsOnly = truthyFlag(url.searchParams.get("gaps_only"));
  const confirmedOnly = truthyFlag(url.searchParams.get("confirmed_only"));
  if (gapsOnly && confirmedOnly) {
    return { error: "Invalid filters (gaps_only and confirmed_only cannot both be set)" };
  }
  const sortRaw = url.searchParams.get("sort");
  if (sortRaw == null || sortRaw === "") {
    return { gapsOnly, confirmedOnly, sort: "skill_number" };
  }
  if (sortRaw === "impact" || sortRaw === "recent" || sortRaw === "skill_number") {
    return { gapsOnly, confirmedOnly, sort: sortRaw };
  }
  return { error: "Invalid sort (expected impact, recent, or skill_number)" };
}

export type DescriptorsSortMode = "impact" | "recent" | "curricular";

export type ParsedDescriptorsListParams = {
  gapsOnly: boolean;
  coveredOnly: boolean;
  sort: DescriptorsSortMode;
};

/** Uses descriptor_* param names so key-skills tab gaps_only/sort never clash. */
export function parseDescriptorsListParams(url: URL): ParsedDescriptorsListParams | { error: string } {
  const gapsOnly = truthyFlag(url.searchParams.get("descriptor_gaps_only"));
  const coveredOnly = truthyFlag(url.searchParams.get("descriptor_covered_only"));
  if (gapsOnly && coveredOnly) {
    return {
      error: "Invalid filters (descriptor_gaps_only and descriptor_covered_only cannot both be set)",
    };
  }
  const sortRaw = url.searchParams.get("descriptor_sort");
  if (sortRaw == null || sortRaw === "") {
    return { gapsOnly, coveredOnly, sort: "curricular" };
  }
  if (sortRaw === "impact" || sortRaw === "recent" || sortRaw === "curricular") {
    return { gapsOnly, coveredOnly, sort: sortRaw };
  }
  return { error: "Invalid descriptor_sort (expected impact, recent, or curricular)" };
}
