import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { generatePortfolioEntry } from "@/lib/ai/generate";
import { matchKeySkills } from "@/lib/ai/match-key-skills";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { KeySkillCandidate } from "@/lib/ai/match-key-skills";

const VALID_ENTRY_TYPES: GeneratedEntryType[] = [
  "reflection",
  "procedure",
  "cbd",
  "minicex",
  "notss",
  "osats_formative",
  "osats_summative",
  "other_evidence",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type AuthUser = { id: string };
type CoverageRow = {
  key_skill_name: string | null;
  evidence_count: number | null;
  covered: boolean | null;
};
type KeySkillRow = {
  legacy_id: string | null;
  title: string | null;
  cips:
    | {
        number: number | null;
        title: string | null;
      }
    | Array<{
        number: number | null;
        title: string | null;
      }>
    | null;
  descriptors:
    | Array<{
        text: string | null;
        sort_order: number | null;
      }>
    | null;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const supabase = await getServerSupabaseClient();
  let user: AuthUser | null = null;
  const authHeader = request.headers.get("Authorization");

  // Prefer explicit Bearer auth from the extension; fall back to cookie auth.
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } catch {
      // Invalid token should behave like unauthenticated.
      user = null;
    }
  }

  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }
  const userId = user.id;

  let body: {
    entry_type?: GeneratedEntryType;
    free_text: string;
    date?: string;
    length?: "short" | "standard" | "detailed";
    target_key_skill_ids?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (body.entry_type && !VALID_ENTRY_TYPES.includes(body.entry_type)) {
    return NextResponse.json(
      { error: "Invalid entry_type" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (
    !body.free_text ||
    typeof body.free_text !== "string" ||
    !body.free_text.trim()
  ) {
    return NextResponse.json(
      { error: "free_text is required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let stageId = "ST1";
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_stage_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.current_stage_id) {
    const { data: stage } = await supabase
      .from("stages")
      .select("name")
      .eq("id", profile.current_stage_id)
      .maybeSingle();
    if (stage?.name) stageId = stage.name;
  }

  // ── Fetch enriched key skills + user coverage (for Pass 2) ──
  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number, title ), descriptors ( text, sort_order )")
    .not("legacy_id", "is", null);

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered")
    .eq("user_id", userId);

  const typedCoverageRows = (coverageRows ?? []) as CoverageRow[];
  const typedKeySkillRows = (keySkillRows ?? []) as KeySkillRow[];

  const coverageByName = new Map(
    typedCoverageRows.map((c) => [
      String(c.key_skill_name ?? "")
        .toLowerCase()
        .trim(),
      c,
    ])
  );

  const enrichedKeySkills: KeySkillCandidate[] = typedKeySkillRows
    .filter(
      (ks): ks is KeySkillRow & { legacy_id: string; title: string } =>
        Boolean(ks.legacy_id && ks.title)
    )
    .map((ks) => {
      const coverage = coverageByName.get(
        String(ks.title ?? "").toLowerCase().trim()
      );
      const descriptorRows = Array.isArray(ks.descriptors) ? ks.descriptors : [];
      const descriptorTexts = descriptorRows
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((d) => String(d.text ?? "").trim())
        .filter((text) => text.length > 0);

      const cip = Array.isArray(ks.cips) ? (ks.cips[0] ?? null) : ks.cips;

      return {
        key_skill_id: ks.legacy_id,
        title: ks.title,
        cip_number: cip?.number ?? null,
        cip_title: cip?.title ?? null,
        descriptors: descriptorTexts,
        covered: coverage?.covered ?? null,
        evidence_count: coverage?.evidence_count ?? null,
      };
    });

  const targetedSkillRows = (body.target_key_skill_ids ?? [])
    .map((id) =>
      enrichedKeySkills.find((s) => s.key_skill_id === id)
    )
    .filter((s): s is KeySkillCandidate => s != null);

  const targetedSkills = targetedSkillRows
    .map((s) => ({
      id: s.key_skill_id,
      title: s.title,
      descriptors: s.descriptors,
    }));

  let result;
  try {
    result = await generatePortfolioEntry({
      entry_type: body.entry_type ?? "auto",
      free_text: body.free_text.trim(),
      stage_id: stageId,
      date_hint: body.date,
      length: body.length,
      target_key_skills: targetedSkills,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AI generation failed: " + msg },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Pre-filter: pick top 20 by basic text signal ──
  const entryText = Object.values(result.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const scored = enrichedKeySkills.map((ks) => {
    const allText = [ks.title, ...ks.descriptors].join(" ").toLowerCase();
    const words = allText
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const hits = words.filter((w) => entryText.includes(w)).length;
    const gapBoost = ks.covered === false ? 2 : 0;
    return { ks, score: hits + gapBoost };
  });

  const topCandidates = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.ks);

  // ── Pass 2 + stage resolution: run in parallel ──
  const [keySkillMatch, stageRow] = await Promise.all([
    matchKeySkills({
      entry_fields: result.fields,
      entry_type: result.entry_type,
      candidates: topCandidates,
      pinned_key_skill_ids: body.target_key_skill_ids ?? [],
    }).catch(() => ({
      suggested_key_skill_ids: [],
      rationale: {} as Record<string, string>,
    })),
    supabase
      .from("stages")
      .select("id")
      .eq("name", result.stage_id ?? stageId)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  result.suggested_key_skill_ids = keySkillMatch.suggested_key_skill_ids;
  result.key_skill_rationale = keySkillMatch.rationale;
  result.suggested_key_skills_detail =
    keySkillMatch.suggested_key_skill_ids.map((id) => {
      const skill = enrichedKeySkills.find((s) => s.key_skill_id === id);
      return {
        key_skill_id: id,
        title: skill?.title ?? id,
        cip_number: skill?.cip_number ?? null,
        covered: skill?.covered ?? null,
        rationale: keySkillMatch.rationale[id] ?? "",
      };
    });

  const stageUuid = stageRow?.id ?? null;

  const { data: saved, error: saveError } = await supabase
    .from("generated_entries")
    .insert({
      user_id: userId,
      entry_type: result.entry_type as GeneratedEntryType,
      raw_input: body.free_text.trim(),
      structured_data: result,
      suggested_key_skills: result.suggested_key_skill_ids ?? [],
      stage_id: stageUuid,
    })
    .select("id")
    .single();

  if (saveError) {
    console.error(
      "[PortfolioIQ] Failed to save generated entry:",
      saveError.message
    );
    return NextResponse.json(
      { ok: true, id: null, result },
      { headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    { ok: true, id: saved.id, result },
    { headers: CORS_HEADERS }
  );
}
