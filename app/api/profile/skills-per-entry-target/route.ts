import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_SKILLS_PER_ENTRY_TARGET,
  MIN_SKILLS_PER_ENTRY_TARGET,
  RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
  sanitizeSkillsPerEntryTarget,
} from "@/lib/key-skill-review/entry-skill-target";

const HIGH_TARGET_WARNING_THRESHOLD = 5;

function buildResponse(defaultSkillsPerEntryTarget: number) {
  return {
    ok: true,
    default_skills_per_entry_target: defaultSkillsPerEntryTarget,
    recommended: RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
    min: MIN_SKILLS_PER_ENTRY_TARGET,
    max: MAX_SKILLS_PER_ENTRY_TARGET,
    high_target_warning_threshold: HIGH_TARGET_WARNING_THRESHOLD,
  };
}

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("default_skills_per_entry_target")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const isMissingColumnError =
      error.code === "42703" ||
      error.message.includes("default_skills_per_entry_target");
    if (isMissingColumnError) {
      return NextResponse.json(
        buildResponse(RECOMMENDED_SKILLS_PER_ENTRY_TARGET),
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultSkillsPerEntryTarget = sanitizeSkillsPerEntryTarget(
    profile?.default_skills_per_entry_target,
  );

  return NextResponse.json(buildResponse(defaultSkillsPerEntryTarget));
}

export async function PATCH(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { default_skills_per_entry_target?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.default_skills_per_entry_target !== "number") {
    return NextResponse.json(
      { error: "default_skills_per_entry_target must be a number" },
      { status: 400 },
    );
  }

  const target = body.default_skills_per_entry_target;
  if (!Number.isInteger(target)) {
    return NextResponse.json(
      { error: "default_skills_per_entry_target must be an integer" },
      { status: 400 },
    );
  }

  if (
    target < MIN_SKILLS_PER_ENTRY_TARGET ||
    target > MAX_SKILLS_PER_ENTRY_TARGET
  ) {
    return NextResponse.json(
      {
        error: `default_skills_per_entry_target must be between ${MIN_SKILLS_PER_ENTRY_TARGET} and ${MAX_SKILLS_PER_ENTRY_TARGET}`,
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        default_skills_per_entry_target: target,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(buildResponse(target));
}
