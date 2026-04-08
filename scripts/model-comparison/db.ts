import { createClient } from "@supabase/supabase-js";
import type {
  AnyTestCase,
  GenerateTestCase,
  MatchKeySkillsTestCase,
  NormalizerTestCase,
  DescriptorTestCase,
  CrossCipTestCase,
  FieldRegenTestCase,
} from "./types";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }
  return createClient(url, key);
}

function countWords(text: string): number {
  const matches = String(text ?? "").trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function countParagraphs(text: string): number {
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

// ── Key skill + descriptor queries ──────────────────────────────────────────

interface DbKeySkill {
  id: string;
  title: string;
  skill_number: number;
  cip_id: string;
  cip_number: number;
  cip_title: string;
  descriptors: { id: string; text: string; sort_order: number }[];
}

async function fetchKeySkillsForCip(
  supabase: ReturnType<typeof getSupabase>,
  cipNumber: number,
): Promise<DbKeySkill[]> {
  // Step 1: get CiP id
  const { data: cipRow, error: cipErr } = await supabase
    .from("cips")
    .select("id, title")
    .eq("number", cipNumber)
    .single();

  if (cipErr || !cipRow) return [];

  // Step 2: get key skills with descriptors
  const { data: skills, error: skillErr } = await supabase
    .from("key_skills")
    .select("id, title, skill_number, descriptors(id, text, sort_order)")
    .eq("cip_id", cipRow.id)
    .order("skill_number");

  if (skillErr || !skills) return [];

  return skills.map((s: Record<string, unknown>) => ({
    id: String(s.id),
    title: String(s.title),
    skill_number: Number(s.skill_number),
    cip_id: String(cipRow.id),
    cip_number: cipNumber,
    cip_title: String(cipRow.title),
    descriptors: Array.isArray(s.descriptors)
      ? (s.descriptors as { id: string; text: string; sort_order: number }[])
          .sort((a, b) => a.sort_order - b.sort_order)
      : [],
  }));
}

async function fetchAllKeySkills(
  supabase: ReturnType<typeof getSupabase>,
): Promise<DbKeySkill[]> {
  const { data: cips, error: cipErr } = await supabase
    .from("cips")
    .select("id, number, title")
    .order("number");

  if (cipErr || !cips) return [];

  const { data: skills, error: skillErr } = await supabase
    .from("key_skills")
    .select("id, title, skill_number, cip_id, descriptors(id, text, sort_order)")
    .order("skill_number");

  if (skillErr || !skills) return [];

  const cipMap = new Map(
    (cips as { id: string; number: number; title: string }[]).map((c) => [
      c.id,
      c,
    ]),
  );

  return skills
    .map((s: Record<string, unknown>) => {
      const cip = cipMap.get(String(s.cip_id));
      if (!cip) return null;
      return {
        id: String(s.id),
        title: String(s.title),
        skill_number: Number(s.skill_number),
        cip_id: String(s.cip_id),
        cip_number: cip.number,
        cip_title: cip.title,
        descriptors: Array.isArray(s.descriptors)
          ? (s.descriptors as { id: string; text: string; sort_order: number }[])
              .sort((a, b) => a.sort_order - b.sort_order)
          : [],
      };
    })
    .filter((s): s is DbKeySkill => s !== null);
}

// ── Test case builders ───────────────────────────────────────────────────────

async function buildGenerateCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
  entryTypes?: string[],
): Promise<GenerateTestCase[]> {
  let entries: Record<string, unknown>[] = [];

  if (entryTypes && entryTypes.length > 0) {
    // Fetch up to ceil(limit/types) of each type, then trim to limit
    const perType = Math.ceil(limit / entryTypes.length);
    for (const type of entryTypes) {
      const { data, error } = await supabase
        .from("generated_entries")
        .select("id, entry_type, raw_input, stage_id, structured_data")
        .eq("user_id", userId)
        .eq("entry_type", type)
        .not("raw_input", "is", null)
        .neq("raw_input", "")
        .order("created_at", { ascending: false })
        .limit(perType);
      if (!error && data) entries.push(...(data as Record<string, unknown>[]));
    }
    entries = entries.slice(0, limit);
  } else {
    const { data, error } = await supabase
      .from("generated_entries")
      .select("id, entry_type, raw_input, stage_id, structured_data")
      .eq("user_id", userId)
      .not("raw_input", "is", null)
      .neq("raw_input", "")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && data) entries = data as Record<string, unknown>[];
  }

  return entries
    .filter((e) => String(e.raw_input ?? "").trim().length > 20)
    .map(
      (e): GenerateTestCase => ({
        id: `generate-${String(e.id).slice(0, 8)}`,
        callType: "generate",
        rawInput: String(e.raw_input),
        entryType: String(e.entry_type ?? "auto"),
        stageId: String(
          (e.structured_data as Record<string, unknown>)?.stage_id ?? "ST3",
        ),
        length: "standard",
      }),
    );
}

