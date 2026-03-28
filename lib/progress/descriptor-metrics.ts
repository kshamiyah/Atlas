import type { DescriptorsSortMode } from "./query-params";
import { entrySortDate, type ReviewEntryRow } from "./summary-metrics";
import type {
  ProgressCipTopEntry,
  ProgressDescriptorCipGroup,
  ProgressDescriptorRow,
  ProgressDescriptorSkillGroup,
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
type EntryRow = ReviewEntryRow;
type CoverageDetailRow = {
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  review_entry_id: string;
  confidence: number | null;
  evidence_quote: string | null;
};

export type DescriptorRowBuilt = ProgressDescriptorRow & {
  _sort_order: number;
  _confidenceForSort: number;
};

export type DescriptorSkillGroupBuilt = {
  key_skill_id: string;
  skill_number: number;
  title: string;
  descriptor_coverage: ProgressKpiBlock;
  descriptors: DescriptorRowBuilt[];
};

export type DescriptorCipGroupBuilt = {
  cip_number: number;
  cip_title: string;
  skills: DescriptorSkillGroupBuilt[];
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

function pickBestCoveredRow(
  rows: CoverageDetailRow[],
  entryById: Map<string, EntryRow>,
): CoverageDetailRow | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const ca = a.confidence ?? -1;
    const cb = b.confidence ?? -1;
    if (cb !== ca) return cb - ca;
    const ea = entryById.get(a.review_entry_id);
    const eb = entryById.get(b.review_entry_id);
    const da = ea ? entrySortDate(ea) : "";
    const db = eb ? entrySortDate(eb) : "";
    if (db !== da) return db.localeCompare(da);
    return String(a.review_entry_id).localeCompare(String(b.review_entry_id));
  })[0];
}

function supportingTopEntries(
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

function latestAmongEntries(
  entryIds: Set<string>,
  entryById: Map<string, EntryRow>,
): string | null {
  let best = "";
  for (const id of entryIds) {
    const e = entryById.get(id);
    if (!e) continue;
    const d = entrySortDate(e);
    if (d > best) best = d;
  }
  return best === "" ? null : best;
}

function stripBuilt(d: DescriptorRowBuilt): ProgressDescriptorRow {
  const { _sort_order: _so, _confidenceForSort: _cf, ...rest } = d;
  void _so;
  void _cf;
  return rest;
}

function sortDescriptorsInSkill(
  rows: DescriptorRowBuilt[],
  sort: DescriptorsSortMode,
): ProgressDescriptorRow[] {
  const copy = rows.slice();
  if (sort === "curricular") {
    copy.sort(
      (a, b) =>
        a._sort_order - b._sort_order || String(a.descriptor_id).localeCompare(b.descriptor_id),
    );
    return copy.map(stripBuilt);
  }
  if (sort === "recent") {
    copy.sort((a, b) => {
      const la = a.latest_activity_date ?? "";
      const lb = b.latest_activity_date ?? "";
      if (la === "" && lb !== "") return 1;
      if (lb === "" && la !== "") return -1;
      if (lb !== la) return lb.localeCompare(la);
      return a._sort_order - b._sort_order;
    });
    return copy.map(stripBuilt);
  }
  copy.sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? 1 : -1;
    if (!a.covered && !b.covered) {
      return a._sort_order - b._sort_order;
    }
    if (a._confidenceForSort !== b._confidenceForSort) {
      return a._confidenceForSort - b._confidenceForSort;
    }
    if (a.supporting_entry_count !== b.supporting_entry_count) {
      return a.supporting_entry_count - b.supporting_entry_count;
    }
    return a._sort_order - b._sort_order;
  });
  return copy.map(stripBuilt);
}

export function computeDescriptorGroups(params: {
  cips: CipCurriculum[];
  keySkills: KeySkillCurriculum[];
  descriptors: DescriptorCurriculum[];
  scopedEntryIds: Set<string>;
  scopedEntries: EntryRow[];
  coverageRows: CoverageDetailRow[];
}): DescriptorCipGroupBuilt[] {
  const { cips, keySkills, descriptors, scopedEntryIds, scopedEntries, coverageRows } = params;

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

  const coveredRowsByDescriptor = new Map<string, CoverageDetailRow[]>();
  for (const row of coverageRows) {
    if (!row.covered) continue;
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    const key = `${row.key_skill_id}:${row.descriptor_id}`;
    const arr = coveredRowsByDescriptor.get(key) ?? [];
    arr.push(row);
    coveredRowsByDescriptor.set(key, arr);
  }

  const sortedCips = [...cips].sort((a, b) => a.number - b.number);
  const groups: DescriptorCipGroupBuilt[] = [];

  for (const cip of sortedCips) {
    const cid = String(cip.id);
    const ksList = keySkillsByCipId.get(cid) ?? [];
    const skills: DescriptorSkillGroupBuilt[] = [];

    for (const ks of ksList) {
      const kid = String(ks.id);
      const descList = descriptorsByKeySkillId.get(kid) ?? [];
      const builtRows: DescriptorRowBuilt[] = [];
      let coveredCount = 0;

      for (const d of descList) {
        const dkey = `${kid}:${d.id}`;
        const covRows = coveredRowsByDescriptor.get(dkey) ?? [];
        const covered = covRows.length > 0;
        if (covered) coveredCount += 1;

        const entryIdSet = new Set(covRows.map((r) => String(r.review_entry_id)));
        const best = pickBestCoveredRow(covRows, entryById);
        const conf = best?.confidence ?? null;
        const quote =
          best?.evidence_quote != null && String(best.evidence_quote).trim() !== ""
            ? String(best.evidence_quote)
            : null;

        builtRows.push({
          descriptor_id: String(d.id),
          text: d.text,
          covered,
          latest_activity_date: latestAmongEntries(entryIdSet, entryById),
          evidence_quote: quote,
          confidence: conf,
          supporting_entry_count: entryIdSet.size,
          supporting_entries: supportingTopEntries(entryIdSet, entryById),
          _sort_order: d.sort_order,
          _confidenceForSort: conf ?? -1,
        });
      }

      skills.push({
        key_skill_id: kid,
        skill_number: ks.skill_number,
        title: ks.title,
        descriptor_coverage: kpiBlock(coveredCount, descList.length),
        descriptors: builtRows,
      });
    }

    groups.push({
      cip_number: cip.number,
      cip_title: cip.title ?? "",
      skills,
    });
  }

  return groups;
}

export function filterAndSortDescriptorGroups(
  groups: DescriptorCipGroupBuilt[],
  options: {
    gapsOnly: boolean;
    coveredOnly: boolean;
    sort: DescriptorsSortMode;
  },
): ProgressDescriptorCipGroup[] {
  const { gapsOnly, coveredOnly, sort } = options;
  const out: ProgressDescriptorCipGroup[] = [];

  for (const g of groups) {
    const skillsOut: ProgressDescriptorSkillGroup[] = [];

    for (const sk of g.skills) {
      let rows = sk.descriptors;
      if (gapsOnly) {
        rows = rows.filter((r) => !r.covered);
      } else if (coveredOnly) {
        rows = rows.filter((r) => r.covered);
      }

      if (rows.length === 0) continue;

      skillsOut.push({
        key_skill_id: sk.key_skill_id,
        skill_number: sk.skill_number,
        title: sk.title,
        descriptor_coverage: sk.descriptor_coverage,
        descriptors: sortDescriptorsInSkill(rows, sort),
      });
    }

    if (skillsOut.length === 0) continue;

    out.push({
      cip_number: g.cip_number,
      cip_title: g.cip_title,
      skills: skillsOut,
    });
  }

  return out;
}
