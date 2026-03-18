import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  analyzeDescriptors,
  type AnalyzerEntry,
  type AnalyzerKeySkill,
} from "@/lib/key-skill-review/descriptor-analyzer";
import type {
  AnalyseDescriptorsBody,
  AnalyseDescriptorsResponse,
} from "@/lib/types/key-skill-review-api";

type EntryRow = {
  id: string;
  user_id: string;
  entry_type: string | null;
  entry_text: string;
  linked_cip_number: number;
  metadata: Record<string, unknown> | null;
};

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  status: "suggested" | "confirmed" | "rejected";
  suggestion_source: "linked_cip" | "cross_cip";
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

type DescriptorRow = {
  id: string;
  key_skill_id: string;
  text: string;
  sort_order: number | null;
};

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

  let body: AnalyseDescriptorsBody | null = null;
  try {
    body = (await request.json()) as AnalyseDescriptorsBody;
  } catch {
    body = null;
  }

  // 1. Load entries for this user (optionally filtered by ids)
  let entryQuery = supabase
    .from("key_skill_review_entries")
    .select(
      "id, user_id, entry_type, entry_text, linked_cip_number, metadata",
    )
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (body?.entry_ids && body.entry_ids.length > 0) {
    entryQuery = entryQuery.in("id", body.entry_ids);
  }

  const { data: entryRows, error: entriesError } = await entryQuery;

  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load review entries: " + entriesError.message },
      { status: 500 },
    );
  }

  const entries = (entryRows ?? []) as EntryRow[];
  if (entries.length === 0) {
    const empty: AnalyseDescriptorsResponse = {
      processed: 0,
      total_descriptors_analysed: 0,
    };
    return NextResponse.json(empty);
  }

  const entryIds = entries.map((e) => e.id);

  // 2. Load suggestions once for all entries (confirmed + suggested — not rejected).
  // These drive which key skills are sent for descriptor analysis: confirmed skills
  // are always included; suggested skills are included as candidates so the AI can
  // evaluate descriptors even before the user makes a final decision.
  const { data: suggestionRows, error: suggestionsError } = await supabase
    .from("key_skill_review_suggestions")
    .select(
      "id, review_entry_id, key_skill_id, status, suggestion_source",
    )
    .in("review_entry_id", entryIds)
    .eq("user_id", user.id)
    .neq("status", "rejected");

  if (suggestionsError) {
    return NextResponse.json(
      { error: "Failed to load suggestions: " + suggestionsError.message },
      { status: 500 },
    );
  }

  const suggestions = (suggestionRows ?? []) as SuggestionRow[];

  // Index by entry: confirmed skills and all non-rejected skills per entry.
  const confirmedByEntry = new Map<string, SuggestionRow[]>();
  const allSuggestionsByEntry = new Map<string, SuggestionRow[]>();
  for (const s of suggestions) {
    if (s.status === "confirmed") {
      const arr = confirmedByEntry.get(s.review_entry_id) ?? [];
      arr.push(s);
      confirmedByEntry.set(s.review_entry_id, arr);
    }
    const all = allSuggestionsByEntry.get(s.review_entry_id) ?? [];
    all.push(s);
    allSuggestionsByEntry.set(s.review_entry_id, all);
  }

  // 3. Load all key skills, CiPs, and descriptors (shared across entries)
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

  const { data: descriptorRows, error: descriptorsError } = await supabase
    .from("descriptors")
    .select("id, key_skill_id, text, sort_order");

  if (descriptorsError) {
    return NextResponse.json(
      { error: "Failed to load descriptors: " + descriptorsError.message },
      { status: 500 },
    );
  }

  const keySkills = (keySkillRows ?? []) as KeySkillRow[];
  const cips = (cipRows ?? []) as CipRow[];
  const descriptors = (descriptorRows ?? []) as DescriptorRow[];

  const cipNumberById = new Map<string, number>();
  cips.forEach((row) => {
    cipNumberById.set(String(row.id), Number(row.number ?? 0));
  });

  const descriptorsByKeySkill = new Map<string, DescriptorRow[]>();
  descriptors.forEach((row) => {
    const key = String(row.key_skill_id);
    const arr = descriptorsByKeySkill.get(key) ?? [];
    arr.push({
      id: String(row.id),
      key_skill_id: key,
      text: String(row.text ?? ""),
      sort_order: row.sort_order ?? 0,
    });
    descriptorsByKeySkill.set(key, arr);
  });

  const keySkillById = new Map<string, KeySkillRow>();
  keySkills.forEach((ks) => {
    keySkillById.set(String(ks.id), {
      id: String(ks.id),
      title: String(ks.title ?? ""),
      cip_id: ks.cip_id ? String(ks.cip_id) : null,
    });
  });

  const cipNumberForKeySkillId = new Map<string, number>();
  keySkills.forEach((ks) => {
    const cipNumber = ks.cip_id ? cipNumberById.get(ks.cip_id) ?? 0 : 0;
    cipNumberForKeySkillId.set(String(ks.id), cipNumber);
  });

  let processed = 0;
  let totalDescriptorsAnalysed = 0;

  try {
    // 4. Process entries sequentially to respect rate limits
    for (const entry of entries) {
      const confirmed = confirmedByEntry.get(entry.id) ?? [];
      if (confirmed.length === 0) {
        // No confirmed skills — nothing to anchor the analysis to.
        continue;
      }

      const confirmedKeySkillIds = Array.from(
        new Set(confirmed.map((s) => String(s.key_skill_id))),
      );

      // Include all non-rejected suggestions (confirmed + suggested) so the AI
      // evaluates descriptors for both locked-in skills and pending candidates.
      const allEntrySkillIds = Array.from(
        new Set(
          (allSuggestionsByEntry.get(entry.id) ?? []).map((s) => String(s.key_skill_id)),
        ),
      );

      if (allEntrySkillIds.length === 0) {
        continue;
      }

      // Build AnalyzerKeySkill array with descriptors
      const analyzerKeySkills: AnalyzerKeySkill[] = allEntrySkillIds.map(
        (id) => {
          const ks = keySkillById.get(id);
          const cipNumber = cipNumberForKeySkillId.get(id) ?? 0;
          const descriptorRowsForSkill = descriptorsByKeySkill.get(id) ?? [];
          return {
            key_skill_id: id,
            cip_number: cipNumber,
            title: ks?.title ?? "",
            is_confirmed: confirmedKeySkillIds.includes(id),
            descriptors: descriptorRowsForSkill
              .slice()
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((d) => ({
                descriptor_id: d.id,
                text: d.text,
                sort_order: d.sort_order ?? 0,
              })),
          };
        },
      );

      const analyzerEntry: AnalyzerEntry = {
        entry_text: entry.entry_text ?? "",
        entry_type: entry.entry_type,
      };

      const descriptorResults = await analyzeDescriptors(
        analyzerEntry,
        analyzerKeySkills,
      );

      processed += 1;
      totalDescriptorsAnalysed += descriptorResults.length;

      if (descriptorResults.length === 0) {
        continue;
      }

      const upsertRows = descriptorResults.map((r) => ({
        user_id: user.id,
        review_entry_id: entry.id,
        key_skill_id: r.key_skill_id,
        descriptor_id: r.descriptor_id,
        covered: r.covered,
        confidence: r.confidence,
        evidence_quote: r.evidence_quote,
        method: "ai",
        analysed_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("key_skill_descriptor_coverage")
        .upsert(upsertRows, {
          onConflict:
            "user_id,review_entry_id,key_skill_id,descriptor_id",
        });

      if (upsertError) {
        return NextResponse.json(
          {
            error:
              "Failed to upsert descriptor coverage: " +
              upsertError.message,
          },
          { status: 500 },
        );
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Descriptor analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response: AnalyseDescriptorsResponse = {
    processed,
    total_descriptors_analysed: totalDescriptorsAnalysed,
  };
  return NextResponse.json(response);
}
