import { NextRequest, NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { getStageNamesForGroup, stagesForScope } from "@/lib/profile/stage";
import type {
  GapReport,
  GapReportCip,
  GapReportDescriptor,
  GapReportKeySkill,
} from "@/lib/types/gap-report";

type CipRow = { id: string; number: number; title: string };
type KeySkillRow = { id: string; cip_id: string; skill_number: number; title: string };
type DescriptorRow = { id: string; key_skill_id: string; text: string; sort_order: number };
type ConfirmedRow = { key_skill_id: string; review_entry_id: string };
type CoverageRow = {
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  confidence: number | null;
  evidence_quote: string | null;
  review_entry_id: string;
};

export async function GET(req: NextRequest) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userId) {
    const body: GapReport = { cips: [] };
    return NextResponse.json(body);
  }

  const url = new URL(req.url);
  const stageIdParam = url.searchParams.get("stage_id");
  const stageGroup = url.searchParams.get("stage_group");
  const stageScope = url.searchParams.get("stage_scope");
  const scopedStageNames = stagesForScope(stageScope);

  // --- Query A: Curriculum structure (CiPs → key skills → descriptors), parallel ---
  const [cipsRes, keySkillsRes, descriptorsRes] = await Promise.all([
    supabase
      .from("cips")
      .select("id, number, title")
      .order("number", { ascending: true }),
    supabase
      .from("key_skills")
      .select("id, cip_id, skill_number, title")
      .order("skill_number", { ascending: true }),
    supabase
      .from("descriptors")
      .select("id, key_skill_id, text, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  if (cipsRes.error) {
    return NextResponse.json(
      { error: "Failed to load curriculum: " + cipsRes.error.message },
      { status: 500 },
    );
  }
  if (keySkillsRes.error) {
    return NextResponse.json(
      { error: "Failed to load key skills: " + keySkillsRes.error.message },
      { status: 500 },
    );
  }
  if (descriptorsRes.error) {
    return NextResponse.json(
      { error: "Failed to load descriptors: " + descriptorsRes.error.message },
      { status: 500 },
    );
  }

  const cips = (cipsRes.data ?? []) as CipRow[];
  const keySkills = (keySkillsRes.data ?? []) as KeySkillRow[];
  const descriptors = (descriptorsRes.data ?? []) as DescriptorRow[];

  // If a stage filter is active, resolve which entry IDs belong to that stage / group
  let entryIdFilter: string[] | null = null;
  if (stageIdParam) {
    const { data: entryRows } = await supabase
      .from("key_skill_review_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("stage_id", stageIdParam);

    entryIdFilter = (entryRows ?? []).map((e: { id: string }) => e.id);
  } else if (stageGroup || scopedStageNames) {
    let stageQuery = supabase.from("stages").select("id");
    if (scopedStageNames) {
      stageQuery = stageQuery.in("name", [...scopedStageNames]);
    } else if (stageGroup) {
      stageQuery = stageQuery.in("name", [...getStageNamesForGroup(stageGroup as "Stage One" | "Stage Two" | "Stage Three")]);
    }

    const { data: stageRows } = await stageQuery;

    const stageIds = (stageRows ?? []).map((s: { id: string }) => s.id);

    if (stageIds.length > 0) {
      const { data: entryRows } = await supabase
        .from("key_skill_review_entries")
        .select("id")
        .eq("user_id", userId)
        .in("stage_id", stageIds);

      entryIdFilter = (entryRows ?? []).map((e: { id: string }) => e.id);
    } else {
      entryIdFilter = [];
    }
  }

  // --- Query B: Confirmed skills (key_skill_id → distinct entry count) ---
  // Short-circuit: if the stage filter resolved to zero entries, no confirmed skills possible.
  let confirmedRows: ConfirmedRow[] = [];
  if (entryIdFilter === null || entryIdFilter.length > 0) {
    let confirmedQuery = supabase
      .from("key_skill_review_suggestions")
      .select("key_skill_id, review_entry_id")
      .eq("user_id", userId)
      .eq("status", "confirmed");

    if (entryIdFilter !== null) {
      confirmedQuery = confirmedQuery.in("review_entry_id", entryIdFilter);
    }

    const { data, error: confirmedError } = await confirmedQuery;
    if (confirmedError) {
      return NextResponse.json(
        { error: "Failed to load confirmed skills: " + confirmedError.message },
        { status: 500 },
      );
    }
    confirmedRows = (data ?? []) as ConfirmedRow[];
  }

  const confirmedEntryCountByKeySkill = new Map<string, number>();
  const entryIdsByKeySkill = new Map<string, Set<string>>();
  for (const row of (confirmedRows ?? []) as ConfirmedRow[]) {
    const kid = String(row.key_skill_id);
    const eid = String(row.review_entry_id);
    const set = entryIdsByKeySkill.get(kid) ?? new Set<string>();
    set.add(eid);
    entryIdsByKeySkill.set(kid, set);
  }
  entryIdsByKeySkill.forEach((set, kid) => {
    confirmedEntryCountByKeySkill.set(kid, set.size);
  });

  // --- Query C: Descriptor coverage ---
  const { data: coverageRows, error: coverageError } = await supabase
    .from("key_skill_descriptor_coverage")
    .select("key_skill_id, descriptor_id, covered, confidence, evidence_quote, review_entry_id")
    .eq("user_id", userId);

  if (coverageError) {
    return NextResponse.json(
      { error: "Failed to load descriptor coverage: " + coverageError.message },
      { status: 500 },
    );
  }

  const coverageList = (coverageRows ?? []) as CoverageRow[];
  const coverageByDescriptor = new Map<string, CoverageRow>();
  for (const row of coverageList) {
    if (entryIdFilter !== null && !entryIdFilter.includes(String(row.review_entry_id))) {
      continue;
    }
    const key = `${row.key_skill_id}:${row.descriptor_id}`;
    const existing = coverageByDescriptor.get(key);
    if (!existing) {
      coverageByDescriptor.set(key, { ...row });
      continue;
    }
    if (row.covered && (!existing.covered || (row.confidence ?? 0) > (existing.confidence ?? 0))) {
      coverageByDescriptor.set(key, { ...row });
    }
  }

  // --- Build key_skill_id → descriptors (from curriculum) ---
  const descriptorsByKeySkill = new Map<string, DescriptorRow[]>();
  for (const d of descriptors) {
    const kid = String(d.key_skill_id);
    const arr = descriptorsByKeySkill.get(kid) ?? [];
    arr.push(d);
    descriptorsByKeySkill.set(kid, arr);
  }

  const keySkillsByCip = new Map<string, KeySkillRow[]>();
  for (const ks of keySkills) {
    const cid = String(ks.cip_id);
    const arr = keySkillsByCip.get(cid) ?? [];
    arr.push(ks);
    keySkillsByCip.set(cid, arr);
  }

  const cipById = new Map<string, CipRow>();
  cips.forEach((c) => cipById.set(String(c.id), c));

  // --- Merge and build GapReport ---
  const reportCips: GapReportCip[] = [];

  for (const cip of cips) {
    const cipId = String(cip.id);
    const keySkillsForCip = keySkillsByCip.get(cipId) ?? [];
    const gapKeySkills: GapReportKeySkill[] = [];

    for (const ks of keySkillsForCip) {
      const kid = String(ks.id);
      const confirmedEntryCount = confirmedEntryCountByKeySkill.get(kid) ?? 0;
      const isConfirmed = confirmedEntryCount > 0;
      const descriptorList = descriptorsByKeySkill.get(kid) ?? [];
      const gapDescriptors: GapReportDescriptor[] = [];
      let evidencedCount = 0;

      for (const desc of descriptorList) {
        const cov = coverageByDescriptor.get(`${kid}:${desc.id}`);
        const covered = cov ? cov.covered : false;
        if (covered) evidencedCount++;
        gapDescriptors.push({
          descriptor_id: desc.id,
          text: desc.text,
          covered,
          confidence: cov ? (cov.confidence ?? null) : null,
          evidence_quote: cov ? (cov.evidence_quote ?? null) : null,
        });
      }

      gapKeySkills.push({
        key_skill_id: kid,
        skill_number: ks.skill_number,
        title: ks.title,
        is_confirmed: isConfirmed,
        confirmed_entry_count: confirmedEntryCount,
        total_descriptors: descriptorList.length,
        evidenced_descriptors: evidencedCount,
        descriptors: gapDescriptors,
      });
    }

    const total_skills = gapKeySkills.length;
    const confirmed_skills = gapKeySkills.filter((k) => k.is_confirmed).length;
    const coverage_pct =
      total_skills > 0
        ? Math.round((confirmed_skills / total_skills) * 100)
        : 0;

    reportCips.push({
      cip_number: String(cip.number),
      cip_title: cip.title ?? "",
      confirmed_skills,
      total_skills,
      coverage_pct,
      key_skills: gapKeySkills,
    });
  }

  const body: GapReport = {
    cips: reportCips.sort((a, b) => Number(a.cip_number) - Number(b.cip_number)),
  };

  return NextResponse.json(body);
}