async function buildMatchKeySkillsCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
  allKeySkills: DbKeySkill[],
): Promise<MatchKeySkillsTestCase[]> {
  const { data: entries, error } = await supabase
    .from("key_skill_review_entries")
    .select("id, entry_type, entry_text, linked_cip_number")
    .eq("user_id", userId)
    .not("entry_text", "is", null)
    .neq("entry_text", "")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error || !entries) {
    console.warn("  [db] No key_skill_review_entries found:", error?.message);
    return [];
  }

  const cases: MatchKeySkillsTestCase[] = [];

  for (const e of entries as Record<string, unknown>[]) {
    const cipNumber = Number(e.linked_cip_number ?? 0);
    if (!cipNumber) continue;

    // Get skills for the entry's CiP as primary candidates
    const cipSkills = allKeySkills.filter((ks) => ks.cip_number === cipNumber);
    if (cipSkills.length === 0) continue;

    // Also add a few skills from other CiPs to test hallucination resistance
    const otherSkills = allKeySkills
      .filter((ks) => ks.cip_number !== cipNumber)
      .slice(0, 3);

    const candidates = [...cipSkills, ...otherSkills].map((ks) => ({
      key_skill_id: ks.id,
      title: ks.title,
      cip_number: ks.cip_number,
      cip_title: ks.cip_title,
      descriptors: ks.descriptors.slice(0, 5).map((d) => d.text),
      covered: false,
      evidence_count: 0,
    }));

    // Extract entry fields from the text (use as a flat object)
    const entryText = String(e.entry_text ?? "");
    const entryFields: Record<string, string> = {
      entry_text: entryText,
    };

    cases.push({
      id: `match-${String(e.id).slice(0, 8)}`,
      callType: "match-key-skills",
      entryFields,
      entryType: String(e.entry_type ?? ""),
      candidates,
    });
  }

  return cases;
}

async function buildNormalizerCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
): Promise<NormalizerTestCase[]> {
  const { data: entries, error } = await supabase
    .from("generated_entries")
    .select("id, structured_data")
    .eq("user_id", userId)
    .eq("entry_type", "cip_assessment")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !entries) {
    console.warn("  [db] No CiP assessment entries found:", error?.message);
    return [];
  }

  const CIP_RANGES = {
    short: { min: 220, max: 300 },
    standard: { min: 320, max: 420 },
    detailed: { min: 500, max: 650 },
  };

  const cases: NormalizerTestCase[] = [];

  for (const e of entries as Record<string, unknown>[]) {
    const sd = e.structured_data as Record<string, unknown>;
    const fields = sd?.fields as Record<string, unknown> | undefined;
    const comments = String(fields?.trainee_comments ?? "").trim();
    if (!comments || comments.length < 50) continue;

    const wc = countWords(comments);
    const pc = countParagraphs(comments);

    // Only include cases that actually need normalizing (interesting test)
    // OR cases that are already valid (to check model doesn't corrupt them)
    const alreadyValid = pc === 5 && wc >= 320 && wc <= 420;
    const needsNormalizing = pc !== 5 || wc < 320 || wc > 420;

    if (!alreadyValid && !needsNormalizing) continue;

    cases.push({
      id: `norm-${String(e.id).slice(0, 8)}`,
      callType: "normalizer",
      traineeComments: comments,
      currentWordCount: wc,
      currentParagraphCount: pc,
      length: "standard",
      targetRange: CIP_RANGES.standard,
    });
  }

  return cases;
}

async function buildDescriptorCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
  allKeySkills: DbKeySkill[],
  entryTypes?: string[],
): Promise<DescriptorTestCase[]> {
  let rawEntries: Record<string, unknown>[] = [];

  if (entryTypes && entryTypes.length > 0) {
    const perType = Math.ceil(limit / entryTypes.length);
    for (const type of entryTypes) {
      const { data, error } = await supabase
        .from("key_skill_review_entries")
        .select("id, entry_type, entry_text, linked_cip_number")
        .eq("user_id", userId)
        .eq("entry_type", type)
        .not("entry_text", "is", null)
        .neq("entry_text", "")
        .order("last_seen_at", { ascending: false })
        .limit(perType);
      if (!error && data) rawEntries.push(...(data as Record<string, unknown>[]));
    }
    rawEntries = rawEntries.slice(0, limit);
  } else {
    const { data, error } = await supabase
      .from("key_skill_review_entries")
      .select("id, entry_type, entry_text, linked_cip_number")
      .eq("user_id", userId)
      .not("entry_text", "is", null)
      .neq("entry_text", "")
      .order("last_seen_at", { ascending: false })
      .limit(limit);
    if (!error && data) rawEntries = data as Record<string, unknown>[];
  }

  const cases: DescriptorTestCase[] = [];

  for (const e of rawEntries) {
    const cipNumber = Number(e.linked_cip_number ?? 0);
    if (!cipNumber) continue;

    const cipSkills = allKeySkills.filter((ks) => ks.cip_number === cipNumber);
    const descriptors = cipSkills
      .slice(0, 3) // Use up to 3 skills (~15-20 descriptors total)
      .flatMap((ks) =>
        ks.descriptors.slice(0, 6).map((d) => ({
          descriptor_id: d.id,
          key_skill_id: ks.id,
          key_skill_title: ks.title,
          descriptor_text: d.text,
        })),
      );

    if (descriptors.length === 0) continue;

    cases.push({
      id: `desc-${String(e.id).slice(0, 8)}`,
      callType: "descriptor",
      entryText: String(e.entry_text),
      entryType: String(e.entry_type ?? ""),
      descriptors,
    });
  }

  return cases;
}

