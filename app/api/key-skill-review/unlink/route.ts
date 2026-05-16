import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

type UnlinkBody = {
  review_entry_id?: unknown;
  key_skill_id?: unknown;
  kaizen_skill_id?: unknown;
  reason?: unknown;
};

type LinkedSuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  status: string;
  suggestion_source: "linked_cip" | "cross_cip";
};

function isMissingPushQueueActionColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  if (err.code !== "42703") return false;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return [
    "action_type",
    "group_id",
    "sequence_index",
    "kaizen_skill_id",
    "payload",
  ].some((column) => haystack.includes(column));
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

  let body: UnlinkBody;
  try {
    body = (await request.json()) as UnlinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string" ? body.review_entry_id.trim() : "";
  const keySkillId = typeof body.key_skill_id === "string" ? body.key_skill_id.trim() : "";
  const kaizenSkillId =
    typeof body.kaizen_skill_id === "string" ? body.kaizen_skill_id.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!reviewEntryId) {
    return NextResponse.json({ error: "review_entry_id is required" }, { status: 400 });
  }
  if (!keySkillId) {
    return NextResponse.json({ error: "key_skill_id is required" }, { status: 400 });
  }
  if (!kaizenSkillId) {
    return NextResponse.json({ error: "kaizen_skill_id is required" }, { status: 400 });
  }

  const { data: suggestion, error: suggestionError } = await supabase
    .from("key_skill_review_suggestions")
    .select("id, review_entry_id, key_skill_id, status, suggestion_source")
    .eq("user_id", user.id)
    .eq("review_entry_id", reviewEntryId)
    .eq("key_skill_id", keySkillId)
    .in("suggestion_source", ["linked_cip", "cross_cip"]);

  if (suggestionError) {
    return NextResponse.json(
      { error: "Failed to load linked suggestion: " + suggestionError.message },
      { status: 500 },
    );
  }
  const suggestionRows = (suggestion ?? []) as LinkedSuggestionRow[];
  const linkedSuggestion =
    suggestionRows
      .slice()
      .sort((a, b) => {
        const sourceRank = (value: "linked_cip" | "cross_cip") =>
          value === "linked_cip" ? 0 : 1;
        const bySource =
          sourceRank(a.suggestion_source) - sourceRank(b.suggestion_source);
        if (bySource !== 0) return bySource;
        const statusRank = (value: string) =>
          value === "confirmed" ? 0 : value === "suggested" ? 1 : 2;
        return statusRank(a.status) - statusRank(b.status);
      })[0] ?? null;

  if (!linkedSuggestion) {
    return NextResponse.json(
      { error: "Linked suggestion not found for this entry and skill" },
      { status: 404 },
    );
  }
  const { error: suggestionStatusError } = await supabase
    .from("key_skill_review_suggestions")
    .update({ status: "rejected" })
    .eq("user_id", user.id)
    .eq("id", linkedSuggestion.id);

  if (suggestionStatusError) {
    return NextResponse.json(
      { error: "Failed to mark linked suggestion rejected: " + suggestionStatusError.message },
      { status: 500 },
    );
  }

  const { error: queueError } = await supabase
    .from("key_skill_review_push_queue")
    .upsert(
      {
        user_id: user.id,
        suggestion_id: linkedSuggestion.id,
        review_entry_id: reviewEntryId,
        key_skill_id: keySkillId,
        status: "pending",
        attempt_count: 0,
        last_error: null,
        synced_at: null,
        action_type: "remove",
        group_id: null,
        sequence_index: 1,
        kaizen_skill_id: kaizenSkillId,
        payload: {
          reason: reason || null,
          source: "unlink",
          review_entry_id: reviewEntryId,
          key_skill_id: keySkillId,
          kaizen_skill_id: kaizenSkillId,
        },
      },
      { onConflict: "suggestion_id" },
    );

  if (queueError) {
    const { error: rollbackError } = await supabase
      .from("key_skill_review_suggestions")
      .update({ status: linkedSuggestion.status as "suggested" | "confirmed" | "rejected" })
      .eq("user_id", user.id)
      .eq("id", linkedSuggestion.id);

    if (isMissingPushQueueActionColumnsError(queueError)) {
      return NextResponse.json(
        {
          error:
            "Failed to queue unlink action because the push queue action columns are unavailable: " +
            (queueError as { message?: string }).message,
          rollback_error: rollbackError?.message ?? null,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to queue unlink action: " + (queueError as { message?: string }).message,
        rollback_error: rollbackError?.message ?? null,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    review_entry_id: reviewEntryId,
    queued: [
      {
        suggestion_id: linkedSuggestion.id,
        action_type: "remove",
        sequence_index: 1,
      },
    ],
  });
}
