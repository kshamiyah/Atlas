import { entrySortDate } from "./summary-metrics";
import type { KeySkillsSortMode } from "./query-params";
import type {
  ProgressCipTopEntry,
  ProgressKeySkillGroup,
  ProgressKeySkillRow,
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

type KeySkillRowBuilt = ProgressKeySkillRow & { _latest_activity: string };

type KeySkillGroupBuilt = {
  cip_number: number;
  cip_title: string;
  key_skills: KeySkillRowBuilt[];
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

function topEntriesForSkill(
  entryIds: Set<string>,
  entryById: Map<string, EntryRow>,
): ProgressCipTopEntry[] {
  const rows: EntryRow[] = [];
  for (const id of entryIds) {
    const e = entryById.get(id);
    if (e) rows.push(e);
  }
  rows.sort((a, b) => {
    const da = entrySortDate(a);
    const db = entrySortDate(b);
    if (db !== da) return db.localeCompare(da);
    return String(a.id).localeCompare(String(b.id));
  });
  return rows.slice(0, 3).map((e) => ({
    review_entry_id: e.id,
    title: e.title?.trim() ? e.title : "Untitled entry",
    event_date: e.event_date,
  }));
}

function latestActivityAmongEntries(
  entryIds: Set<string>,
  entryById: Map<string, EntryRow>,
): string {
  let best = "";
  for (const id of entryIds) {
    const e = entryById.get(id);
    if (!e) continue;
    const d = entrySortDate(e);
    if (d > best) best = d;
  }
  return best;
}

function stripBuilt(row: KeySkillRowBuilt): ProgressKeySkillRow {
  const { _latest_activity, ...rest } = row;
  void _latest_activity;
  return rest;
}

export function computeKeySkillGroups(params: {
  cips: CipCurriculum[];
  keySkills: KeySkillCurriculum[];
  descriptors: DescriptorCurriculum[];
  scopedEntryIds: Set<string>;
  scopedEntries: EntryRow[];
  confirmedRows: ConfirmedRow[];
  coverageRows: CoverageRow[];
}): KeySkillGroupBuilt[] {
  const { cips, keySkills, descriptors, scopedEntryIds, scopedEntries, confirmedRows, coverageRows } =
    params;

  const cipById = new Map(cips.map((c) => [String(c.id), c]));
  const entryById = new Map(scopedEntries.map((e) => [e.id, e]));

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

  const descriptorsByKeySkillId = new Map<string, DescriptorCurriculum[]>();
  for (const d of descriptors) {
    const kid = String(d.key_skill_id);
    const arr = descriptorsByKeySkillId.get(kid) ?? [];
    arr.push(d);
    descriptorsByKeySkillId.set(kid, arr);
  }
  for (const [, arr] of descriptorsByKeySkillId) {
    arr.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  const coveredDescriptorKeys = new Set<string>();
  for (const row of coverageRows) {
    if (!row.covered) continue;
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    coveredDescriptorKeys.add(`${row.key_skill_id}:${row.descriptor_id}`);
  }

  const confirmingEntriesBySkill = new Map<string, Set<string>>();
  for (const row of confirmedRows) {
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    const kid = String(row.key_skill_id);
    const set = confirmingEntriesBySkill.get(kid) ?? new Set<string>();
    set.add(String(row.review_entry_id));
    confirmingEntriesBySkill.set(kid, set);
  }

  const sortedCips = [...cips].sort((a, b) => a.number - b.number);
  const groups: KeySkillGroupBuilt[] = [];

  for (const cip of sortedCips) {
    const cid = String(cip.id);
    const ksList = keySkillsByCipId.get(cid) ?? [];
    const key_skills: KeySkillRowBuilt[] = [];

    for (const ks of ksList) {
      const kid = String(ks.id);
      const descList = descriptorsByKeySkillId.get(kid) ?? [];
      let coveredDesc = 0;
      const descriptor_items = descList.map((d) => {
        const key = `${kid}:${d.id}`;
        const covered = coveredDescriptorKeys.has(key);
        if (covered) coveredDesc += 1;
        return {
          descriptor_id: String(d.id),
          text: d.text,
          covered,
        };
      });

      const confirming = confirmingEntriesBySkill.get(kid) ?? new Set<string>();
      const is_confirmed = confirming.size > 0;
      const confirmed_entry_count = confirming.size;
      const top_entries = topEntriesForSkill(confirming, entryById);

      key_skills.push({
        key_skill_id: kid,
        skill_number: ks.skill_number,
        title: ks.title,
        is_confirmed,
        confirmed_entry_count,
        descriptor_coverage: kpiBlock(coveredDesc, descList.length),
        descriptor_items,
        top_entries,
        _latest_activity: latestActivityAmongEntries(confirming, entryById),
      });
    }

    groups.push({
      cip_number: cip.number,
      cip_title: cip.title ?? "",
      key_skills,
    });
  }

  return groups;
}

export function filterAndSortKeySkillGroups(
  groups: KeySkillGroupBuilt[],
  options: {
    gapsOnly: boolean;
    confirmedOnly: boolean;
    sort: KeySkillsSortMode;
  },
): ProgressKeySkillGroup[] {
  const { gapsOnly, confirmedOnly, sort } = options;

  const filtered: ProgressKeySkillGroup[] = [];

  for (const g of groups) {
    let skills = g.key_skills;
    if (gapsOnly) {
      skills = skills.filter((s) => !s.is_confirmed);
    } else if (confirmedOnly) {
      skills = skills.filter((s) => s.is_confirmed);
    }

    const sortedSkills = skills.slice().sort((a, b) => {
      if (sort === "skill_number") {
        return a.skill_number - b.skill_number;
      }
      if (sort === "recent") {
        const la = a._latest_activity || "";
        const lb = b._latest_activity || "";
        if (lb !== la) return lb.localeCompare(la);
        return a.skill_number - b.skill_number;
      }
      if (a.is_confirmed !== b.is_confirmed) {
        return a.is_confirmed ? 1 : -1;
      }
      if (a.descriptor_coverage.pct !== b.descriptor_coverage.pct) {
        return a.descriptor_coverage.pct - b.descriptor_coverage.pct;
      }
      return a.skill_number - b.skill_number;
    });

    if (sortedSkills.length === 0) continue;

    filtered.push({
      cip_number: g.cip_number,
      cip_title: g.cip_title,
      key_skills: sortedSkills.map((s) => stripBuilt(s)),
    });
  }

  return filtered;
}
