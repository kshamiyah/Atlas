import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type {
  KeySkillReviewReplaceCancelBody,
  KeySkillReviewReplaceCancelResponse,
} from "@/lib/types/key-skill-review-api";

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  status: string;
};

type PushQueueError = {
  code?: string;
  message?: string;
  details?: string;
};

function isMissingPushQueueActionColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PushQueueError;
  if (err.code !== "42703") return false;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return ["action_type", "group_id"].some((column) => haystack.includes(column));
}

async function restoreSuggestionStatus(
  supabase: Awaited<ReturnType<typeof getServerSupabaseClient>>,
  userId: string,
  suggestionId: string,
  status: string,
) {
  await supabase
    .from("key_skill_review_suggestions")
    .update({ status })
    .eq("user_id", userId)
    .eq("id", suggestionId);
}

export async function POST(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: KeySkillReviewReplaceCancelBody;
  try {
    body = (await request.json()) as KeySkillReviewReplaceCancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string" ? body.review_entry_id.trim() : "";
  const recommendationSuggestionId =
    typeof body.recommendation_suggestion_id === "string"
      ? body.recommendation_suggestion_id.trim()
      : "";
  const replaceSuggestionId =
    typeof body.replace_suggestion_id === "string"
      ? body.replace_suggestion_id.trim()
      : "";
  const groupId = typeof body.group_id === "string" ? body.group_id.trim() : "";

  if (!reviewEntryId) {
    return NextResponse.json({ error: "review_entry_id is required" }, { status: 400 });
  }
  if (!recommendationSuggestionId) {
    return NextResponse.json(
      { error: "recommendation_suggestion_id is required" },
      { status: 400 },
    );
  }
  if (!replaceSuggestionId) {
    return NextResponse.json({ error: "replace_suggestion_id is required" }, { status: 400 });
  }

  const { data: suggestions, error: suggestionsError } = await supabase
    .from("key_skill_review_suggestions")
    .select("id, review_entry_id, status")
    .eq("user_id", user.id)
    .eq("review_entry_id", reviewEntryId)
    .in("id", [recommendationSuggestionId, replaceSuggestionId]);

  if (suggestionsError) {
    return NextResponse.json(
      { error: "Failed to load replace suggestions: " + suggestionsError.message },
      { status: 500 },
    );
  }

  const suggestionRows = (suggestions ?? []) as SuggestionRow[];
  const recommendationRow = suggestionRows.find((row) => row.id === recommendationSuggestionId);
  const replaceRow = suggestionRows.find((row) => row.id === replaceSuggestionId);
  if (!recommendationRow || !replaceRow) {
    return NextResponse.json(
      { error: "Replace suggestions not found for this entry" },
      { status: 404 },
    );
  }

  const recommendationPreviousStatus = recommendationRow.status;
  const replacePreviousStatus = replaceRow.status;

  const { error: resetRecommendationError } = await supabase
    .from("key_skill_review_suggestions")
    .update({ status: "suggested" })
    .eq("user_id", user.id)
    .eq("id", recommendationSuggestionId);
  if (resetRecommendationError) {
    return NextResponse.json(
      {
        error:
          "Failed to reset recommendation suggestion: " + resetRecommendationError.message,
      },
      { status: 500 },
    );
  }

  const { error: restoreReplaceError } = await supabase
    .from("key_skill_review_suggestions")
    .update({ status: "confirmed" })
    .eq("user_id", user.id)
    .eq("id", replaceSuggestionId);
  if (restoreReplaceError) {
    await restoreSuggestionStatus(
      supabase,
      user.id,
      recommendationSuggestionId,
      recommendationPreviousStatus,
    );
    return NextResponse.json(
      { error: "Failed to restore replaced suggestion: " + restoreReplaceError.message },
      { status: 500 },
    );
  }

  const suggestionIds = [recommendationSuggestionId, replaceSuggestionId];
  const clearQueueBySuggestionIds = async () =>
    supabase
      .from("key_skill_review_push_queue")
      .delete()
      .eq("user_id", user.id)
      .in("suggestion_id", suggestionIds);

  let clearQueueError: PushQueueError | null = null;

  if (groupId) {
    const clearByGroup = await supabase
      .from("key_skill_review_push_queue")
      .delete()
      .eq("user_id", user.id)
      .eq("group_id", groupId);

    if (clearByGroup.error && !isMissingPushQueueActionColumnsError(clearByGroup.error)) {
      clearQueueError = clearByGroup.error as PushQueueError;
    }
  }

  if (!clearQueueError) {
    const clearBySuggestionIds = await clearQueueBySuggestionIds();
    if (clearBySuggestionIds.error) {
      clearQueueError = clearBySuggestionIds.error as PushQueueError;
    }
  }

  if (clearQueueError) {
    await restoreSuggestionStatus(
      supabase,
      user.id,
      recommendationSuggestionId,
      recommendationPreviousStatus,
    );
    await restoreSuggestionStatus(supabase, user.id, replaceSuggestionId, replacePreviousStatus);
    return NextResponse.json(
      { error: "Failed to clear replace queue rows: " + (clearQueueError.message ?? "unknown") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    review_entry_id: reviewEntryId,
    cleared_suggestion_ids: suggestionIds,
    group_id: groupId || null,
  } satisfies KeySkillReviewReplaceCancelResponse);
}
