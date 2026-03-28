import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";
import { inferOsatsStorageFields } from "@/lib/requirements/osats-evidence";

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

type NormalisedEntryRow = {
  user_id: string;
  source_entry_id: string | null;
  source_url: string | null;
  detected_entry_type: string | null;
  kaizen_date: string;
  assessment_type: string;
  title: string;
  category: string;
  training_year: string;
  status: string;
  linked_cip_number: number | null;
  entry_text: string;
  extracted_fields: Record<string, unknown>;
  extraction_status: "none" | "partial" | "full" | "failed";
  key_skills_count: number | null;
  kaizen_procedure_id: number | null;
  assessor_role_id: number | null;
};

function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyRootOrSearchUrl(sourceUrl: string | null): boolean {
  if (!sourceUrl) return false;
  try {
    const parsed = new URL(sourceUrl);
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return pathname === "/" || pathname === "/search";
  } catch {
    return false;
  }
}

function isDateOnlyText(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return (
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(v) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)
  );
}

function isLikelyPortalShellText(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    (lower.includes("privacy and cookie policy") &&
      lower.includes("royal college of obstetricians and gynaecologists")) ||
    (lower.startsWith("hello ") &&
      lower.includes("royal berkshire hospital") &&
      lower.includes("royal college of obstetricians and gynaecologists"))
  );
}

function isLowSignalEntryRow(row: NormalisedEntryRow): boolean {
  const title = normaliseText(row.title);
  const assessmentType = normaliseText(row.assessment_type);
  const category = normaliseText(row.category);
  const trainingYear = normaliseText(row.training_year);
  const status = normaliseText(row.status);
  const text = normaliseText(row.entry_text);

  // Hard guard: rows scraped from generic site pages (/, /search) with no entry
  // identity fields should never be imported as portfolio evidence.
  if (isLikelyRootOrSearchUrl(row.source_url) && !title && !assessmentType) {
    return true;
  }

  const hasCoreMetadata = Boolean(
    title || assessmentType || category || trainingYear || status,
  );
  const hasMeaningfulText =
    text.length >= 24 && !isDateOnlyText(text) && !isLikelyPortalShellText(text);
  const extractedFieldKeys = Object.keys(row.extracted_fields ?? {});
  const hasMeaningfulExtractedField = extractedFieldKeys.some((key) => {
    const normalized = normaliseText(key).toLowerCase();
    return (
      normalized.length > 0 &&
      normalized !== "field links" &&
      normalized !== "results per page" &&
      normalized !== "user id" &&
      normalized !== "assessor id"
    );
  });

  return !hasCoreMetadata && !hasMeaningfulText && !hasMeaningfulExtractedField;
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
  let acceptedCount = 0;
  let skippedLowSignalCount = 0;

  if (entries.length > 0) {
    const rowsByKey = new Map<string, NormalisedEntryRow>();

    entries.forEach((e) => {
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
      const sourceEntryId =
        typeof e.source_entry_id === "string"
          ? e.source_entry_id.trim() || null
          : null;
      const sourceUrl =
        typeof e.source_url === "string" ? e.source_url.trim() || null : null;

      const dedupeKey =
        sourceEntryId
          ? `id:${sourceEntryId}`
          : sourceUrl
            ? `url:${sourceUrl}`
            : `fallback:${String(e.assessment_type ?? "")}:${String(e.kaizen_date ?? "")}:${title}`;

      rowsByKey.set(dedupeKey, {
        user_id: user.id,
        source_entry_id: sourceEntryId,
        source_url: sourceUrl,
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
      });
    });

    let rows = Array.from(rowsByKey.values());

    const filteredRows: NormalisedEntryRow[] = [];
    const skippedLowSignalRows: NormalisedEntryRow[] = [];
    for (const row of rows) {
      if (isLowSignalEntryRow(row)) {
        skippedLowSignalRows.push(row);
      } else {
        filteredRows.push(row);
      }
    }
    rows = filteredRows;
    skippedLowSignalCount = skippedLowSignalRows.length;
    acceptedCount = rows.length;

    if (skippedLowSignalRows.length > 0) {
      console.warn(
        "[sync/entries] skipped low-signal rows:",
        skippedLowSignalRows.map((row) => ({
          source_entry_id: row.source_entry_id,
          source_url: row.source_url,
          detected_entry_type: row.detected_entry_type,
          extraction_status: row.extraction_status,
          entry_text_preview: row.entry_text.slice(0, 80),
        })),
      );
    }

    const needsOsatsFallback = rows.some(
      (row) =>
        row.detected_entry_type === "osats_summative" &&
        (row.kaizen_procedure_id === null || row.assessor_role_id === null),
    );

    if (needsOsatsFallback) {
      const { data: proceduresCatalog } = await supabase
        .from("procedures_catalog")
        .select("kaizen_id, name")
        .not("kaizen_id", "is", null);

      if (proceduresCatalog && proceduresCatalog.length > 0) {
        rows = rows.map((row) => {
          if (row.detected_entry_type !== "osats_summative") return row;

          const inferred = inferOsatsStorageFields(
            {
              detected_entry_type: row.detected_entry_type,
              extracted_fields: row.extracted_fields,
              kaizen_procedure_id: row.kaizen_procedure_id,
              assessor_role_id: row.assessor_role_id,
            },
            proceduresCatalog as Array<{ kaizen_id: number; name: string }>,
          );

          return {
            ...row,
            kaizen_procedure_id:
              row.kaizen_procedure_id ?? inferred.kaizen_procedure_id,
            assessor_role_id: row.assessor_role_id ?? inferred.assessor_role_id,
          };
        });
      }
    }

    const incomingSourceEntryIds = Array.from(
      new Set(
        rows
          .map((r) => r.source_entry_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    if (incomingSourceEntryIds.length > 0) {
      const { error: scopedDeleteByIdError } = await supabase
        .from("kaizen_entries")
        .delete()
        .eq("user_id", user.id)
        .in("source_entry_id", incomingSourceEntryIds);
      if (scopedDeleteByIdError) {
        return NextResponse.json(
          { error: "Failed to replace incoming entries by ID: " + scopedDeleteByIdError.message },
          { status: 500 }
        );
      }
    }

    const incomingSourceUrlsWithoutId = Array.from(
      new Set(
        rows
          .filter((r) => !r.source_entry_id)
          .map((r) => r.source_url)
          .filter((url): url is string => typeof url === "string" && url.length > 0),
      ),
    );
    if (incomingSourceUrlsWithoutId.length > 0) {
      const { error: scopedDeleteByUrlError } = await supabase
        .from("kaizen_entries")
        .delete()
        .eq("user_id", user.id)
        .is("source_entry_id", null)
        .in("source_url", incomingSourceUrlsWithoutId);
      if (scopedDeleteByUrlError) {
        return NextResponse.json(
          { error: "Failed to replace incoming entries by URL: " + scopedDeleteByUrlError.message },
          { status: 500 }
        );
      }
    }

    if (rows.length > 0) {
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
  }

  await supabase.from("kaizen_sync_log").insert({
    user_id: user.id,
    sync_type: "entries",
    data_hash: String(entries.length),
  });

  return NextResponse.json({
    ok: true,
    synced: acceptedCount,
    received: entries.length,
    skipped_low_signal: skippedLowSignalCount,
  });
}
