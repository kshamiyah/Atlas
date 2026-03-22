import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export type EntriesSyncBody = {
  entries: Array<{
    source_entry_id?: string | null;
    source_url?: string | null;
    detected_entry_type?: string | null;
    kaizen_date: string;
    assessment_type: string;
    title: string;
    category: string;
    training_year: string;
    status: string;
    linked_cip_number?: number | null;
    entry_text?: string | null;
    extracted_fields?: Record<string, unknown> | null;
    extraction_status?: "none" | "partial" | "full" | "failed" | null;
    key_skills_count?: number | null;
    kaizen_procedure_id?: number | null;
    assessor_role_id?: number | null;
  }>;
};

function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toLinkedCipNumberOrNull(
  value: number | null | undefined,
): number | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 14
  ) {
    return value;
  }
  return null;
}

function toExtractionStatus(
  inputStatus: EntriesSyncBody["entries"][number]["extraction_status"],
  mergedText: string,
): "none" | "partial" | "full" | "failed" {
  if (
    inputStatus === "none" ||
    inputStatus === "partial" ||
    inputStatus === "full" ||
    inputStatus === "failed"
  ) {
    return inputStatus;
  }
  if (mergedText.length >= 260) return "full";
  if (mergedText.length > 0) return "partial";
  return "failed";
}

function inferDetectedEntryType(
  assessmentType: string,
  title: string,
): string | null {
  const haystack = normaliseText(`${assessmentType} ${title}`).toLowerCase();

  if (/mini[-\s]?cex|minicex/.test(haystack)) return "minicex";
  if (/cbd|case[-\s]?based/.test(haystack)) return "cbd";
  if (/notss|non[-\s]?technical/.test(haystack)) return "notss";
  if (/osats.*summative|summative.*osats/.test(haystack))
    return "osats_summative";
  if (/osats|formative/.test(haystack)) return "osats_formative";
  if (/reflect|reflective/.test(haystack)) return "reflection";
  if (/procedure|logbook/.test(haystack)) return "procedure";
  if (/team observation|to2|to1/.test(haystack)) return "other_evidence";
  if (/course|conference|evidence/.test(haystack)) return "other_evidence";

  return null;
}

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
    const rows = entries.map((e) => {
      const title = String(e.title ?? "");
      const body = normaliseText(e.entry_text);
      const mergedText = normaliseText(`${title}\n${body}`);
      const detectedEntryTypeFromPayload =
        typeof e.detected_entry_type === "string"
          ? e.detected_entry_type.trim() || null
          : null;
      const extractionStatus = toExtractionStatus(
        e.extraction_status,
        mergedText,
      );

      return {
        user_id: user.id,
        source_entry_id:
          typeof e.source_entry_id === "string"
            ? e.source_entry_id.trim() || null
            : null,
        source_url:
          typeof e.source_url === "string" ? e.source_url.trim() || null : null,
        detected_entry_type:
          detectedEntryTypeFromPayload ??
          inferDetectedEntryType(String(e.assessment_type ?? ""), title),
        kaizen_date: String(e.kaizen_date ?? ""),
        assessment_type: String(e.assessment_type ?? ""),
        title,
        category: String(e.category ?? ""),
        training_year: String(e.training_year ?? ""),
        status: String(e.status ?? ""),
        linked_cip_number: toLinkedCipNumberOrNull(e.linked_cip_number),
        entry_text: mergedText || title,
        extracted_fields:
          e.extracted_fields && typeof e.extracted_fields === "object"
            ? e.extracted_fields
            : {},
        extraction_status: extractionStatus,
        key_skills_count: e.key_skills_count ?? null,
        kaizen_procedure_id:
          typeof e.kaizen_procedure_id === "number" ? e.kaizen_procedure_id : null,
        assessor_role_id:
          typeof e.assessor_role_id === "number" ? e.assessor_role_id : null,
      };
    });

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
