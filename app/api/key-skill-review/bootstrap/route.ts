import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { buildKaizenSourceEntryKey } from "@/lib/key-skill-review/source-key";
import { resolveKaizenDirectMatches } from "@/lib/key-skill-review/kaizen-key-skill-parser";
import type { BootstrapResponse } from "@/lib/types/key-skill-review-api";
import { isUnsignedAssessorEvidence } from "@/lib/kaizen/evidence-eligibility";

type SuggestionStatus = "suggested" | "confirmed" | "rejected";

type BootstrapSuggestionRow = {
  user_id: string;
  review_entry_id: string;
  key_skill_id: string;
  suggestion_source: "linked_cip";
  method: "kaizen_direct";
  status: SuggestionStatus;
  confidence: number;
  rationale: string;
};

function toSuggestionStatus(value: unknown): SuggestionStatus | null {
  if (value === "suggested" || value === "confirmed" || value === "rejected") {
    return value;
  }
  return null;
}

function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // Already ISO date format.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Common ePortfolio format: DD/MM/YYYY.
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(
        2,
        "0",
      )}-${String(day).padStart(2, "0")}`;
      const date = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return iso;
    }
  }

  // Best-effort parse for any other values; otherwise store null.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; details?: string };
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    haystack.includes("does not exist") &&
    haystack.includes(columnName.toLowerCase())
  );
}

export async function POST() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && !(bypassAuth && !user)) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 },
    );
  }

  if (!user && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user && bypassAuth) {
    const body: BootstrapResponse = { ok: true, upserted_entries: 0 };
    return NextResponse.json(body);
  }
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const withSourceUrlSelect =
    "id, source_entry_id, source_url, kaizen_date, assessment_type, detected_entry_type, title, category, training_year, status, linked_cip_number, entry_text, extraction_status, extracted_fields";
  const fallbackSelect =
    "id, source_entry_id, kaizen_date, assessment_type, detected_entry_type, title, category, training_year, status, linked_cip_number, entry_text, extraction_status, extracted_fields";

  let entries: Array<Record<string, unknown>> | null = null;
  let error: { message: string } | null = null;

  const firstLoad = await supabase
    .from("kaizen_entries")
    .select(withSourceUrlSelect)
    .eq("user_id", userId)
    .order("synced_at", { ascending: false });

  if (firstLoad.error && isMissingColumn(firstLoad.error, "source_url")) {
    const retryLoad = await supabase
      .from("kaizen_entries")
      .select(fallbackSelect)
      .eq("user_id", userId)
      .order("synced_at", { ascending: false });
    entries = (retryLoad.data ?? null) as Array<Record<string, unknown>> | null;
    error = retryLoad.error ? { message: retryLoad.error.message } : null;
  } else {
    entries = (firstLoad.data ?? null) as Array<Record<string, unknown>> | null;
    error = firstLoad.error ? { message: firstLoad.error.message } : null;
  }

  if (error) {
    return NextResponse.json(
      { error: "Failed to load kaizen entries: " + error.message },
      { status: 500 },
    );
  }

  if (!entries || entries.length === 0) {
    const body: BootstrapResponse = { ok: true, upserted_entries: 0 };
    return NextResponse.json(body);
  }

  const [{ data: profile }, { data: stages }] = await Promise.all([
    supabase.from("profiles").select("post_history").eq("id", userId).single(),
    supabase.from("stages").select("id, name"),
  ]);

  const postHistory: Array<{
    grade: string;
    post_start: string;
    post_end: string;
  }> = (profile?.post_history ?? []) as Array<{
    grade: string;
    post_start: string;
    post_end: string;
  }>;

  const stageByName = Object.fromEntries(
    (stages ?? []).map((s: { id: string; name: string }) => [s.name, s.id]),
  );

  function resolveStageId(entryDate: string | null): string | null {
    if (!entryDate) return null;
    const d = new Date(entryDate);
    for (const post of postHistory) {
      if (!post.post_start || !post.post_end) continue;
      const start = new Date(post.post_start);
      const end = new Date(post.post_end);
      if (d >= start && d <= end) {
        return (stageByName[post.grade] as string) ?? null;
      }
    }
    return null;
  }

  let includedWithoutLinkedCip = 0;
  let skippedTO1 = 0;
  let skippedUnsignedAssessor = 0;
  const invalidSourceEntryKeys = new Set<string>();
  const rows = entries
    .map((e) => {
      // TO1 (Team Observation 1) entries are assessor-only — trainees cannot
      // access the content or key skills, so there is nothing to process.
      const rawAssessmentType = String(e.assessment_type ?? "");
      if (/\bto1\b|team\s+observation\s+1/i.test(rawAssessmentType)) {
        skippedTO1 += 1;
        return null;
      }

      const title: string = String(e.title ?? "");
      const narrativeText = normaliseText(
        typeof e.entry_text === "string" ? e.entry_text : "",
      );
      const entryType: string = String(
        e.detected_entry_type ?? e.assessment_type ?? "",
      );
      const linkedCipMatch = title.match(/CiP\s*(\d+)/i);
      const linkedCipNumberRaw =
        typeof e.linked_cip_number === "number"
          ? e.linked_cip_number
          : linkedCipMatch
            ? Number(linkedCipMatch[1])
            : null;
      const linkedCipNumber =
        typeof linkedCipNumberRaw === "number" &&
        Number.isFinite(linkedCipNumberRaw) &&
        linkedCipNumberRaw >= 1 &&
        linkedCipNumberRaw <= 14
          ? linkedCipNumberRaw
          : null;

      // Use 0 as a sentinel for "no linked CiP" so these entries are still
      // bootstrapped and can receive AI cross-CiP suggestions (all skills as candidates).
      if (linkedCipNumber == null) {
        includedWithoutLinkedCip += 1;
      }

      const sourceEntryKey = buildKaizenSourceEntryKey({
        source_entry_id: String(e.source_entry_id ?? ""),
        kaizen_date: String(e.kaizen_date ?? ""),
        assessment_type: entryType,
        title,
        category: String(e.category ?? ""),
        training_year: String(e.training_year ?? ""),
        status: String(e.status ?? ""),
      });

      const extractedFields =
        e.extracted_fields && typeof e.extracted_fields === "object"
          ? (e.extracted_fields as Record<string, unknown>)
          : null;

      if (
        isUnsignedAssessorEvidence({
          detected_entry_type:
            typeof e.detected_entry_type === "string"
              ? e.detected_entry_type
              : entryType,
          assessment_type: entryType,
          status: typeof e.status === "string" ? e.status : null,
          extracted_fields: extractedFields,
        })
      ) {
        skippedUnsignedAssessor += 1;
        invalidSourceEntryKeys.add(sourceEntryKey);
        return null;
      }

      const isoDate = toIsoDateOrNull(
        e.kaizen_date ? String(e.kaizen_date) : null,
      );
      return {
        user_id: userId,
        source_system: "kaizen" as const,
        source_entry_key: sourceEntryKey,
        title,
        entry_type: entryType,
        linked_cip_number: linkedCipNumber ?? 0,
        event_date: isoDate,
        stage_id: resolveStageId(isoDate),
        entry_text: narrativeText || title,
        metadata: {
          source_entry_id:
            typeof e.source_entry_id === "string" ? e.source_entry_id : null,
          source_url:
            typeof e.source_url === "string" ? e.source_url : null,
          detected_entry_type:
            typeof e.detected_entry_type === "string"
              ? e.detected_entry_type
              : null,
          extraction_status:
            typeof e.extraction_status === "string"
              ? e.extraction_status
              : "none",
          linked_key_skills_raw:
            extractedFields &&
            "linked key skills" in extractedFields
              ? String(
                  extractedFields["linked key skills"] ?? "",
                ) || null
              : null,
        },
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Guard against duplicate source keys in a single batch; Postgres upsert
  // fails if multiple input rows hit the same conflict target row.
  const dedupe = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.user_id}:${row.source_system}:${row.source_entry_key}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, row);
    }
  }
  const dedupedRows = Array.from(dedupe.values());
  const sourceEntryKeys = dedupedRows.map((row) => row.source_entry_key);

  if (invalidSourceEntryKeys.size > 0) {
    const { error: deleteInvalidReviewEntriesError } = await supabase
      .from("key_skill_review_entries")
      .delete()
      .eq("user_id", userId)
      .eq("source_system", "kaizen")
      .in("source_entry_key", Array.from(invalidSourceEntryKeys));

    if (deleteInvalidReviewEntriesError) {
      return NextResponse.json(
        {
          error:
            "Failed to remove unsigned assessor review entries: " +
            deleteInvalidReviewEntriesError.message,
        },
        { status: 500 },
      );
    }
  }

  // Metadata merge is handled in Postgres, so the payload can stay narrow and
  // avoid stale read/merge/write races.
  const rowsForUpsert = dedupedRows;

  const { error: upsertError } = await supabase
    .from("key_skill_review_entries")
    .upsert(rowsForUpsert, {
      onConflict: "user_id,source_system,source_entry_key",
    });

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to upsert review entries: " + upsertError.message },
      { status: 500 },
    );
  }

  // ── Auto-generate kaizen_direct suggestions for all bootstrapped entries ──
  // Resolves each entry's linked key skills via deterministic ID lookup against
  // key_skills.kaizen_ids[]. First-time matches default to confirmed; if the user
  // has already reviewed a suggestion, keep their status on subsequent bootstraps.
  // Cross-CiP suggestions are generated separately by suggest-cross-cip (AI).
  try {
    const [{ data: keySkillRows }, { data: cipRows }, { data: reviewEntries }] =
      await Promise.all([
        supabase.from("key_skills").select("id, title, cip_id, kaizen_ids"),
        supabase.from("cips").select("id, number"),
        supabase
                .from("key_skill_review_entries")
                .select("id, entry_text, linked_cip_number, metadata")
                .eq("user_id", userId)
                .eq("source_system", "kaizen")
                .in("source_entry_key", sourceEntryKeys),
      ]);

    if (keySkillRows && cipRows && reviewEntries?.length) {
      const cipNumberById = new Map<string, number>();
      (cipRows as { id: string; number: number }[]).forEach((row) =>
        cipNumberById.set(String(row.id), Number(row.number)),
      );

      const typedKeySkillRows = (keySkillRows as {
        id: string;
        title: string;
        cip_id: string | null;
        kaizen_ids?: string[] | null;
      }[]);

      // Build candidates for kaizen-direct ID lookup.
      const kaizenCandidates = typedKeySkillRows.map((ks) => ({
        key_skill_id: ks.id,
        cip_number: ks.cip_id ? cipNumberById.get(ks.cip_id) ?? 0 : 0,
        title: ks.title ?? "",
        kaizen_ids: Array.isArray(ks.kaizen_ids) ? ks.kaizen_ids : null,
      }));

      const allSuggestionRows: BootstrapSuggestionRow[] = [];

      const existingStatusByKey = new Map<string, SuggestionStatus>();
      if (reviewEntries.length > 0) {
        const reviewEntryIds = Array.from(
          new Set((reviewEntries as { id: string }[]).map((e) => String(e.id))),
        );

        const { data: existingSuggestionRows, error: existingSuggestionError } = await supabase
          .from("key_skill_review_suggestions")
          .select("review_entry_id, key_skill_id, suggestion_source, status")
          .eq("user_id", userId)
          .eq("suggestion_source", "linked_cip")
          .in("review_entry_id", reviewEntryIds);

        if (existingSuggestionError) {
          throw existingSuggestionError;
        }

        for (const row of existingSuggestionRows ?? []) {
          const status = toSuggestionStatus(row.status);
          if (!status) continue;
          const key = `${String(row.review_entry_id)}|${String(row.key_skill_id)}|${String(row.suggestion_source)}`;
          existingStatusByKey.set(key, status);
        }
      }

      for (const entry of reviewEntries as {
        id: string;
        entry_text: string;
        linked_cip_number: number;
        metadata: Record<string, unknown>;
      }[]) {
        const meta = entry.metadata ?? {};
        const linkedKeySkillsRaw = typeof meta.linked_key_skills_raw === "string"
          ? meta.linked_key_skills_raw : null;

        const kaizenDirectMatches = resolveKaizenDirectMatches(linkedKeySkillsRaw, kaizenCandidates);

        for (const m of kaizenDirectMatches) {
          const existingStatus = existingStatusByKey.get(
            `${entry.id}|${m.key_skill_id}|linked_cip`,
          );
          allSuggestionRows.push({
            user_id: userId,
            review_entry_id: entry.id,
            key_skill_id: m.key_skill_id,
            suggestion_source: "linked_cip",
            method: "kaizen_direct",
            status: existingStatus ?? "confirmed",
            confidence: m.confidence,
            rationale: m.rationale,
          });
        }
      }

      if (allSuggestionRows.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < allSuggestionRows.length; i += CHUNK) {
          await supabase
            .from("key_skill_review_suggestions")
            .upsert(allSuggestionRows.slice(i, i + CHUNK), {
              onConflict: "review_entry_id,key_skill_id,suggestion_source",
            });
        }
      }
    }
  } catch (err) {
    // Suggestion generation is non-fatal — bootstrap entries are already saved.
    console.error("[key-skill-review/bootstrap] Non-fatal kaizen-direct suggestion generation failure", {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const body: BootstrapResponse = {
    ok: true,
    upserted_entries: rowsForUpsert.length,
    included_without_linked_cip: includedWithoutLinkedCip,
    skipped_to1: skippedTO1,
    skipped_unsigned_assessor: skippedUnsignedAssessor,
  };
  return NextResponse.json(body);
}
