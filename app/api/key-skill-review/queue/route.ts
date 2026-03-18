import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ReviewEntry,
  SkillSuggestion,
  KeySkillCoverage,
  DescriptorCoverage,
} from "@/lib/types/key-skill-review";
import type { QueueResponse } from "@/lib/types/key-skill-review-api";

type EntryRow = {
  id: string;
  title: string;
  entry_type: string;
  linked_cip_number: number;
  event_date: string | null;
  entry_text: string;
};

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  suggestion_source: "linked_cip" | "cross_cip";
  status: SkillSuggestion["status"];
  confidence: number;
  rationale: string;
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

type CoverageRow = {
  review_entry_id: string;
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  confidence: number | null;
  evidence_quote: string | null;
};

type DescriptorDetailRow = {
  id: string;
  text: string;
  sort_order: number;
};

export async function GET() {
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

  const { data: entryRows, error: entriesError } = await supabase
    .from("key_skill_review_entries")
    .select(
      "id, title, entry_type, linked_cip_number, event_date, entry_text",
    )
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load review entries: " + entriesError.message },
      { status: 500 },
    );
  }

  const entries = entryRows as EntryRow[] | null;

  if (!entries || entries.length === 0) {
    const body: QueueResponse = { entries: [], total: 0 };
    return NextResponse.json(body);
  }

  const entryIds = entries.map((e) => e.id);

  const { data: suggestionRows, error: suggestionsError } = await supabase
    .from("key_skill_review_suggestions")
    .select(
      "id, review_entry_id, key_skill_id, suggestion_source, status, confidence, rationale",
    )
    .in("review_entry_id", entryIds)
    .eq("user_id", user.id);

  if (suggestionsError) {
    return NextResponse.json(
      { error: "Failed to load suggestions: " + suggestionsError.message },
      { status: 500 },
    );
  }

  const suggestions = (suggestionRows ?? []).map((row): SuggestionRow => ({
    id: String(row.id),
    review_entry_id: String(row.review_entry_id),
    key_skill_id: String(row.key_skill_id),
    suggestion_source: row.suggestion_source as "linked_cip" | "cross_cip",
    status: row.status as SkillSuggestion["status"],
    confidence: Number(row.confidence ?? 0),
    rationale: String(row.rationale ?? ""),
  }));

  // Load descriptor coverage for all entries
  const { data: coverageData, error: coverageError } = await supabase
    .from("key_skill_descriptor_coverage")
    .select(
      "review_entry_id, key_skill_id, descriptor_id, covered, confidence, evidence_quote",
    )
    .in("review_entry_id", entryIds)
    .eq("user_id", user.id);

  if (coverageError) {
    return NextResponse.json(
      { error: "Failed to load descriptor coverage: " + coverageError.message },
      { status: 500 },
    );
  }

  const coverageRows = (coverageData ?? []).map((row): CoverageRow => ({
    review_entry_id: String(row.review_entry_id),
    key_skill_id: String(row.key_skill_id),
    descriptor_id: String(row.descriptor_id),
    covered: Boolean(row.covered),
    confidence: row.confidence != null ? Number(row.confidence) : null,
    evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : null,
  }));

  // Combine key_skill_ids from suggestions AND coverage (coverage may reference
  // candidate skills that never made it into suggestions)
  const keySkillIds = Array.from(
    new Set([
      ...suggestions.map((s) => s.key_skill_id),
      ...coverageRows.map((c) => c.key_skill_id),
    ]),
  );
  const keySkillById = new Map<string, KeySkillRow>();
  const cipNumberById = new Map<string, number>();
  const descriptorById = new Map<string, DescriptorDetailRow>();

  if (keySkillIds.length > 0) {
    const { data: keySkillRows, error: keySkillsError } = await supabase
      .from("key_skills")
      .select("id, title, cip_id")
      .in("id", keySkillIds);

    if (keySkillsError) {
      return NextResponse.json(
        { error: "Failed to load key skills: " + keySkillsError.message },
        { status: 500 },
      );
    }

    const keySkills = (keySkillRows ?? []).map((row): KeySkillRow => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      cip_id: row.cip_id ? String(row.cip_id) : null,
    }));

    keySkills.forEach((ks) => keySkillById.set(ks.id, ks));

    const cipIds = Array.from(
      new Set(
        keySkills
          .map((ks) => ks.cip_id)
          .filter((cipId): cipId is string => typeof cipId === "string"),
      ),
    );

    if (cipIds.length > 0) {
      const { data: cipRows, error: cipsError } = await supabase
        .from("cips")
        .select("id, number")
        .in("id", cipIds);

      if (cipsError) {
        return NextResponse.json(
          { error: "Failed to load CiPs: " + cipsError.message },
          { status: 500 },
        );
      }

      const cips = (cipRows ?? []).map((row): CipRow => ({
        id: String(row.id),
        number: Number(row.number ?? 0),
      }));

      cips.forEach((cip) => cipNumberById.set(cip.id, cip.number));
    }

    // Load descriptor text/order for all coverage rows
    const coverageDescriptorIds = Array.from(
      new Set(coverageRows.map((c) => c.descriptor_id)),
    );

    if (coverageDescriptorIds.length > 0) {
      const { data: descriptorData, error: descriptorsError } = await supabase
        .from("descriptors")
        .select("id, text, sort_order")
        .in("id", coverageDescriptorIds);

      if (descriptorsError) {
        return NextResponse.json(
          { error: "Failed to load descriptors: " + descriptorsError.message },
          { status: 500 },
        );
      }

      (descriptorData ?? []).forEach((row) => {
        descriptorById.set(String(row.id), {
          id: String(row.id),
          text: String(row.text ?? ""),
          sort_order: Number(row.sort_order ?? 0),
        });
      });
    }
  }

  const byEntry: Record<string, ReviewEntry> = {};

  entries.forEach((e) => {
    byEntry[e.id] = {
      id: e.id,
      title: e.title ?? "",
      entry_type: e.entry_type ?? "",
      linked_cip_number: e.linked_cip_number,
      date: e.event_date ?? "",
      raw_text: e.entry_text ?? "",
      linked_cip_suggestions: [],
      cross_cip_suggestions: [],
    };
  });

  suggestions.forEach((s) => {
    const entry = byEntry[s.review_entry_id];
    if (!entry) return;
    const keySkill = keySkillById.get(s.key_skill_id);
    const cipNumber = keySkill?.cip_id
      ? (cipNumberById.get(keySkill.cip_id) ?? 0)
      : 0;
    const suggestion: SkillSuggestion = {
      suggestion_id: s.id,
      key_skill_id: s.key_skill_id,
      cip_number: cipNumber,
      key_skill_title: keySkill?.title ?? "",
      confidence: s.confidence,
      rationale: s.rationale,
      status: s.status,
      source: s.suggestion_source,
    };
    if (s.suggestion_source === "linked_cip") {
      entry.linked_cip_suggestions.push(suggestion);
    } else {
      entry.cross_cip_suggestions.push(suggestion);
    }
  });

  // Group coverage rows: review_entry_id → key_skill_id → rows
  const coverageByEntryAndSkill = new Map<string, Map<string, CoverageRow[]>>();
  for (const c of coverageRows) {
    let bySkill = coverageByEntryAndSkill.get(c.review_entry_id);
    if (!bySkill) {
      bySkill = new Map();
      coverageByEntryAndSkill.set(c.review_entry_id, bySkill);
    }
    const arr = bySkill.get(c.key_skill_id) ?? [];
    arr.push(c);
    bySkill.set(c.key_skill_id, arr);
  }

  // Attach descriptor_coverage to each entry that has coverage data
  for (const [entryId, bySkill] of coverageByEntryAndSkill) {
    const entry = byEntry[entryId];
    if (!entry) continue;

    const coverageForEntry: KeySkillCoverage[] = [];

    for (const [keySkillId, rows] of bySkill) {
      const ks = keySkillById.get(keySkillId);
      const cipNumber = ks?.cip_id ? (cipNumberById.get(ks.cip_id) ?? 0) : 0;

      const descriptors: DescriptorCoverage[] = rows
        .map((c): DescriptorCoverage | null => {
          const desc = descriptorById.get(c.descriptor_id);
          if (!desc) return null;
          return {
            descriptor_id: c.descriptor_id,
            descriptor_text: desc.text,
            sort_order: desc.sort_order,
            covered: c.covered,
            confidence: c.confidence ?? 0,
            evidence_quote: c.evidence_quote,
          };
        })
        .filter((d): d is DescriptorCoverage => d !== null)
        .sort((a, b) => a.sort_order - b.sort_order);

      if (descriptors.length > 0) {
        coverageForEntry.push({
          key_skill_id: keySkillId,
          key_skill_title: ks?.title ?? "",
          cip_number: cipNumber,
          descriptors,
        });
      }
    }

    entry.descriptor_coverage = coverageForEntry;
  }

  const resultEntries = Object.values(byEntry);

  const body: QueueResponse = {
    entries: resultEntries,
    total: resultEntries.length,
  };

  return NextResponse.json(body);
}
