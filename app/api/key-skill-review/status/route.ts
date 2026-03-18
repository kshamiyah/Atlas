import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { UpdateSuggestionStatusBody } from "@/lib/types/key-skill-review-api";

const VALID_STATUSES = new Set<UpdateSuggestionStatusBody["status"]>([
  "suggested",
  "confirmed",
  "rejected",
]);

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
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "Failed to update status: " + error.message },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Suggestion not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
