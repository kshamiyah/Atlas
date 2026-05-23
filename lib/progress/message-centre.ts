import type { ProgressMessage, ProgressMessagePriority } from "../types/progress";

type CipRow = { id: string; number: number };
type KeySkillRow = { id: string; cip_id: string };
type DescriptorRow = { id: string; key_skill_id: string };
type ReviewEntryRow = {
  id: string;
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

const PROGRESS_PATH = "/dashboard/progress";
const ENTRIES_PATH = "/dashboard/entries";

const STALE_LOOKBACK_DAYS = 30;
const CIP_DESCRIPTOR_RISK_PCT = 60;

function entrySortDate(e: ReviewEntryRow): string {
  if (e.event_date) return e.event_date;
  return e.created_at.slice(0, 10);
}

export type ProgressLinkPreservation = {
  stage_scope: string | null;
  stage_group: string | null;
  stage_id: string | null;
  date_from: string | null;
  date_to: string | null;
  cip: string | null;
};

function buildProgressHref(
  preserve: ProgressLinkPreservation,
  overrides: Record<string, string>,
): string {
  const p = new URLSearchParams();
  if (preserve.stage_scope) p.set("stage_scope", preserve.stage_scope);
  if (preserve.stage_group) p.set("stage_group", preserve.stage_group);
  if (preserve.stage_id) p.set("stage_id", preserve.stage_id);
  if (preserve.date_from) p.set("date_from", preserve.date_from);
  if (preserve.date_to) p.set("date_to", preserve.date_to);
  if (preserve.cip) p.set("cip", preserve.cip);
  for (const [k, v] of Object.entries(overrides)) {
    p.set(k, v);
  }
  const q = p.toString();
  return q ? `${PROGRESS_PATH}?${q}` : PROGRESS_PATH;
}

function buildEntriesHref(): string {
  return ENTRIES_PATH;
}

type Candidate = ProgressMessage & { _gap: number };

function priorityRank(p: ProgressMessagePriority): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  return 2;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  if (b._gap !== a._gap) return b._gap - a._gap;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function buildProgressMessages(params: {
  cips: CipRow[];
  keySkills: KeySkillRow[];
  descriptors: DescriptorRow[];
  scopedEntryIds: Set<string>;
  scopedEntries: ReviewEntryRow[];
  confirmedRows: ConfirmedRow[];
  coverageRows: CoverageRow[];
  linkPreserve: ProgressLinkPreservation;
}): ProgressMessage[] {
  const {
    cips,
    keySkills,
    descriptors,
    scopedEntryIds,
    scopedEntries,
    confirmedRows,
    coverageRows,
    linkPreserve,
  } = params;

  const cipById = new Map(cips.map((c) => [String(c.id), c]));
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

  const descriptorsInCurriculum = descriptors.filter((d) =>
    curriculumKeySkillIds.has(String(d.key_skill_id)),
  );

  const coveredDescriptorSet = new Set<string>();
  for (const row of coverageRows) {
    if (!row.covered) continue;
    if (!scopedEntryIds.has(String(row.review_entry_id))) continue;
    if (!curriculumKeySkillIds.has(String(row.key_skill_id))) continue;
    coveredDescriptorSet.add(`${row.key_skill_id}:${row.descriptor_id}`);
  }

  const candidates: Candidate[] = [];

  // --- High: CiP at risk (descriptor pct < 60% OR zero confirmed skills in CiP) ---
  const sortedCipIds = [...curriculumCipIds].sort((a, b) => {
    const na = cipById.get(a)?.number ?? 0;
    const nb = cipById.get(b)?.number ?? 0;
    return na - nb;
  });
  for (const cipId of sortedCipIds) {
    const cip = cipById.get(cipId);
    if (!cip) continue;
    const ksList = keySkillsByCip.get(cipId) ?? [];
    if (ksList.length === 0) continue;

    let confirmedInCip = 0;
    for (const ks of ksList) {
      if (confirmedInScope.has(String(ks.id))) confirmedInCip += 1;
    }
    const unconfirmedSkills = ksList.length - confirmedInCip;

    const descForCip = descriptorsInCurriculum.filter((d) =>
      ksList.some((ks) => String(ks.id) === String(d.key_skill_id)),
    );
    let coveredInCip = 0;
    for (const d of descForCip) {
      const key = `${d.key_skill_id}:${d.id}`;
      if (coveredDescriptorSet.has(key)) coveredInCip += 1;
    }
    const totalDescCip = descForCip.length;
    const descPct =
      totalDescCip > 0 ? Math.round((coveredInCip / totalDescCip) * 100) : 100;

    const zeroSkills = confirmedInCip === 0;
    const lowDescriptors = totalDescCip > 0 && descPct < CIP_DESCRIPTOR_RISK_PCT;
    if (!zeroSkills && !lowDescriptors) continue;

    const uncoveredDesc = totalDescCip - coveredInCip;
    const gap = uncoveredDesc + unconfirmedSkills + (zeroSkills ? ksList.length : 0);

    const n = cip.number;
    const title = `CiP ${n} needs attention`;
    const descSummary =
      totalDescCip > 0
        ? ` Descriptor coverage is ${descPct}% (${coveredInCip}/${totalDescCip}).`
        : "";
    const body = zeroSkills
      ? `No confirmed key skills yet (${ksList.length} to cover).${descSummary}`
      : `Descriptor coverage is ${descPct}% (${coveredInCip}/${totalDescCip}); ${unconfirmedSkills} key skill${unconfirmedSkills === 1 ? "" : "s"} still unconfirmed.`;

    candidates.push({
      id: `cip-risk-${n}`,
      priority: "high",
      title,
      body,
      cta_label: "Review descriptors",
      cta_href: buildProgressHref(linkPreserve, {
        tab: "descriptors",
        cip: String(n),
      }),
      _gap: gap,
    });
  }

  // --- Medium: unlinked key skills (no confirmation in scope) ---
  const unlinkedCount = curriculumKeySkillIds.size - confirmedInScope.size;
  if (unlinkedCount > 0) {
    candidates.push({
      id: "unlinked-key-skills",
      priority: "medium",
      title: "Confirm key skills",
      body: `${unlinkedCount} key skill${unlinkedCount === 1 ? "" : "s"} have no confirmed evidence in this scope.`,
      cta_label: "Open key skills",
      cta_href: buildProgressHref(linkPreserve, { tab: "key-skills" }),
      _gap: unlinkedCount,
    });
  }

  // --- Medium: descriptor gaps (aggregate) ---
  let coveredDescriptors = 0;
  for (const d of descriptorsInCurriculum) {
    const key = `${d.key_skill_id}:${d.id}`;
    if (coveredDescriptorSet.has(key)) coveredDescriptors += 1;
  }
  const totalDescriptors = descriptorsInCurriculum.length;
  const uncoveredDescriptors = totalDescriptors - coveredDescriptors;
  if (uncoveredDescriptors > 0) {
    candidates.push({
      id: "descriptor-gaps",
      priority: "medium",
      title: "Close descriptor gaps",
      body: `${uncoveredDescriptors} descriptor${uncoveredDescriptors === 1 ? "" : "s"} still uncovered in this scope (${coveredDescriptors}/${totalDescriptors} done).`,
      cta_label: "View descriptors",
      cta_href: buildProgressHref(linkPreserve, { tab: "descriptors" }),
      _gap: uncoveredDescriptors,
    });
  }

  // --- Low: stale evidence ---
  if (scopedEntries.length > 0) {
    const today = new Date();
    const cutoff = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - STALE_LOOKBACK_DAYS,
      ),
    );
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let latest = "1970-01-01";
    for (const e of scopedEntries) {
      const d = entrySortDate(e);
      if (d > latest) latest = d;
    }
    if (latest < cutoffStr) {
      candidates.push({
        id: "stale-evidence",
        priority: "low",
        title: "Refresh your evidence",
        body: `No portfolio entry in this scope within the last ${STALE_LOOKBACK_DAYS} days (latest ${latest}).`,
        cta_label: "Go to My Entries",
        cta_href: buildEntriesHref(),
        _gap: STALE_LOOKBACK_DAYS,
      });
    }
  }

  candidates.sort(compareCandidates);

  return candidates.slice(0, 3).map(
    (row): ProgressMessage => ({
      id: row.id,
      priority: row.priority,
      title: row.title,
      body: row.body,
      cta_label: row.cta_label,
      cta_href: row.cta_href,
    }),
  );
}
