import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  suggestCrossCipSkills,
  type CrossCipSkillInput,
} from "@/lib/key-skill-review/cross-cip-suggester";
import type { SuggestCrossCipResponse } from "@/lib/types/key-skill-review-api";

type EntryRow = {
  id: string;
  user_id: string;
  entry_type: string | null;
  entry_text: string;
  linked_cip_number: number;
  metadata: Record<string, unknown> | null;
};

type KeySkillRow = {
  id: string;
  title: string;
  cip_id: string | null;
};

type CipRow = {
  id: string;
  number: number;
};

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  suggestion_source: "linked_cip" | "cross_cip";
  method: string | null;
  status: string;
};

export async function POST() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Load all review entries for this user
  const { data: entryRows, error: entriesError } = await supabase
    .from("key_skill_review_entries")
    .select("id, user_id, entry_type, entry_text, linked_cip_number, metadata")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load entries: " + entriesError.message },
      { status: 500 },
    );
  }

  const entries = (entryRows ?? []) as EntryRow[];
  if (entries.length === 0) {
    const empty: SuggestCrossCipResponse = {
      processed: 0,
      skipped: 0,
      total_suggestions: 0,
    };
    return NextResponse.json(empty);
  }

  const entryIds = entries.map((e) => e.id);

  // 2. Load existing suggestions to know which entries already have AI cross-CiP
  const { data: suggestionRows, error: suggestionsError } = await supabase
    .from("key_skill_review_suggestions")
    .select("id, review_entry_id, key_skill_id, suggestion_source, method, status")
    .in("review_entry_id", entryIds)
    .eq("user_id", user.id);

  if (suggestionsError) {
    return NextResponse.json(
      { error: "Failed to load suggestions: " + suggestionsError.message },
      { status: 500 },
    );
  }

  const suggestions = (suggestionRows ?? []) as SuggestionRow[];

  // Entries that already have at least one AI-generated cross-CiP suggestion
  const entriesWithAiCrossCip = new Set<string>(
    suggestions
      .filter(
        (s) =>
          s.suggestion_source === "cross_cip" && s.method === "ai",
      )
      .map((s) => s.review_entry_id),
  );

  // Confirmed cross-CiP per entry — don't overwrite these
  const confirmedCrossCipByEntry = new Map<string, Set<string>>();
  for (const s of suggestions) {
    if (s.suggestion_source === "cross_cip" && s.status === "confirmed") {
      const set = confirmedCrossCipByEntry.get(s.review_entry_id) ?? new Set();
      set.add(s.key_skill_id);
      confirmedCrossCipByEntry.set(s.review_entry_id, set);
    }
  }

  // 3. Load all key skills and CiPs (shared)
  const { data: keySkillRows, error: keySkillsError } = await supabase
    .from("key_skills")
    .select("id, title, cip_id");

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
      { error: "Failed to load CiPs: " + cipsError.message },
      { status: 500 },
    );
  }

  const keySkills = (keySkillRows ?? []) as KeySkillRow[];
  const cips = (cipRows ?? []) as CipRow[];

  const cipNumberById = new Map<string, number>();
  cips.forEach((row) => {
    cipNumberById.set(String(row.id), Number(row.number ?? 0));
  });

  // Build skill lookup: key_skill_id → { cip_number, title }
  const allSkills: CrossCipSkillInput[] = keySkills.map((ks) => ({
    key_skill_id: String(ks.id),
    cip_number: ks.cip_id ? cipNumberById.get(String(ks.cip_id)) ?? 0 : 0,
    title: String(ks.title ?? ""),
  }));

  let processed = 0;
  let skipped = 0;
  let totalSuggestions = 0;

  try {
    for (const entry of entries) {
      // Skip entries already processed by AI
      if (entriesWithAiCrossCip.has(entry.id)) {
        skipped++;
        continue;
      }

      const linkedCipNumber = entry.linked_cip_number;

      // When linked_cip_number === 0 (no CiP in source data), treat ALL skills
      // as candidates. Otherwise, only offer skills from OTHER CiPs.
      const crossCipSkills =
        linkedCipNumber === 0
          ? allSkills.filter((s) => s.cip_number !== 0)
          : allSkills.filter(
              (s) => s.cip_number !== linkedCipNumber && s.cip_number !== 0,
            );

      if (crossCipSkills.length === 0) {
        skipped++;
        continue;
      }

      const detectedEntryType =
        entry.metadata && "detected_entry_type" in entry.metadata
          ? (entry.metadata.detected_entry_type as string | null)
          : (entry.entry_type ?? null);

      const aiSuggestions = await suggestCrossCipSkills(
        entry.entry_text ?? "",
        detectedEntryType,
        linkedCipNumber,
        crossCipSkills,
      );

      processed++;

      if (aiSuggestions.length === 0) continue;

      const confirmedSkills = confirmedCrossCipByEntry.get(entry.id) ?? new Set();

      // Only upsert suggestions for skills not already confirmed
      const toUpsert = aiSuggestions
        .filter((s) => !confirmedSkills.has(s.key_skill_id))
        .map((s) => ({
          user_id: user.id,
          review_entry_id: entry.id,
          key_skill_id: s.key_skill_id,
          suggestion_source: "cross_cip" as const,
          method: "ai",
          status: "suggested" as const,
          confidence: s.confidence,
          rationale: s.rationale,
        }));

      if (toUpsert.length === 0) continue;

      const { error: upsertError } = await supabase
        .from("key_skill_review_suggestions")
        .upsert(toUpsert, {
          onConflict: "review_entry_id,key_skill_id,suggestion_source",
        });

      if (upsertError) {
        return NextResponse.json(
          {
            error:
              "Failed to upsert cross-CiP suggestions: " + upsertError.message,
          },
          { status: 500 },
        );
      }

      totalSuggestions += toUpsert.length;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cross-CiP suggestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response: SuggestCrossCipResponse = {
    processed,
    skipped,
    total_suggestions: totalSuggestions,
  };
  return NextResponse.json(response);
}
