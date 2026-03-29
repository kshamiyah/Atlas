import { entrySortDate } from "./summary-metrics";
import { classifyCipCheckpointStatus } from "./checkpoint-readiness";
import type {
  ProgressCheckpointContext,
  ProgressCipGapDescriptor,
  ProgressCipGapKeySkill,
  ProgressCipRow,
  ProgressCipTopEntry,
  ProgressKpiBlock,
} from "../types/progress";

type CipCurriculum = { id: string; number: number; title: string };
type KeySkillCurriculum = { id: string; cip_id: string; skill_number: number; title: string };
type DescriptorCurriculum = {
  id: string;
  key_skill_id: string;
  text: string;
  sort_order: number;
};
type EntryRow = {
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

export function computeProgressCipRows(params: {
  cips: CipCurriculum[];
  keySkills: KeySkillCurriculum[];
  descriptors: DescriptorCurriculum[];
  scopedEntryIds: Set<string>;
  scopedEntries: EntryRow[];
  confirmedRows: ConfirmedRow[];
  coverageRows: CoverageRow[];
  checkpoint: ProgressCheckpointContext;
}): ProgressCipRow[] {
  const {
    cips,
    keySkills,
    descriptors,
    scopedEntryIds,
    scopedEntries,
    confirmedRows,
    coverageRows,
    checkpoint,
  } = params;

  const cipById = new Map(cips.map((c) => [String(c.id), c]));
  const sortedCips = [...cips].sort((a, b) => a.number - b.number);

  const keySkillsByCipId = new Map<string, KeySkillCurriculum[]>();
  for (const ks of keySkills) {
    const cid = String(ks.cip_id);
    if (!cipById.has(cid)) continue;
    const arr = keySkillsByCipId.get(cid) ?? [];
    arr.push(ks);
    keySkillsByCipId.set(cid, arr);
  }
  for (const [, arr] of keySkillsByCipId) {
    arr.sort((a, b) => a.skill_number - b.skill_number);
  }

  const ksIdsInCip = (cipInternalId: string) =>
    new Set((keySkillsByCipId.get(cipInternalId) ?? []).map((k) => String(k.id)));

  const descriptorsForCip = (cipInternalId: string): DescriptorCurriculum[] => {
    const ks = ksIdsInCip(cipInternalId);
    return descriptors
      .filter((d) => ks.has(String(d.key_skill_id)))
      .slice()
      .sort((a, b) => {
        const ka = keySkills.find((x) => String(x.id) === String(a.key_skill_id));
        const kb = keySkills.find((x) => String(x.id) === String(b.key_skill_id));
        const sa = ka?.skill_number ?? 0;
        const sb = kb?.skill_number ?? 0;
        if (sa !== sb) return sa - sb;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return String(a.id).localeCompare(String(b.id));
      });
  };

  const confirmedInScopeBySkill = new Set<string>();
  for (const row of confirmedRows) {
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    confirmedInScopeBySkill.add(String(row.key_skill_id));
  }

  const coveredDescriptorKeys = new Set<string>();
  for (const row of coverageRows) {
    if (!row.covered) continue;
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    coveredDescriptorKeys.add(`${row.key_skill_id}:${row.descriptor_id}`);
  }

  const out: ProgressCipRow[] = [];

  for (const cip of sortedCips) {
    const cid = String(cip.id);
    const ksList = keySkillsByCipId.get(cid) ?? [];
    const descList = descriptorsForCip(cid);

    let ksCovered = 0;
    const gapKeySkills: ProgressCipGapKeySkill[] = [];
    for (const ks of ksList) {
      const kid = String(ks.id);
      if (confirmedInScopeBySkill.has(kid)) {
        ksCovered += 1;
      } else {
        gapKeySkills.push({
          key_skill_id: kid,
          skill_number: ks.skill_number,
          title: ks.title,
        });
      }
    }

    let descCovered = 0;
    const gapDescriptors: ProgressCipGapDescriptor[] = [];
    for (const d of descList) {
      const key = `${d.key_skill_id}:${d.id}`;
      if (coveredDescriptorKeys.has(key)) {
        descCovered += 1;
      } else {
        gapDescriptors.push({
          descriptor_id: String(d.id),
          key_skill_id: String(d.key_skill_id),
          text: d.text,
        });
      }
    }

    const entriesForCip = scopedEntries.filter((e) => e.linked_cip_number === cip.number);
    const entries_count = entriesForCip.length;
    let last_entry_date: string | null = null;
    if (entriesForCip.length > 0) {
      const dates = entriesForCip.map((e) => entrySortDate(e));
      last_entry_date = dates.reduce((a, b) => (a >= b ? a : b));
    }

    const sortedTop = entriesForCip
      .slice()
      .sort((a, b) => {
        const da = entrySortDate(a);
        const db = entrySortDate(b);
        if (db !== da) return db.localeCompare(da);
        return String(a.id).localeCompare(String(b.id));
      })
      .slice(0, 3);

    const top_entries: ProgressCipTopEntry[] = sortedTop.map((e) => ({
      review_entry_id: e.id,
      title: e.title?.trim() ? e.title : "Untitled entry",
      event_date: e.event_date,
    }));

    const key_skills = kpiBlock(ksCovered, ksList.length);
    const descriptors = kpiBlock(descCovered, descList.length);
    const checkpointStatus = classifyCipCheckpointStatus({
      checkpointType: checkpoint.type,
      confirmedSkills: ksCovered,
      totalSkills: ksList.length,
      coveredDescriptors: descCovered,
      totalDescriptors: descList.length,
      stageElapsedFraction: checkpoint.stage_elapsed_fraction,
      workingPercent: checkpoint.working_percent,
    });

    out.push({
      cip_number: cip.number,
      cip_title: cip.title ?? "",
      status: checkpointStatus.status,
      checkpoint_type: checkpoint.type,
      expected_key_skills_by_now: checkpointStatus.expectedSkillsByNow,
      status_reason: checkpointStatus.reason,
      entries_count,
      last_entry_date,
      key_skills,
      descriptors,
      missing_key_skills: Math.max(0, ksList.length - ksCovered),
      missing_descriptors: Math.max(0, descList.length - descCovered),
      gap_key_skills: gapKeySkills,
      gap_descriptors: gapDescriptors,
      top_entries,
    });
  }

  return out;
}
