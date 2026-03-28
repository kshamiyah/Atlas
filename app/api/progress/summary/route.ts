import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { buildProgressMessages } from "@/lib/progress/message-centre";
import {
  parseProgressScopeFromUrl,
  validateStageIdInCatalog,
} from "@/lib/progress/query-params";
import {
  computeProgressKpis,
  filterEntriesInScope,
  stageIdsForParams,
} from "@/lib/progress/summary-metrics";
import type { ProgressSummaryResponse, ProgressSummaryScope } from "@/lib/types/progress";

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

function emptySummary(scope: ProgressSummaryScope): ProgressSummaryResponse {
  return {
    scope,
    kpis: {
      cips: { covered: 0, total: 0, pct: 0 },
      key_skills: { covered: 0, total: 0, pct: 0 },
      descriptors: { covered: 0, total: 0, pct: 0 },
    },
    messages: [],
    updated_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && !(bypassAuth && !user)) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 },
    );
  }

  if (!user && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsedScope = parseProgressScopeFromUrl(url);
  if ("error" in parsedScope) {
    return NextResponse.json({ error: parsedScope.error }, { status: 400 });
  }
  const { scopeEcho, stageScope, stageGroup, cipNumber } = parsedScope;

  if (!user && bypassAuth) {
    return NextResponse.json(emptySummary(scopeEcho));
  }

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

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
    supabase.from("cips").select("id, number").order("number", { ascending: true }),
    supabase.from("key_skills").select("id, cip_id").order("skill_number", { ascending: true }),
    supabase.from("descriptors").select("id, key_skill_id").order("sort_order", { ascending: true }),
    supabase
      .from("key_skill_review_entries")
      .select("id, stage_id, linked_cip_number, event_date, created_at")
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
        { error: "Failed to load progress data: " + res.error.message },
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
      return NextResponse.json(emptySummary(scopeEcho));
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

  const entries = (entriesRes.data ?? []) as ReviewEntryRow[];
  const scopedEntries = filterEntriesInScope(entries, {
    stageIds,
    cipNumber,
    dateFrom: scopeEcho.date_from,
    dateTo: scopeEcho.date_to,
    stageFilterActive,
  });

  const scopedEntryIds = new Set(scopedEntries.map((e) => e.id));

  const confirmedRows = (confirmedRes.data ?? []) as ConfirmedRow[];
  const coverageRows = (coverageRes.data ?? []) as CoverageRow[];

  const { kpis } = computeProgressKpis({
    scopedEntryIds,
    cips,
    keySkills,
    descriptors,
    confirmedRows,
    coverageRows,
  });

  const messages = buildProgressMessages({
    cips,
    keySkills,
    descriptors,
    scopedEntryIds,
    scopedEntries,
    confirmedRows,
    coverageRows,
    linkPreserve: {
      stage_scope: stageScope && stageScope.length > 0 ? stageScope : null,
      stage_group: stageGroup && stageGroup.length > 0 ? stageGroup : null,
      stage_id: scopeEcho.stage_id,
      date_from: scopeEcho.date_from,
      date_to: scopeEcho.date_to,
      cip: cipNumber != null ? String(cipNumber) : null,
    },
  });

  const body: ProgressSummaryResponse = {
    scope: scopeEcho,
    kpis,
    messages,
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
