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

type RankedCrossSuggestion = CrossCipSkillInput & {
  confidence: number;
  rationale: string;
  usefulness_score: number;
  overlaps_linked: boolean;
};

const MIN_CONFIDENCE_FOR_NOVEL = 0.62;
const MIN_CONFIDENCE_FOR_OVERLAP = 0.9;
const MIN_USEFULNESS_SCORE = 0.55;

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function rationaleQualityScore(rationale: string): number {
  const words = countWords(rationale);
  if (words >= 3 && words <= 12) return 1;
  if (words === 2 || (words > 12 && words <= 16)) return 0.7;
  if (words === 0 || words > 16) return 0.35;
  return 0.5;
}

function dedupeByBestConfidence(
  suggestions: CrossCipSkillInput[],
  confidenceById: Map<string, { confidence: number; rationale: string }>,
): CrossCipSkillInput[] {
  const seen = new Set<string>();
  const out: CrossCipSkillInput[] = [];
  for (const s of suggestions) {
    if (seen.has(s.key_skill_id)) continue;
    if (!confidenceById.has(s.key_skill_id)) continue;
    seen.add(s.key_skill_id);
    out.push(s);
  }
  return out;
}

function rankByUsefulness(
  aiSuggestions: {
    key_skill_id: string;
    cip_number: number;
    confidence: number;
    rationale: string;
  }[],
  crossCipSkills: CrossCipSkillInput[],
  linkedSkillIds: Set<string>,
): RankedCrossSuggestion[] {
  const bestBySkill = new Map<string, { confidence: number; rationale: string }>();
  for (const s of aiSuggestions) {
    const current = bestBySkill.get(s.key_skill_id);
    if (!current || s.confidence > current.confidence) {
      bestBySkill.set(s.key_skill_id, {
        confidence: s.confidence,
        rationale: s.rationale,
      });
    }
  }

  const dedupedSkills = dedupeByBestConfidence(crossCipSkills, bestBySkill);
  const prelim: RankedCrossSuggestion[] = [];

  for (const skill of dedupedSkills) {
    const match = bestBySkill.get(skill.key_skill_id);
    if (!match) continue;

    const overlapsLinked = linkedSkillIds.has(skill.key_skill_id);
    const confidenceGate = overlapsLinked
      ? MIN_CONFIDENCE_FOR_OVERLAP
      : MIN_CONFIDENCE_FOR_NOVEL;

    if (match.confidence < confidenceGate) continue;

    const novelty = overlapsLinked ? 0 : 1;
    const rationaleScore = rationaleQualityScore(match.rationale);

    // Precision-first usefulness score:
    // - confidence dominates
    // - novelty boosts genuinely new coverage
    // - overlap gets penalized unless confidence is very high
    const usefulness =
      match.confidence * 0.72 +
      novelty * 0.26 +
      rationaleScore * 0.08 -
      (overlapsLinked ? 0.2 : 0);

    if (usefulness < MIN_USEFULNESS_SCORE) continue;

    prelim.push({
      ...skill,
      confidence: match.confidence,
      rationale: match.rationale,
      usefulness_score: Number(usefulness.toFixed(4)),
      overlaps_linked: overlapsLinked,
    });
  }

  prelim.sort((a, b) => {
    if (a.overlaps_linked !== b.overlaps_linked) {
      return a.overlaps_linked ? 1 : -1;
    }
    if (b.usefulness_score !== a.usefulness_score) {
      return b.usefulness_score - a.usefulness_score;
    }
    return b.confidence - a.confidence;
  });

  return prelim;
}

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

  // Confirmed cross-CiP per entry — don't overwrite these
  const lockedCrossCipByEntry = new Map<string, Set<string>>();
  for (const s of suggestions) {
    if (
      s.suggestion_source === "cross_cip" &&
      (s.status === "confirmed" || s.status === "rejected")
    ) {
      const set = lockedCrossCipByEntry.get(s.review_entry_id) ?? new Set();
      set.add(s.key_skill_id);
      lockedCrossCipByEntry.set(s.review_entry_id, set);
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
  const skillTitleById = new Map<string, string>(
    keySkills.map((ks) => [String(ks.id), String(ks.title ?? "")]),
  );

  let processed = 0;
  let skipped = 0;
  let totalSuggestions = 0;

  try {
    for (const entry of entries) {
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

      const linkedSkillIds = new Set(
        suggestions
          .filter(
            (s) =>
              s.review_entry_id === entry.id &&
              s.suggestion_source === "linked_cip" &&
              s.status !== "rejected",
          )
          .map((s) => s.key_skill_id),
      );
      const linkedSkillTitles = [...linkedSkillIds]
        .map((id) => skillTitleById.get(id))
        .filter((t): t is string => Boolean(t));

      const aiSuggestions = await suggestCrossCipSkills(
        entry.entry_text ?? "",
        detectedEntryType,
        linkedCipNumber,
        crossCipSkills,
        linkedSkillTitles,
      );

      processed++;

      if (aiSuggestions.length === 0) continue;

      const ranked = rankByUsefulness(aiSuggestions, crossCipSkills, linkedSkillIds);
      if (ranked.length === 0) continue;

      const lockedSkills = lockedCrossCipByEntry.get(entry.id) ?? new Set();

      // Only upsert suggestions for skills not already confirmed
      const toUpsert = ranked
        .filter((s) => !lockedSkills.has(s.key_skill_id))
        .map((s) => ({
          user_id: user.id,
          review_entry_id: entry.id,
          key_skill_id: s.key_skill_id,
          suggestion_source: "cross_cip" as const,
          method: "ai",
          status: "suggested" as const,
          confidence: s.confidence,
          rationale: s.rationale.slice(0, 200),
        }));

      if (toUpsert.length === 0) continue;

      // Refresh prior AI-suggested (pending) cross-CiP rows so reruns apply new ranking.
      const { error: cleanupError } = await supabase
        .from("key_skill_review_suggestions")
        .delete()
        .eq("user_id", user.id)
        .eq("review_entry_id", entry.id)
        .eq("suggestion_source", "cross_cip")
        .eq("method", "ai")
        .eq("status", "suggested");

      if (cleanupError) {
        return NextResponse.json(
          {
            error:
              "Failed to refresh old cross-CiP suggestions: " +
              cleanupError.message,
          },
          { status: 500 },
        );
      }

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
