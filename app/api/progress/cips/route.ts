import { NextRequest, NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { computeProgressCipRows } from "@/lib/progress/cip-metrics";
import {
  checkpointTypeLabel,
  resolveProgressCheckpointType,
} from "@/lib/progress/checkpoint-readiness";
import {
  parseProgressScopeFromUrl,
  validateStageIdInCatalog,
} from "@/lib/progress/query-params";
import {
  filterEntriesInScope,
  stageIdsForParams,
} from "@/lib/progress/summary-metrics";
import { calculateArcpCountdown } from "@/lib/profile/ltft";
import { calculateKeySkillsProRataCheckpoint } from "@/lib/profile/ltft-pro-rata";
import { normalizeStageName } from "@/lib/profile/stage";
import { resolveCheckpointStageForProgress } from "@/lib/progress/scope-dimensions";
import type { ProgressCipsResponse, ProgressSummaryScope } from "@/lib/types/progress";

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
  title: string;
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

function emptyCips(scope: ProgressSummaryScope): ProgressCipsResponse {
  return {
    scope,
    checkpoint: {
      type: "annual",
      label: "Annual ARCP",
      current_stage: null,
      stage_elapsed_fraction: null,
      working_percent: 100,
    },
    cips: [],
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
  const { scopeEcho, stageScope, stageGroup, cipNumber, progressYear } = parsedScope;

  if (!userId) {
    return NextResponse.json(emptyCips(scopeEcho));
  }

  const [
    stagesRes,
    profileRes,
    cipsRes,
    keySkillsRes,
    descriptorsRes,
    entriesRes,
    confirmedRes,
    coverageRes,
  ] = await Promise.all([
    supabase.from("stages").select("id, name, stage_group").order("sort_order", { ascending: true }),
    supabase
      .from("profiles")
      .select("current_stage_id, current_grade, arcp_date, working_percent")
      .eq("id", userId)
      .maybeSingle(),
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
    profileRes,
    cipsRes,
    keySkillsRes,
    descriptorsRes,
    entriesRes,
    confirmedRes,
    coverageRes,
  ]) {
    if (res.error) {
      return NextResponse.json(
        { error: "Failed to load progress CiP data: " + res.error.message },
        { status: 500 },
      );
    }
  }

  const stageRows = (stagesRes.data ?? []) as Array<{
    id: string;
    name: string;
    stage_group: string;
  }>;
  const profile = (profileRes.data ?? null) as {
    current_stage_id: string | null;
    current_grade: string | null;
    arcp_date: string | null;
    working_percent: number | null;
  } | null;

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
      return NextResponse.json(emptyCips(scopeEcho));
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

  const stageFromProfileId =
    profile?.current_stage_id
      ? stageRows.find((row) => row.id === profile.current_stage_id)?.name ?? null
      : null;
  const currentStage = resolveCheckpointStageForProgress(
    progressYear,
    normalizeStageName(stageFromProfileId ?? profile?.current_grade ?? null),
  );
  const arcpCountdown = calculateArcpCountdown(
    profile?.arcp_date ?? null,
    profile?.working_percent ?? 100,
  );
  const stageCheckpoint = calculateKeySkillsProRataCheckpoint({
    totalSkills: 0,
    confirmedSkills: 0,
    currentStage,
    daysToArcpCalendar: arcpCountdown.calendarDaysToArcp,
    workingPercentInput: arcpCountdown.workingPercent,
  });
  const checkpointType = resolveProgressCheckpointType(currentStage);
  const checkpoint = {
    type: checkpointType,
    label: checkpointTypeLabel(checkpointType),
    current_stage: currentStage,
    stage_elapsed_fraction: stageCheckpoint.stageElapsedFraction,
    working_percent: arcpCountdown.workingPercent,
  } as const;

  const cipsPayload = computeProgressCipRows({
    cips,
    keySkills,
    descriptors,
    scopedEntryIds,
    scopedEntries,
    confirmedRows: (confirmedRes.data ?? []) as ConfirmedRow[],
    coverageRows: (coverageRes.data ?? []) as CoverageRow[],
    checkpoint,
  });

  const body: ProgressCipsResponse = {
    scope: scopeEcho,
    checkpoint,
    cips: cipsPayload,
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
