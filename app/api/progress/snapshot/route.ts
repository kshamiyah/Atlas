import { NextRequest, NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { parseProgressYearParam } from "@/lib/progress/query-params";
import {
  buildReviewStatusSummary,
  buildYearEvidenceCounts,
  filterKaizenEntriesForYear,
  filterReviewEntriesForYear,
  findPostForYear,
  formatPostWindowLabel,
  isRetrospectiveYear,
  parseProfilePosts,
  summarizeActivityByMonth,
  summarizeEntryTypes,
} from "@/lib/progress/year-portfolio";
import { normalizeStageName } from "@/lib/profile/stage";

function emptySnapshot(year: string | null) {
  return NextResponse.json({
    year,
    current_year: null,
    is_retrospective: false,
    post_window: null,
    post_window_label: null,
    evidence_scope_method: "training_year",
    evidence: {
      total_entries: 0,
      by_post_window: null,
      by_training_year: 0,
      entry_types: {},
      activity_by_month: [],
    },
    review: {
      entries_in_scope: 0,
      entries_with_confirmed_skills: 0,
      entries_awaiting_review: 0,
      pending_suggestions: 0,
      review_completion_pct: 0,
    },
  });
}

export async function GET(req: NextRequest) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();
  if (!userId && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const yearParam = parseProgressYearParam(url.searchParams.get("year"));
  if (yearParam.error) {
    return NextResponse.json({ error: yearParam.error }, { status: 400 });
  }
  if (!yearParam.value) {
    return NextResponse.json({ error: "year is required (ST1–ST7)" }, { status: 400 });
  }

  const year = yearParam.value;
  if (!userId) {
    return emptySnapshot(year);
  }

  const [profileRes, stagesRes, kaizenEntriesRes, reviewEntriesRes, suggestionsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("current_stage_id, current_grade, post_history")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("stages").select("id, name").order("sort_order", { ascending: true }),
      supabase
        .from("kaizen_entries")
        .select("id, kaizen_date, training_year, detected_entry_type, assessment_type")
        .eq("user_id", userId),
      supabase
        .from("key_skill_review_entries")
        .select("id, stage_id, event_date")
        .eq("user_id", userId),
      supabase
        .from("key_skill_review_suggestions")
        .select("review_entry_id, status")
        .eq("user_id", userId),
    ]);

  const stageRows = stagesRes.data ?? [];
  const currentStageName =
    profileRes.data?.current_stage_id
      ? stageRows.find((row) => row.id === profileRes.data?.current_stage_id)?.name ?? null
      : profileRes.data?.current_grade ?? null;
  const currentYear = normalizeStageName(currentStageName);
  const yearStageId = stageRows.find((row) => row.name === year)?.id ?? null;

  const posts = parseProfilePosts(profileRes.data?.post_history);
  const postWindow = findPostForYear(posts, year);
  const kaizenEntries = kaizenEntriesRes.data ?? [];

  const evidenceCounts = buildYearEvidenceCounts(kaizenEntries, year, postWindow);
  const scopedKaizenEntries = filterKaizenEntriesForYear(kaizenEntries, year, postWindow);
  const scopedReviewEntries = filterReviewEntriesForYear(
    reviewEntriesRes.data ?? [],
    year,
    yearStageId,
    postWindow,
  );
  const scopedReviewEntryIds = new Set(scopedReviewEntries.map((entry) => entry.id));

  const entriesWithConfirmed = new Set<string>();
  let pendingSuggestions = 0;
  for (const row of suggestionsRes.data ?? []) {
    if (!scopedReviewEntryIds.has(row.review_entry_id)) continue;
    if (row.status === "confirmed") entriesWithConfirmed.add(row.review_entry_id);
    if (row.status === "suggested") pendingSuggestions += 1;
  }

  const review = buildReviewStatusSummary({
    scopedReviewEntryIds,
    entriesWithConfirmed,
    pendingSuggestions,
  });

  return NextResponse.json({
    year,
    current_year: currentYear,
    is_retrospective: isRetrospectiveYear(year, currentYear),
    post_window: postWindow,
    post_window_label: formatPostWindowLabel(postWindow),
    evidence_scope_method: evidenceCounts.scope_method,
    evidence: {
      total_entries: evidenceCounts.primary,
      by_post_window: evidenceCounts.by_post_window,
      by_training_year: evidenceCounts.by_training_year,
      entry_types: summarizeEntryTypes(scopedKaizenEntries),
      activity_by_month: summarizeActivityByMonth(scopedKaizenEntries),
    },
    review,
  });
}
