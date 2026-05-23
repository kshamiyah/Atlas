import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { KeySkillReviewReplaceBody, KeySkillReviewActionResponse } from "@/lib/types/key-skill-review-api";

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  status: string;
};

type KeySkillRow = {
  id: string;
  kaizen_ids: string[] | null;
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

function firstKaizenId(row: KeySkillRow | null | undefined): string | null {
  const ids = Array.isArray(row?.kaizen_ids)
    ? row!.kaizen_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  return ids.length > 0 ? ids[0] : null;
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

async function deleteSuggestion(
  supabase: Awaited<ReturnType<typeof getServerSupabaseClient>>,
  userId: string,
  suggestionId: string,
) {
  await supabase
    .from("key_skill_review_suggestions")
    .delete()
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

  let body: KeySkillReviewReplaceBody;
  try {
    body = (await request.json()) as KeySkillReviewReplaceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string" ? body.review_entry_id.trim() : "";
  const recommendationSuggestionId =
    typeof body.recommendation_suggestion_id === "string"
      ? body.recommendation_suggestion_id.trim()
      : "";
  const replaceSkillId =
    typeof body.replace_skill_id === "string" ? body.replace_skill_id.trim() : "";
  const replaceKaizenSkillId =
    typeof body.replace_kaizen_skill_id === "string"
      ? body.replace_kaizen_skill_id.trim()
      : "";
  const recommendationReason =
    typeof body.recommendation_reason === "string"
      ? body.recommendation_reason.trim()
      : "";
  const removeReason =
    typeof body.remove_reason === "string" ? body.remove_reason.trim() : "";

  if (!reviewEntryId) {
    return NextResponse.json({ error: "review_entry_id is required" }, { status: 400 });
  }
  if (!recommendationSuggestionId) {
    return NextResponse.json(
      { error: "recommendation_suggestion_id is required" },
      { status: 400 },
    );
  }
  if (!replaceSkillId) {
    return NextResponse.json({ error: "replace_skill_id is required" }, { status: 400 });
  }
  if (!replaceKaizenSkillId) {
    return NextResponse.json(
      { error: "replace_kaizen_skill_id is required for safe replacement" },
      { status: 400 },
    );
  }

  const [addSuggestionResult, removeSuggestionResult] = await Promise.all([
    supabase
      .from("key_skill_review_suggestions")
      .select("id, review_entry_id, key_skill_id, status")
      .eq("user_id", user.id)
      .eq("id", recommendationSuggestionId)
      .eq("review_entry_id", reviewEntryId)
      .maybeSingle(),
    supabase
      .from("key_skill_review_suggestions")
      .select("id, review_entry_id, key_skill_id, status")
      .eq("user_id", user.id)
      .eq("review_entry_id", reviewEntryId)
      .eq("key_skill_id", replaceSkillId)
      .eq("suggestion_source", "linked_cip")
      .maybeSingle(),
  ]);

  if (addSuggestionResult.error) {
    return NextResponse.json(
      { error: "Failed to load recommendation suggestion: " + addSuggestionResult.error.message },
      { status: 500 },
    );
  }
  if (removeSuggestionResult.error) {
    return NextResponse.json(
      { error: "Failed to load linked suggestion to replace: " + removeSuggestionResult.error.message },
      { status: 500 },
    );
  }
  const addSuggestion = addSuggestionResult.data as SuggestionRow | null;
  let removeSuggestion = removeSuggestionResult.data as SuggestionRow | null;
  let createdRemoveSuggestion = false;

  if (!addSuggestion) {
    return NextResponse.json(
      { error: "Recommendation suggestion not found for this entry" },
      { status: 404 },
    );
  }
  if (!removeSuggestion) {
    const createRemoveSuggestionResult = await supabase
      .from("key_skill_review_suggestions")
      .upsert(
        {
          user_id: user.id,
          review_entry_id: reviewEntryId,
          key_skill_id: replaceSkillId,
          suggestion_source: "linked_cip",
          method: "rule",
          status: "confirmed",
          confidence: 1,
          rationale: "Current Kaizen link placeholder for replace action",
        },
        { onConflict: "review_entry_id,key_skill_id,suggestion_source" },
      )
      .select("id, review_entry_id, key_skill_id, status")
      .maybeSingle();

    if (createRemoveSuggestionResult.error) {
      return NextResponse.json(
        {
          error:
            "Failed to create linked suggestion placeholder for replace: " +
            createRemoveSuggestionResult.error.message,
        },
        { status: 500 },
      );
    }
    removeSuggestion = createRemoveSuggestionResult.data as SuggestionRow | null;
    createdRemoveSuggestion = Boolean(removeSuggestion);
  }

  if (!removeSuggestion) {
    return NextResponse.json(
      { error: "Linked skill to replace could not be prepared for this entry" },
      { status: 500 },
    );
  }

  const keySkillsResult = await supabase
    .from("key_skills")
    .select("id, kaizen_ids")
    .in("id", [addSuggestion.key_skill_id, replaceSkillId]);
  if (keySkillsResult.error) {
    return NextResponse.json(
      { error: "Failed to load key skill metadata: " + keySkillsResult.error.message },
      { status: 500 },
    );
  }

  const keySkillById = new Map(
    (keySkillsResult.data ?? []).map((row) => [String((row as KeySkillRow).id), row as KeySkillRow]),
  );
  const addKaizenId = firstKaizenId(keySkillById.get(addSuggestion.key_skill_id));
  const removeKaizenId = replaceKaizenSkillId;
  const groupId = randomUUID();
  const addPreviousStatus = addSuggestion.status;
  const removePreviousStatus = removeSuggestion.status;
  let addApplied = false;
  let removeApplied = false;

  try {
    if (addSuggestion.status !== "confirmed") {
      const { error: addStatusError } = await supabase
        .from("key_skill_review_suggestions")
        .update({ status: "confirmed" })
        .eq("user_id", user.id)
        .eq("id", addSuggestion.id);
      if (addStatusError) {
        return NextResponse.json(
          { error: "Failed to confirm replacement recommendation: " + addStatusError.message },
          { status: 500 },
        );
      }
      addApplied = true;
    }

    if (removeSuggestion.status !== "rejected") {
      const { error: removeStatusError } = await supabase
        .from("key_skill_review_suggestions")
        .update({ status: "rejected" })
        .eq("user_id", user.id)
        .eq("id", removeSuggestion.id);
      if (removeStatusError) {
        throw removeStatusError;
      }
      removeApplied = true;
    }

    const queueRows = [
      {
        user_id: user.id,
        suggestion_id: removeSuggestion.id,
        review_entry_id: reviewEntryId,
        key_skill_id: replaceSkillId,
        status: "pending",
        attempt_count: 0,
        last_error: null,
        synced_at: null,
        action_type: "replace_remove",
        group_id: groupId,
        sequence_index: 1,
        kaizen_skill_id: removeKaizenId,
        payload: {
          action: "replace",
          role: "remove",
          reason: removeReason || recommendationReason || null,
          group_id: groupId,
          recommendation_suggestion_id: recommendationSuggestionId,
          review_entry_id: reviewEntryId,
          key_skill_id: replaceSkillId,
        },
      },
      {
        user_id: user.id,
        suggestion_id: addSuggestion.id,
        review_entry_id: reviewEntryId,
        key_skill_id: addSuggestion.key_skill_id,
        status: "pending",
        attempt_count: 0,
        last_error: null,
        synced_at: null,
        action_type: "replace_add",
        group_id: groupId,
        sequence_index: 2,
        kaizen_skill_id: addKaizenId,
        payload: {
          action: "replace",
          role: "add",
          reason: recommendationReason || null,
          group_id: groupId,
          recommendation_suggestion_id: recommendationSuggestionId,
          review_entry_id: reviewEntryId,
          key_skill_id: addSuggestion.key_skill_id,
          replace_skill_id: replaceSkillId,
        },
      },
    ];

    const { error: queueError } = await supabase
      .from("key_skill_review_push_queue")
      .upsert(queueRows, {
        onConflict: "suggestion_id",
      });

    if (queueError) {
      if (isMissingPushQueueActionColumnsError(queueError)) {
        throw Object.assign(new Error(queueError.message), { code: "42703" });
      }
      throw queueError;
    }
  } catch (err) {
    if (addApplied) {
      await restoreSuggestionStatus(supabase, user.id, addSuggestion.id, addPreviousStatus);
    }
    if (removeApplied) {
      await restoreSuggestionStatus(supabase, user.id, removeSuggestion.id, removePreviousStatus);
    } else if (createdRemoveSuggestion) {
      await deleteSuggestion(supabase, user.id, removeSuggestion.id);
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      String((err as { code?: string }).code) === "42703"
    ) {
      return NextResponse.json(
        {
          error:
            "Failed to queue replacement because the push queue action columns are unavailable: " +
            (err as Error).message,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to queue replacement action",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    review_entry_id: reviewEntryId,
    group_id: groupId,
    queued: [
      {
        suggestion_id: removeSuggestion.id,
        action_type: "replace_remove",
        sequence_index: 1,
      },
      {
        suggestion_id: addSuggestion.id,
        action_type: "replace_add",
        sequence_index: 2,
      },
    ],
  } satisfies KeySkillReviewActionResponse);
}