async function buildCrossCipCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
  allKeySkills: DbKeySkill[],
  entryTypes?: string[],
): Promise<CrossCipTestCase[]> {
  let rawEntries: Record<string, unknown>[] = [];

  if (entryTypes && entryTypes.length > 0) {
    const perType = Math.ceil(limit / entryTypes.length);
    for (const type of entryTypes) {
      const { data, error } = await supabase
        .from("key_skill_review_entries")
        .select("id, entry_type, entry_text, linked_cip_number")
        .eq("user_id", userId)
        .eq("entry_type", type)
        .not("entry_text", "is", null)
        .neq("entry_text", "")
        .order("last_seen_at", { ascending: false })
        .limit(perType);
      if (!error && data) rawEntries.push(...(data as Record<string, unknown>[]));
    }
    rawEntries = rawEntries.slice(0, limit);
  } else {
    const { data, error } = await supabase
      .from("key_skill_review_entries")
      .select("id, entry_type, entry_text, linked_cip_number")
      .eq("user_id", userId)
      .not("entry_text", "is", null)
      .neq("entry_text", "")
      .order("last_seen_at", { ascending: false })
      .limit(limit);
    if (!error && data) rawEntries = data as Record<string, unknown>[];
  }

  const cases: CrossCipTestCase[] = [];

  for (const e of rawEntries) {
    const cipNumber = Number(e.linked_cip_number ?? 0);
    if (!cipNumber) continue;

    // Get all skills from OTHER CiPs (cross-CiP candidates)
    const crossCipSkills = allKeySkills
      .filter((ks) => ks.cip_number !== cipNumber)
      .map((ks) => ({
        key_skill_id: ks.id,
        cip_number: ks.cip_number,
        title: ks.title,
      }))
      .slice(0, 60); // Max 60 per prompt (mirrors live code)

    if (crossCipSkills.length === 0) continue;

    // Get linked skill titles for context
    const linkedSkillTitles = allKeySkills
      .filter((ks) => ks.cip_number === cipNumber)
      .map((ks) => ks.title);

    cases.push({
      id: `cross-${String(e.id).slice(0, 8)}`,
      callType: "cross-cip",
      entryText: String(e.entry_text),
      entryType: String(e.entry_type ?? ""),
      linkedCipNumber: cipNumber,
      crossCipSkills,
      linkedSkillTitles,
    });
  }

  return cases;
}

