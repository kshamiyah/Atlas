import { NextRequest, NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import {
  computeKeySkillGroups,
  filterAndSortKeySkillGroups,
} from "@/lib/progress/key-skill-metrics";
import {
  parseKeySkillsListParams,
  parseProgressScopeFromUrl,
  validateStageIdInCatalog,
} from "@/lib/progress/query-params";
import {
  filterEntriesInScope,
  stageIdsForParams,
} from "@/lib/progress/summary-metrics";
import type { ProgressKeySkillsResponse, ProgressSummaryScope } from "@/lib/types/progress";

type CipRow = { id: string; number: number; title: string };
type KeySkillRow = { id: string; cip_id: string; skill_number: number; title: string };
type DescriptorRow = {
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

function emptyKeySkills(scope: ProgressSummaryScope): ProgressKeySkillsResponse {
  return {
    scope,
    groups: [],
    updated_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsedScope = parseProgressScopeFromUrl(url);
  if ("error" in parsedScope) {
    return NextResponse.json({ error: parsedScope.error }, { status: 400 });
  }
  const listParams = parseKeySkillsListParams(url);
  if ("error" in listParams) {
    return NextResponse.json({ error: listParams.error }, { status: 400 });
  }

  const { scopeEcho, stageScope, stageGroup, cipNumber } = parsedScope;

  if (!userId) {
    return NextResponse.json(emptyKeySkills(scopeEcho));
  }

  const [
    stagesRes,
    cipsRes,
    keySkillsRes,
    descriptorsRes,
    entriesRes,
    confirmedRes,
    coverageRes,
  ] = await Promise.all([
    supabase.from("stages").select("id, name, stage_group").order("sort_order", { ascending: true }),
    supabase.from("cips").select("id, number, title").order("number", { ascending: true }),
    supabase
      .from("key_skills")
      .select("id, cip_id, skill_number, title")
      .order("skill_number", { ascending: true }),
    supabase
      .from("descriptors")
      .select("id, key_skill_id, text, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("key_skill_review_entries")
      .select("id, title, stage_id, linked_cip_number, event_date, created_at")
      .eq("user_id", userId),
    supabase
      .from("key_skill_review_suggestions")
      .select("key_skill_id, review_entry_id")
      .eq("user_id", userId)
      .eq("status", "confirmed"),
    supabase
      .from("key_skill_descriptor_coverage")
      .select("key_skill_id, descriptor_id, covered, review_entry_id")
      .eq("user_id", userId),
  ]);

  for (const res of [
    stagesRes,
    cipsRes,
    keySkillsRes,
    descriptorsRes,
    entriesRes,
    confirmedRes,
    coverageRes,
  ]) {
    if (res.error) {
      return NextResponse.json(
        { error: "Failed to load key skills progress: " + res.error.message },
        { status: 500 },
      );
    }
  }

  const stageRows = (stagesRes.data ?? []) as Array<{
    id: string;
    name: string;
    stage_group: string;
  }>;

  const stageIdError = validateStageIdInCatalog(scopeEcho.stage_id, stageRows);
  if (stageIdError) {
    return NextResponse.json({ error: stageIdError }, { status: 400 });
  }

  let cips = (cipsRes.data ?? []) as CipRow[];
  let keySkills = (keySkillsRes.data ?? []) as KeySkillRow[];
  let descriptors = (descriptorsRes.data ?? []) as DescriptorRow[];

  if (cipNumber !== null) {
    const cipRow = cips.find((c) => c.number === cipNumber);
    if (!cipRow) {
      return NextResponse.json(emptyKeySkills(scopeEcho));
    }
    const cipId = String(cipRow.id);
    cips = [cipRow];
    keySkills = keySkills.filter((ks) => String(ks.cip_id) === cipId);
    const ksIds = new Set(keySkills.map((ks) => String(ks.id)));
    descriptors = descriptors.filter((d) => ksIds.has(String(d.key_skill_id)));
  }

  const { stageIds, stageFilterActive } = stageIdsForParams(
    {
      stageId: scopeEcho.stage_id,
      stageScope,
      stageGroup,
    },
    stageRows,
  );

  const entries = (entriesRes.data ?? []) as EntryRow[];
  const scopedEntries = filterEntriesInScope(entries, {
    stageIds,
    cipNumber,
    dateFrom: scopeEcho.date_from,
    dateTo: scopeEcho.date_to,
    stageFilterActive,
  });

  const scopedEntryIds = new Set(scopedEntries.map((e) => e.id));

  const built = computeKeySkillGroups({
    cips,
    keySkills,
    descriptors,
    scopedEntryIds,
    scopedEntries,
    confirmedRows: (confirmedRes.data ?? []) as ConfirmedRow[],
    coverageRows: (coverageRes.data ?? []) as CoverageRow[],
  });

  const groups = filterAndSortKeySkillGroups(built, listParams);

  const body: ProgressKeySkillsResponse = {
    scope: scopeEcho,
    groups,
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
