import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

type CipAssessmentItem = {
  kaizen_entry_id: string | null;
  cip_number: number | null;
  cip_kaizen_id: number | null;
  cip_name: string | null;
  date: string | null;
  trainee_level: number | null;
  trainee_comments: string | null;
  es_agrees: boolean | null;
  es_level: number | null;
  es_comments: string | null;
  status: string;
};

type SyncBody = {
  assessments: CipAssessmentItem[];
};

export async function POST(request: Request) {
  const supabase = await getServerSupabaseClient();
  const authHeader = request.headers.get("Authorization");

  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = Array.isArray(body?.assessments) ? body.assessments : [];
  if (items.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const rows = items
    .filter((item) => item.kaizen_entry_id || item.cip_number)
    .map((item) => ({
      user_id: userId,
      kaizen_entry_id: item.kaizen_entry_id ?? null,
      cip_number: item.cip_number ?? null,
      cip_kaizen_id: item.cip_kaizen_id ?? null,
      cip_name: item.cip_name ?? null,
      date: item.date ?? null,
      trainee_level:
        typeof item.trainee_level === "number" &&
        item.trainee_level >= 1 &&
        item.trainee_level <= 5
          ? item.trainee_level
          : null,
      trainee_comments: item.trainee_comments ?? null,
      es_agrees: typeof item.es_agrees === "boolean" ? item.es_agrees : null,
      es_level:
        typeof item.es_level === "number" &&
        item.es_level >= 1 &&
        item.es_level <= 5
          ? item.es_level
          : null,
      es_comments: item.es_comments ?? null,
      status: ["draft", "pending", "complete"].includes(item.status)
        ? item.status
        : "pending",
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const { error } = await supabase
    .from("cip_assessments")
    .upsert(rows, { onConflict: "user_id,kaizen_entry_id", ignoreDuplicates: false });

  if (error) {
    console.error("[sync/cip-assessments] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: rows.length });
}
