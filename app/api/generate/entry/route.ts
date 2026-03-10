import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { generatePortfolioEntry } from "@/lib/ai/generate";
import type { GeneratedEntryType } from "@/lib/types/entries";

const VALID_ENTRY_TYPES: GeneratedEntryType[] = [
  "reflection",
  "procedure",
  "cbd",
  "minicex",
  "notss",
  "osats_formative",
  "osats_summative",
  "courses",
];

export async function POST(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    entry_type: GeneratedEntryType;
    free_text: string;
    date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_ENTRY_TYPES.includes(body.entry_type)) {
    return NextResponse.json({ error: "Invalid entry_type" }, { status: 400 });
  }
  if (
    !body.free_text ||
    typeof body.free_text !== "string" ||
    !body.free_text.trim()
  ) {
    return NextResponse.json(
      { error: "free_text is required" },
      { status: 400 }
    );
  }

  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title");

  const candidateKeySkills = (keySkillRows ?? [])
    .filter((ks) => ks.legacy_id && ks.title)
    .map((ks) => ({
      key_skill_id: ks.legacy_id as string,
      title: ks.title as string,
    }));

  let stageId = "ST1";
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_stage_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.current_stage_id) {
    const { data: stage } = await supabase
      .from("stages")
      .select("name")
      .eq("id", profile.current_stage_id)
      .maybeSingle();
    if (stage?.name) stageId = stage.name;
  }

  let result;
  try {
    result = await generatePortfolioEntry({
      entry_type: body.entry_type,
      free_text: body.free_text.trim(),
      stage_id: stageId,
      candidate_key_skills: candidateKeySkills,
      date_hint: body.date,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AI generation failed: " + msg },
      { status: 500 }
    );
  }

  const stageName = result.stage_id ?? stageId;
  let stageUuid: string | null = null;
  const { data: stageRow } = await supabase
    .from("stages")
    .select("id")
    .eq("name", stageName)
    .maybeSingle();
  if (stageRow?.id) stageUuid = stageRow.id;

  const { data: saved, error: saveError } = await supabase
    .from("generated_entries")
    .insert({
      user_id: user.id,
      entry_type: body.entry_type,
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
    return NextResponse.json({ ok: true, id: null, result });
  }

  return NextResponse.json({ ok: true, id: saved.id, result });
}
