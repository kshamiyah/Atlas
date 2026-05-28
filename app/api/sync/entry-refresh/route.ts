import { NextResponse } from "next/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import { resolveOsatsStorageFields } from "@/lib/requirements/osats-evidence";

type EntryRefreshBody = {
  entry?: {
    source_entry_id?: unknown;
    source_url?: unknown;
    detected_entry_type?: unknown;
    kaizen_date?: unknown;
    assessment_type?: unknown;
    title?: unknown;
    category?: unknown;
    training_year?: unknown;
    status?: unknown;
    linked_cip_number?: unknown;
    entry_text?: unknown;
    extracted_fields?: unknown;
    extraction_status?: unknown;
    key_skills_count?: unknown;
    kaizen_procedure_id?: unknown;
    assessor_role_id?: unknown;
  };
};

type ExistingEntryRow = {
  id: string;
  source_entry_id: string | null;
  source_url: string | null;
  detected_entry_type: string | null;
  kaizen_date: string | null;
  assessment_type: string | null;
  title: string | null;
  category: string | null;
  training_year: string | null;
  status: string | null;
  linked_cip_number: number | null;
  entry_text: string | null;
  extracted_fields: Record<string, unknown> | null;
  extraction_status: "none" | "partial" | "full" | "failed" | null;
  key_skills_count: number | null;
  kaizen_procedure_id: number | null;
  assessor_role_id: number | null;
  synced_at: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean || null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function readLinkedCipNumber(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed == null) return null;
  if (parsed < 1 || parsed > 14) return null;
  return parsed;
}

function readExtractionStatus(
  value: unknown,
): "none" | "partial" | "full" | "failed" | null {
  return value === "none" ||
    value === "partial" ||
    value === "full" ||
    value === "failed"
    ? value
    : null;
}

function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  const auth = await getUserFromBearerToken(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: EntryRefreshBody;
  try {
    body = (await request.json()) as EntryRefreshBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entry = body?.entry;
  if (!entry || typeof entry !== "object") {
    return NextResponse.json({ error: "entry object is required" }, { status: 400 });
  }

  const sourceEntryId = readString(entry.source_entry_id);
  const sourceUrl = readString(entry.source_url);
  if (!sourceEntryId && !sourceUrl) {
    return NextResponse.json(
      { error: "source_entry_id or source_url is required" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseClientWithToken(auth.accessToken);

  let existing: ExistingEntryRow | null = null;
  if (sourceEntryId) {
    const { data, error } = await supabase
      .from("kaizen_entries")
      .select(
        "id, source_entry_id, source_url, detected_entry_type, kaizen_date, assessment_type, title, category, training_year, status, linked_cip_number, entry_text, extracted_fields, extraction_status, key_skills_count, kaizen_procedure_id, assessor_role_id, synced_at",
      )
      .eq("user_id", auth.user.id)
      .eq("source_entry_id", sourceEntryId)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Failed to load existing entry by source_entry_id: " + error.message },
        { status: 500 },
      );
    }
    existing = (data as ExistingEntryRow | null) ?? null;
  }

  if (!existing && sourceUrl) {
    const { data, error } = await supabase
      .from("kaizen_entries")
      .select(
        "id, source_entry_id, source_url, detected_entry_type, kaizen_date, assessment_type, title, category, training_year, status, linked_cip_number, entry_text, extracted_fields, extraction_status, key_skills_count, kaizen_procedure_id, assessor_role_id, synced_at",
      )
      .eq("user_id", auth.user.id)
      .eq("source_url", sourceUrl)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Failed to load existing entry by source_url: " + error.message },
        { status: 500 },
      );
    }
    existing = (data as ExistingEntryRow | null) ?? null;
  }

  const incomingExtractedFields = readObject(entry.extracted_fields);
  const extractedFields =
    incomingExtractedFields ??
    existing?.extracted_fields ??
    {};

  const titleFromExtracted = readString(extractedFields.title);
  const title =
    readString(entry.title) ??
    titleFromExtracted ??
    readString(existing?.title) ??
    "Untitled entry";

  const entryText = normaliseText(
    readString(entry.entry_text) ??
      readString(existing?.entry_text) ??
      title,
  );

  const extractionStatus =
    readExtractionStatus(entry.extraction_status) ??
    (entryText.length >= 260
      ? "full"
      : entryText.length > 0
        ? "partial"
        : readExtractionStatus(existing?.extraction_status) ?? "failed");

  const detectedEntryType =
    readString(entry.detected_entry_type) ??
    readString(existing?.detected_entry_type) ??
    null;

  let kaizenProcedureId =
    readInteger(entry.kaizen_procedure_id) ??
    existing?.kaizen_procedure_id ??
    null;
  let assessorRoleId =
    readInteger(entry.assessor_role_id) ??
    existing?.assessor_role_id ??
    null;

  if (detectedEntryType === "osats_summative") {
    const { data: proceduresCatalog } = await supabase
      .from("procedures_catalog")
      .select("kaizen_id, name")
      .not("kaizen_id", "is", null);

    if (proceduresCatalog && proceduresCatalog.length > 0) {
      const resolved = resolveOsatsStorageFields(
        {
          detected_entry_type: detectedEntryType,
          extracted_fields: extractedFields,
          kaizen_procedure_id: kaizenProcedureId,
          assessor_role_id: assessorRoleId,
        },
        proceduresCatalog as Array<{ kaizen_id: number; name: string }>,
      );
      kaizenProcedureId = resolved.kaizen_procedure_id;
      assessorRoleId = resolved.assessor_role_id;
    }
  }

  const row = {
    user_id: auth.user.id,
    source_entry_id: sourceEntryId ?? existing?.source_entry_id ?? null,
    source_url: sourceUrl ?? existing?.source_url ?? null,
    detected_entry_type: detectedEntryType,
    kaizen_date:
      readString(entry.kaizen_date) ??
      readString(existing?.kaizen_date) ??
      "",
    assessment_type:
      readString(entry.assessment_type) ??
      readString(existing?.assessment_type) ??
      "",
    title,
    category:
      readString(entry.category) ??
      readString(existing?.category) ??
      "",
    training_year:
      readString(entry.training_year) ??
      readString(existing?.training_year) ??
      "",
    status:
      readString(entry.status) ??
      readString(existing?.status) ??
      "",
    linked_cip_number:
      readLinkedCipNumber(entry.linked_cip_number) ??
      existing?.linked_cip_number ??
      null,
    entry_text: entryText,
    extracted_fields: extractedFields,
    extraction_status: extractionStatus,
    key_skills_count:
      readInteger(entry.key_skills_count) ??
      existing?.key_skills_count ??
      null,
    kaizen_procedure_id: kaizenProcedureId,
    assessor_role_id: assessorRoleId,
    synced_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("kaizen_entries")
      .update(row)
      .eq("id", existing.id)
      .eq("user_id", auth.user.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to refresh entry snapshot: " + error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "updated",
      source_entry_id: row.source_entry_id,
      source_url: row.source_url,
    });
  }

  const { error } = await supabase.from("kaizen_entries").insert(row);
  if (error) {
    return NextResponse.json(
      { error: "Failed to insert refreshed entry snapshot: " + error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "inserted",
    source_entry_id: row.source_entry_id,
    source_url: row.source_url,
  });
}
