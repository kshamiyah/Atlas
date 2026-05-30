import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import { needsLightweightStatusRefresh } from "@/lib/kaizen/evidence-eligibility";

export async function GET(req: NextRequest) {
  const auth = await getUserFromBearerToken(req.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { user, accessToken } = auth;
  const supabase = createSupabaseClientWithToken(accessToken);

  const { data, error } = await supabase
    .from("kaizen_entries")
    .select(
      "source_entry_id, source_url, title, assessment_type, detected_entry_type, status, extracted_fields, synced_at",
    )
    .eq("user_id", user.id)
    .order("synced_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];

  const known_ids = rows
    .map((row) => String(row.source_entry_id ?? "").trim())
    .filter(Boolean);

  const refresh_entries = rows
    .filter((row) =>
      needsLightweightStatusRefresh({
        detected_entry_type: row.detected_entry_type,
        assessment_type: row.assessment_type,
        title: row.title,
        status: row.status,
        extracted_fields: row.extracted_fields as Record<string, unknown> | null | undefined,
      }),
    )
    .map((row) => ({
      source_entry_id: String(row.source_entry_id ?? "").trim() || null,
      source_url: String(row.source_url ?? "").trim() || null,
      title: String(row.title ?? "").trim(),
      assessment_type: String(row.assessment_type ?? "").trim(),
      status: String(row.status ?? "").trim(),
      synced_at: String(row.synced_at ?? "").trim() || null,
    }))
    .filter((row) => row.source_url)
    .sort((a, b) => {
      const aTeam = /team\s+observation|\bto2\b|to2 for to1/i.test(
        `${a.title} ${a.assessment_type}`,
      )
        ? 1
        : 0;
      const bTeam = /team\s+observation|\bto2\b|to2 for to1/i.test(
        `${b.title} ${b.assessment_type}`,
      )
        ? 1
        : 0;
      if (aTeam !== bTeam) return bTeam - aTeam;
      return 0;
    })
    .slice(0, 20);

  return NextResponse.json({
    known_ids,
    refresh_entries,
  });
}
