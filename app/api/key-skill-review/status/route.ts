import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { UpdateSuggestionStatusBody } from "@/lib/types/key-skill-review-api";

const VALID_STATUSES = new Set<UpdateSuggestionStatusBody["status"]>([
  "suggested",
  "confirmed",
  "rejected",
]);

function isQueueTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    haystack.includes("key_skill_review_push_queue") &&
    (haystack.includes("does not exist") || haystack.includes("could not find"))
  );
}

export async function PATCH(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 },
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateSuggestionStatusBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const suggestionId =
    typeof body.suggestion_id === "string" ? body.suggestion_id.trim() : "";
  const status = body.status;

  if (!suggestionId) {
    return NextResponse.json(
      { error: "suggestion_id is required" },
      { status: 400 },
    );
  }

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "Invalid status" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("key_skill_review_suggestions")
    .update({ status })
    .eq("id", suggestionId)
    .eq("user_id", user.id)
    .select("id, suggestion_source, review_entry_id, key_skill_id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update status: " + error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Suggestion not found" },
      { status: 404 },
    );
  }

  const suggestionSource = String(data.suggestion_source ?? "");
  const reviewEntryId = String(data.review_entry_id ?? "");
  const keySkillId = String(data.key_skill_id ?? "");

  if (
    suggestionSource === "cross_cip" &&
    reviewEntryId &&
    keySkillId
  ) {
    if (status === "confirmed") {
      const { error: queueError } = await supabase
        .from("key_skill_review_push_queue")
        .upsert(
          {
            user_id: user.id,
            suggestion_id: suggestionId,
            review_entry_id: reviewEntryId,
            key_skill_id: keySkillId,
            status: "pending",
            last_error: null,
            synced_at: null,
          },
          { onConflict: "suggestion_id" },
        );

      if (queueError && !isQueueTableMissing(queueError)) {
        return NextResponse.json(
          { error: "Suggestion updated, but failed to queue push-back: " + queueError.message },
          { status: 500 },
        );
      }
    } else {
      const { error: queueDeleteError } = await supabase
        .from("key_skill_review_push_queue")
        .delete()
        .eq("user_id", user.id)
        .eq("suggestion_id", suggestionId);

      if (queueDeleteError && !isQueueTableMissing(queueDeleteError)) {
        return NextResponse.json(
          {
            error:
              "Suggestion updated, but failed to remove queue item: " +
              queueDeleteError.message,
          },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
