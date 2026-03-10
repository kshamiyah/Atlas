import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export type EntriesSyncBody = {
  entries: Array<{
    kaizen_date: string;
    assessment_type: string;
    title: string;
    category: string;
    training_year: string;
    status: string;
    key_skills_count?: number | null;
  }>;
};

export async function POST(request: Request) {
  const auth = await getUserFromBearerToken(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { user, accessToken } = auth;

  let body: EntriesSyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { entries } = body;
  if (!Array.isArray(entries)) {
    return NextResponse.json(
      { error: "Body must include entries array" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseClientWithToken(accessToken);

  const { error: deleteError } = await supabase
    .from("kaizen_entries")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to clear existing entries: " + deleteError.message },
      { status: 500 }
    );
  }

  if (entries.length > 0) {
    const rows = entries.map((e, i) => ({
      user_id: user.id,
      sort_order: i,
      kaizen_date: String(e.kaizen_date ?? ""),
      assessment_type: String(e.assessment_type ?? ""),
      title: String(e.title ?? ""),
      category: String(e.category ?? ""),
      training_year: String(e.training_year ?? ""),
      status: String(e.status ?? ""),
      key_skills_count: e.key_skills_count ?? null,
    }));

    const { error: insertError } = await supabase
      .from("kaizen_entries")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert entries: " + insertError.message },
        { status: 500 }
      );
    }
  }

  await supabase.from("kaizen_sync_log").insert({
    user_id: user.id,
    sync_type: "entries",
    data_hash: String(entries.length),
  });

  return NextResponse.json({
    ok: true,
    synced: entries.length,
  });
}