async function buildFieldRegenCases(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  limit: number,
): Promise<FieldRegenTestCase[]> {
  // Fetch entries that have structured_data.fields with at least one narrative field
  const ENTRY_TYPES = ["cbd", "reflection", "osats_formative", "minicex"];
  const perType = Math.ceil(limit / ENTRY_TYPES.length);

  const NARRATIVE_FIELDS_MAP: Record<string, string[]> = {
    reflection: ["what_happened", "important_points", "reflection", "record_of_discussion_or_action_plan"],
    cbd: ["describe_the_event", "trainee_analysis", "trainee_learning_plan", "trainee_reflection"],
    minicex: ["describe_the_event", "trainee_analysis", "trainee_learning_plan", "trainee_reflection"],
    osats_formative: ["clinical_details_and_complexity", "what_went_well", "what_could_have_gone_better", "learning_plan", "trainee_reflection"],
  };

  // Human-readable field labels
  const FIELD_LABELS: Record<string, string> = {
    what_happened: "What Happened",
    important_points: "Important Points",
    reflection: "Reflection",
    record_of_discussion_or_action_plan: "Record of Discussion / Action Plan",
    describe_the_event: "Describe the Event",
    trainee_analysis: "Trainee Analysis",
    trainee_learning_plan: "Trainee Learning Plan",
    trainee_reflection: "Trainee Reflection",
    clinical_details_and_complexity: "Clinical Details and Complexity",
    what_went_well: "What Went Well",
    what_could_have_gone_better: "What Could Have Gone Better",
    learning_plan: "Learning Plan",
  };

  let allEntries: Record<string, unknown>[] = [];

  for (const type of ENTRY_TYPES) {
    const { data, error } = await supabase
      .from("generated_entries")
      .select("id, entry_type, raw_input, structured_data")
      .eq("user_id", userId)
      .eq("entry_type", type)
      .not("structured_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(perType);
    if (error) console.warn(`  [db] field-regen fetch error (${type}):`, error.message);
    if (data) allEntries.push(...(data as Record<string, unknown>[]));
  }

  console.log(`  [db] field-regen: fetched ${allEntries.length} raw entries`);
  allEntries = allEntries.slice(0, limit);

  const cases: FieldRegenTestCase[] = [];

  for (const e of allEntries) {
    const entryType = String(e.entry_type ?? "");
    const sd = e.structured_data as Record<string, unknown>;
    const fields = sd?.fields as Record<string, unknown> | undefined;
    if (!fields) {
      console.warn(`  [db] field-regen: entry ${String(e.id).slice(0, 8)} has no .fields in structured_data (keys: ${Object.keys(sd ?? {}).join(", ")})`);
      continue;
    }

    const narrativeFields = NARRATIVE_FIELDS_MAP[entryType] ?? [];
    // Pick the 2nd narrative field so we test variety (not always the first field)
    const targetFieldId = narrativeFields[1] ?? narrativeFields[0];
    if (!targetFieldId) continue;

    const originalValue = String(fields[targetFieldId] ?? "").trim();
    if (!originalValue || originalValue.length < 30) continue;

    // Build currentFields: all fields as strings
    const currentFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "string" && v.trim()) {
        currentFields[k] = v;
      }
    }

    cases.push({
      id: `field-${String(e.id).slice(0, 8)}`,
      callType: "field-regen",
      entryType,
      targetFieldId,
      targetFieldLabel: FIELD_LABELS[targetFieldId] ?? targetFieldId,
      rawInput: e.raw_input ? String(e.raw_input) : undefined,
      currentFields,
      originalFieldValue: originalValue,
      length: "standard",
    });
  }

  return cases;
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface FetchOptions {
  userId: string;
  limitPerCallType: number;
  callTypes: string[];
  entryTypes?: string[];
}

export async function fetchTestCases(opts: FetchOptions): Promise<AnyTestCase[]> {
  const supabase = getSupabase();
  const { userId, limitPerCallType, callTypes, entryTypes } = opts;

  console.log(`  [db] Fetching test cases for user ${userId.slice(0, 8)}...`);

  // Pre-fetch all key skills once (shared across multiple call types)
  let allKeySkills: DbKeySkill[] = [];
  const needsKeySkills =
    callTypes.includes("match-key-skills") ||
    callTypes.includes("descriptor") ||
    callTypes.includes("cross-cip");

  if (needsKeySkills) {
    console.log("  [db] Loading key skills + descriptors...");
    allKeySkills = await fetchAllKeySkills(supabase);
    console.log(`  [db] Loaded ${allKeySkills.length} key skills`);
  }

  const allCases: AnyTestCase[] = [];

  if (callTypes.includes("generate")) {
    const cases = await buildGenerateCases(supabase, userId, limitPerCallType, entryTypes);
    console.log(`  [db] ${cases.length} generate cases`);
    allCases.push(...cases);
  }

  if (callTypes.includes("match-key-skills")) {
    const cases = await buildMatchKeySkillsCases(
      supabase,
      userId,
      limitPerCallType,
      allKeySkills,
    );
    console.log(`  [db] ${cases.length} match-key-skills cases`);
    allCases.push(...cases);
  }

  if (callTypes.includes("normalizer")) {
    const cases = await buildNormalizerCases(supabase, userId, limitPerCallType);
    console.log(`  [db] ${cases.length} normalizer cases`);
    allCases.push(...cases);
  }

  if (callTypes.includes("descriptor")) {
    const cases = await buildDescriptorCases(
      supabase,
      userId,
      limitPerCallType,
      allKeySkills,
      entryTypes,
    );
    console.log(`  [db] ${cases.length} descriptor cases`);
    allCases.push(...cases);
  }

  if (callTypes.includes("cross-cip")) {
    const cases = await buildCrossCipCases(
      supabase,
      userId,
      limitPerCallType,
      allKeySkills,
      entryTypes,
    );
    console.log(`  [db] ${cases.length} cross-cip cases`);
    allCases.push(...cases);
  }

  if (callTypes.includes("field-regen")) {
    const cases = await buildFieldRegenCases(supabase, userId, limitPerCallType);
    console.log(`  [db] ${cases.length} field-regen cases`);
    allCases.push(...cases);
  }

  return allCases;
}
