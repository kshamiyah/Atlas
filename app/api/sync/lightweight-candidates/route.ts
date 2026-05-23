import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import {
  extractAssessmentRequestSignal,
  requiresAssessorSignoff,
} from "@/lib/kaizen/evidence-eligibility";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isClearlyComplete(status: string, requestSignal: string): boolean {
  const combined = `${normalizeText(status)} ${normalizeText(requestSignal)}`
    .trim()
    .toLowerCase();

  return (
    combined.includes("completed") ||
    combined.includes("complete") ||
    combined.includes("signed")
  );
}

function shouldRefreshAssessorEntry(status: string, requestSignal: string): boolean {
  if (isClearlyComplete(status, requestSignal)) return false;

  const combined = `${normalizeText(status)} ${normalizeText(requestSignal)}`
    .trim()
    .toLowerCase();

  return (
    combined.includes("expired") ||
    combined.includes("pending") ||
    combined.includes("awaiting") ||
    combined.includes("requested") ||
    combined.includes("ready for assessment") ||
    combined.length === 0
  );
}

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
      requiresAssessorSignoff(row.detected_entry_type, row.assessment_type),
    )
    .map((row) => {
      const requestSignal = extractAssessmentRequestSignal(
        row.extracted_fields as Record<string, unknown> | null | undefined,
      );

      return {
        source_entry_id: String(row.source_entry_id ?? "").trim() || null,
        source_url: String(row.source_url ?? "").trim() || null,
        title: String(row.title ?? "").trim(),
        assessment_type: String(row.assessment_type ?? "").trim(),
        status: String(row.status ?? "").trim(),
        synced_at: String(row.synced_at ?? "").trim() || null,
        request_signal: requestSignal,
        should_refresh: shouldRefreshAssessorEntry(
          String(row.status ?? ""),
          requestSignal,
        ),
      };
    })
    .filter((row) => row.should_refresh && row.source_url)
    .slice(0, 20)
    .map(({ should_refresh: _ignored, ...row }) => row);

  return NextResponse.json({
    known_ids,
    refresh_entries,
  });
}
