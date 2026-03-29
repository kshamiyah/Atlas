import { stagesForScope } from "../profile/stage";
import {
  classifyCipCheckpointStatus,
} from "./checkpoint-readiness";
import type {
  ProgressCheckpointContext,
  ProgressKpiBlock,
} from "../types/progress";

type CipRow = { id: string; number: number };
type KeySkillRow = { id: string; cip_id: string };
type DescriptorRow = { id: string; key_skill_id: string };
export type ReviewEntryRow = {
  id: string;
  title?: string;
  stage_id: string | null;
  linked_cip_number: number;
  event_date: string | null;
  created_at: string;
};
type ConfirmedRow = { key_skill_id: string; review_entry_id: string };
type CoverageRow = {
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  review_entry_id: string;
};

export function entrySortDate(e: ReviewEntryRow): string {
  if (e.event_date) return e.event_date;
  return e.created_at.slice(0, 10);
}

/**
 * Apply stage / CiP / date filters to the user's review entries.
 * `stageIds` null = do not filter by stage.
 * Empty `stageIds` when stage filter was requested but no stages matched → no entries in scope.
 */
export function filterEntriesInScope(
  entries: ReviewEntryRow[],
  params: {
    stageIds: string[] | null;
    cipNumber: number | null;
    dateFrom: string | null;
    dateTo: string | null;
    stageFilterActive: boolean;
  },
): ReviewEntryRow[] {
  let rows = entries;
  if (params.stageFilterActive) {
    const allowed = new Set(params.stageIds ?? []);
    rows = rows.filter((e) => e.stage_id && allowed.has(e.stage_id));
  }
  if (params.cipNumber !== null) {
    rows = rows.filter((e) => e.linked_cip_number === params.cipNumber);
  }
  if (params.dateFrom || params.dateTo) {
    rows = rows.filter((e) => {
      const d = entrySortDate(e);
      if (params.dateFrom && d < params.dateFrom) return false;
      if (params.dateTo && d > params.dateTo) return false;
      return true;
    });
  }
  return rows;
}

function pct(covered: number, total: number): ProgressKpiBlock {
  if (total <= 0) {
    return { covered, total, pct: 0 };
  }
  return {
    covered,
    total,
    pct: Math.round((covered / total) * 100),
  };
}

/**
 * CiP is covered when every key skill in that CiP has at least one confirmed
 * suggestion from an entry in scope (aligned with gap-report is_confirmed).
 *
 * Descriptor is covered if ∃ a row in key_skill_descriptor_coverage with
 * covered=true for that curriculum descriptor and review_entry_id in scope.
 */
