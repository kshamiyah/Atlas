import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { resolveKaizenDirectMatches } from "@/lib/key-skill-review/kaizen-key-skill-parser";

type GenerateBody = {
  review_entry_id: string;
};

type EntryRow = {
  id: string;
  user_id: string;
  entry_type: string | null;
  entry_text: string;
  linked_cip_number: number;
  metadata: Record<string, unknown>;
};

type KeySkillRow = {
  id: string;
  title: string;
  cip_id: string | null;
  kaizen_ids?: string[] | null;
};

type CipRow = {
  id: string;
  number: number;
};

type ExistingSuggestionRow = {
  id: string;
  key_skill_id: string;
  suggestion_source: "linked_cip" | "cross_cip";
  method: string | null;
  status: string;
};

type SuggestionStatus = "suggested" | "confirmed" | "rejected";

function toSuggestionStatus(value: unknown): SuggestionStatus | null {
  if (value === "suggested" || value === "confirmed" || value === "rejected") {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
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

  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string"
      ? body.review_entry_id.trim()
      : "";

  if (!reviewEntryId) {
    return NextResponse.json(
      { error: "review_entry_id is required" },
      { status: 400 },
    );
  }

  const {
    data: entry,
    error: entryError,
  } = await supabase
    .from("key_skill_review_entries")
    .select("id, user_id, entry_type, entry_text, linked_cip_number, metadata")
    .eq("id", reviewEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (entryError) {
    return NextResponse.json(
      { error: "Failed to load review entry: " + entryError.message },
      { status: 500 },
    );
  }

  if (!entry) {
    return NextResponse.json(
      { error: "Review entry not found" },
      { status: 404 },
    );
  }

  const entryRow = entry as EntryRow;

  const { data: keySkillRows, error: keySkillsError } = await supabase
    .from("key_skills")
    .select("id, title, cip_id, kaizen_ids");

  if (keySkillsError) {
    return NextResponse.json(
      { error: "Failed to load key skills: " + keySkillsError.message },
      { status: 500 },
    );
  }

  const { data: cipRows, error: cipsError } = await supabase
    .from("cips")
    .select("id, number");

  if (cipsError) {
    return NextResponse.json(
      { error: "Failed to load cips: " + cipsError.message },
      { status: 500 },
    );
  }

  const cipNumberById = new Map<string, number>();
  (cipRows ?? []).forEach((row: CipRow) => {
    cipNumberById.set(String(row.id), Number(row.number ?? 0));
  });

  const keySkills = (keySkillRows ?? []) as KeySkillRow[];

  const { data: existingRows, error: existingError } = await supabase
    .from("key_skill_review_suggestions")
    .select("id, key_skill_id, suggestion_source, method, status")
    .eq("review_entry_id", entryRow.id)
    .eq("user_id", user.id);

  if (existingError) {
    return NextResponse.json(
      { error: "Failed to load existing suggestions: " + existingError.message },
      { status: 500 },
    );
  }

  const existing = (existingRows ?? []) as ExistingSuggestionRow[];

  const linkedKeySkillsRaw =
    entryRow.metadata && typeof entryRow.metadata === "object" && "linked_key_skills_raw" in entryRow.metadata
      ? (entryRow.metadata.linked_key_skills_raw as string | null)
      : null;

  // Build candidates for kaizen-direct matching (id + cip_number + title + kaizen_ids).
  const kaizenCandidates = keySkills.map((ks) => ({
    key_skill_id: ks.id,
    cip_number: ks.cip_id ? cipNumberById.get(ks.cip_id) ?? 0 : 0,
    title: ks.title ?? "",
    kaizen_ids: Array.isArray(ks.kaizen_ids) ? ks.kaizen_ids : null,
  }));

  // kaizen-direct: deterministic ID-based matches from ePortfolio's own linked key skill
  // data. First-time matches default to confirmed; preserve any user-reviewed
  // status on reruns.
  // Cross-CiP suggestions are handled separately by /api/key-skill-review/suggest-cross-cip
  // (AI-powered, method=ai).
  const kaizenDirectMatches = resolveKaizenDirectMatches(
    linkedKeySkillsRaw,
    kaizenCandidates,
  );

  const suggestions = kaizenDirectMatches.map((m) => ({
    key_skill_id: m.key_skill_id,
    cip_number: m.cip_number,
    source: "linked_cip" as const,
    confidence: m.confidence,
    rationale: m.rationale,
  }));

  const generatedKeySet = new Set<string>(
    suggestions.map((s) => `${s.key_skill_id}|${s.source}`),
  );
  const existingStatusByKey = new Map<string, SuggestionStatus>();
  for (const row of existing) {
    const status = toSuggestionStatus(row.status);
    if (!status) continue;
    existingStatusByKey.set(`${row.key_skill_id}|${row.suggestion_source}`, status);
  }

  // Always re-upsert kaizen_direct suggestions so confidence and rationale stay
  // current as kaizen_ids mappings are updated in future migrations.
  let insertedOrUpdated = 0;
  if (suggestions.length > 0) {
    const rows = suggestions.map((s) => ({
      user_id: user.id,
      review_entry_id: entryRow.id,
      key_skill_id: s.key_skill_id,
      suggestion_source: s.source,
      method: "kaizen_direct" as string,
      status: existingStatusByKey.get(`${s.key_skill_id}|${s.source}`) ?? "confirmed",
      confidence: s.confidence,
      rationale: s.rationale,
    }));

    const { error: upsertError } = await supabase
      .from("key_skill_review_suggestions")
      .upsert(rows, {
        onConflict: "review_entry_id,key_skill_id,suggestion_source",
      });

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to upsert suggestions: " + upsertError.message },
        { status: 500 },
      );
    }
    insertedOrUpdated = rows.length;
  }

  // Delete stale non-confirmed suggestions no longer generated by this route.
  // AI cross-CiP suggestions (method='ai') are owned by suggest-cross-cip — never
  // delete them here. Confirmed suggestions are always preserved.
  const staleRows = existing.filter((row) => {
    if (row.status === "confirmed") return false;
    if (row.method === "ai") return false;
    const key = `${row.key_skill_id}|${row.suggestion_source}`;
    return !generatedKeySet.has(key);
  });

  let deletedStale = 0;
  if (staleRows.length > 0) {
    const idsToDelete = staleRows.map((r) => r.id);
    const { error: deleteError } = await supabase
      .from("key_skill_review_suggestions")
      .delete()
      .in("id", idsToDelete)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete stale suggestions: " + deleteError.message },
        { status: 500 },
      );
    }
    deletedStale = idsToDelete.length;
  }

  const keptConfirmed = existing.filter((r) => r.status === "confirmed").length;

  return NextResponse.json({
    inserted_or_updated: insertedOrUpdated,
    deleted_stale: deletedStale,
    kept_confirmed: keptConfirmed,
    linked_count: suggestions.length,  // all suggestions from this route are linked_cip
    cross_count: 0,                    // cross-CiP is handled by suggest-cross-cip route
  });
}
