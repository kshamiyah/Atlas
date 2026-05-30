import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  mergeCipAssessmentUpsertRow,
  toCipAssessmentUpsertRow,
  type CipAssessmentRecord,
} from "@/lib/kaizen/cip-assessment";

type CipAssessmentItem = {
  kaizen_entry_id: string | null;
  cip_number: number | null;
  cip_kaizen_id: number | null;
  cip_name: string | null;
  date: string | null;
  trainee_entrustment?: number | null;
  trainee_level?: number | null;
  trainee_comments: string | null;
  es_agrees: boolean | null;
  es_entrustment?: number | null;
  es_meets_expectations?: boolean | null;
  es_level?: number | null;
  es_comments: string | null;
  status: string;
  extracted_fields?: Record<string, unknown> | null;
  title?: string | null;
};

type SyncBody = {
  assessments: CipAssessmentItem[];
};

function normalizeEntrustment(value: unknown): number | null {
  return typeof value === "number" && value >= 1 && value <= 5 ? value : null;
}

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
    .map((item) =>
      toCipAssessmentUpsertRow(userId, item.kaizen_entry_id, {
        title: item.title ?? null,
        cip_number: item.cip_number,
        kaizen_date: item.date,
        status: item.status,
        extracted_fields: item.extracted_fields ?? undefined,
        trainee_entrustment: normalizeEntrustment(item.trainee_entrustment ?? item.trainee_level),
        trainee_level: normalizeEntrustment(item.trainee_level),
        es_entrustment: normalizeEntrustment(item.es_entrustment),
        es_meets_expectations:
          typeof item.es_meets_expectations === "boolean" ? item.es_meets_expectations : null,
        es_level: typeof item.es_level === "number" ? item.es_level : null,
        es_agrees: typeof item.es_agrees === "boolean" ? item.es_agrees : null,
        trainee_comments: item.trainee_comments,
        es_comments: item.es_comments,
      }),
    )
    .filter((row) => row.cip_number != null || row.kaizen_entry_id);

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const kaizenEntryIds = rows
    .map((row) => row.kaizen_entry_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingByKaizenId = new Map<string, CipAssessmentRecord>();
  if (kaizenEntryIds.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("cip_assessments")
      .select(
        "id, kaizen_entry_id, cip_number, cip_kaizen_id, cip_name, date, trainee_entrustment, trainee_level, trainee_comments, es_agrees, es_entrustment, es_meets_expectations, es_level, es_comments, status, updated_at",
      )
      .eq("user_id", userId)
      .in("kaizen_entry_id", kaizenEntryIds);

    if (existingError) {
      console.error("[sync/cip-assessments] existing lookup error:", existingError);
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    for (const row of (existingRows ?? []) as CipAssessmentRecord[]) {
      if (row.kaizen_entry_id) existingByKaizenId.set(row.kaizen_entry_id, row);
    }
  }

  const mergedRows = rows.map((row) =>
    mergeCipAssessmentUpsertRow(
      row.kaizen_entry_id ? existingByKaizenId.get(row.kaizen_entry_id) : null,
      row,
    ),
  );

  const { error } = await supabase
    .from("cip_assessments")
    .upsert(mergedRows, { onConflict: "user_id,kaizen_entry_id", ignoreDuplicates: false });

  if (error) {
    console.error("[sync/cip-assessments] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: mergedRows.length });
}