export function computeProgressKpis(params: {
  scopedEntryIds: Set<string>;
  cips: CipRow[];
  keySkills: KeySkillRow[];
  descriptors: DescriptorRow[];
  confirmedRows: ConfirmedRow[];
  coverageRows: CoverageRow[];
  checkpoint: ProgressCheckpointContext;
}): {
  kpis: {
    cips_checkpoint: ProgressKpiBlock;
    cips: ProgressKpiBlock;
    key_skills: ProgressKpiBlock;
    descriptors: ProgressKpiBlock;
  };
} {
  const {
    cips,
    keySkills,
    descriptors,
    confirmedRows,
    coverageRows,
    scopedEntryIds,
    checkpoint,
  } =
    params;

  const cipById = new Map(cips.map((c) => [c.id, c]));
  const curriculumCipIds = new Set<string>();
  const curriculumKeySkillIds = new Set<string>();
  for (const ks of keySkills) {
    const cid = String(ks.cip_id);
    if (!cipById.has(cid)) continue;
    curriculumCipIds.add(cid);
    curriculumKeySkillIds.add(String(ks.id));
  }

  const confirmedInScope = new Set<string>();
  for (const row of confirmedRows) {
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    if (!curriculumKeySkillIds.has(String(row.key_skill_id))) continue;
    confirmedInScope.add(String(row.key_skill_id));
  }

  const keySkillsByCip = new Map<string, KeySkillRow[]>();
  for (const ks of keySkills) {
    const cid = String(ks.cip_id);
    if (!curriculumCipIds.has(cid)) continue;
    const arr = keySkillsByCip.get(cid) ?? [];
    arr.push(ks);
    keySkillsByCip.set(cid, arr);
  }

  const coveredDescriptorSet = new Set<string>();
  for (const row of coverageRows) {
    if (!row.covered) continue;
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    if (!curriculumKeySkillIds.has(String(row.key_skill_id))) continue;
    const key = `${row.key_skill_id}:${row.descriptor_id}`;
    coveredDescriptorSet.add(key);
  }

  let coveredCips = 0;
  let checkpointCoveredCips = 0;
  const totalCips = curriculumCipIds.size;
  for (const cipId of curriculumCipIds) {
    const ksList = keySkillsByCip.get(cipId) ?? [];
    if (ksList.length === 0) continue;
    const allConfirmed = ksList.every((ks) => confirmedInScope.has(String(ks.id)));
    if (allConfirmed) coveredCips += 1;

    const descriptorListForCip = descriptors.filter((d) =>
      ksList.some((ks) => String(ks.id) === String(d.key_skill_id)),
    );
    let coveredDescriptorCountForCip = 0;
    for (const descriptorRow of descriptorListForCip) {
      const key = `${descriptorRow.key_skill_id}:${descriptorRow.id}`;
      if (coveredDescriptorSet.has(key)) coveredDescriptorCountForCip += 1;
    }
    const checkpointStatus = classifyCipCheckpointStatus({
      checkpointType: checkpoint.type,
      confirmedSkills: ksList.filter((ks) => confirmedInScope.has(String(ks.id))).length,
      totalSkills: ksList.length,
      coveredDescriptors: coveredDescriptorCountForCip,
      totalDescriptors: descriptorListForCip.length,
      stageElapsedFraction: checkpoint.stage_elapsed_fraction,
      workingPercent: checkpoint.working_percent,
    });
    if (checkpointStatus.status === "green") checkpointCoveredCips += 1;
  }

  const descriptorsInCurriculum = descriptors.filter((d) =>
    curriculumKeySkillIds.has(String(d.key_skill_id)),
  );
  const descriptorKeys = descriptorsInCurriculum.map(
    (d) => `${d.key_skill_id}:${d.id}`,
  );

  let coveredDescriptors = 0;
  for (const key of descriptorKeys) {
    if (coveredDescriptorSet.has(key)) coveredDescriptors += 1;
  }

  const kpis = {
    cips_checkpoint: pct(checkpointCoveredCips, totalCips),
    cips: pct(coveredCips, totalCips),
    key_skills: pct(confirmedInScope.size, curriculumKeySkillIds.size),
    descriptors: pct(coveredDescriptors, descriptorsInCurriculum.length),
  };

  return { kpis };
}

export function stageIdsForParams(
  params: {
    stageId: string | null;
    stageScope: string | null;
    stageGroup: string | null;
  },
  stageRows: Array<{ id: string; name: string; stage_group: string }>,
): { stageIds: string[] | null; stageFilterActive: boolean } {
  if (params.stageId) {
    return { stageIds: [params.stageId], stageFilterActive: true };
  }
  const scopedNames = stagesForScope(params.stageScope);
  if (scopedNames) {
    const nameSet = new Set(scopedNames.map((n) => n.toUpperCase()));
    const ids = stageRows
      .filter((s) => nameSet.has(String(s.name).toUpperCase()))
      .map((s) => s.id);
    return { stageIds: ids, stageFilterActive: true };
  }
  if (params.stageGroup) {
    const ids = stageRows
      .filter((s) => s.stage_group === params.stageGroup)
      .map((s) => s.id);
    return { stageIds: ids, stageFilterActive: true };
  }
  return { stageIds: null, stageFilterActive: false };
}
