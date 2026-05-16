import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_SKILLS_PER_ENTRY_TARGET,
  MIN_SKILLS_PER_ENTRY_TARGET,
  RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
  parseSkillsPerEntryTargetOverride,
  resolveEffectiveSkillsPerEntryTarget,
} from "@/lib/key-skill-review/entry-skill-target";

const METADATA_OVERRIDE_KEY = "skills_per_entry_target_override";

type PatchBody = {
  review_entry_id?: unknown;
  target?: unknown;
};

type ReviewEntryRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

function isMissingProfileTargetColumnError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    String(error.message ?? "").includes("default_skills_per_entry_target")
  );
}

export async function PATCH(request: Request) {
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

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string" ? body.review_entry_id.trim() : "";
  if (!reviewEntryId) {
    return NextResponse.json(
      { error: "review_entry_id is required" },
      { status: 400 },
    );
  }

  if (!(body.target === null || parseSkillsPerEntryTargetOverride(body.target) != null)) {
    return NextResponse.json(
      {
        error: `target must be an integer between ${MIN_SKILLS_PER_ENTRY_TARGET} and ${MAX_SKILLS_PER_ENTRY_TARGET}, or null`,
      },
      { status: 400 },
    );
  }

  const {
    data: entry,
    error: entryError,
  } = await supabase
    .from("key_skill_review_entries")
    .select("id, metadata")
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
    return NextResponse.json({ error: "Review entry not found" }, { status: 404 });
  }

  const entryRow = entry as ReviewEntryRow;
  const existingMetadata =
    entryRow.metadata && typeof entryRow.metadata === "object"
      ? entryRow.metadata
      : {};

  const nextMetadata: Record<string, unknown> = { ...existingMetadata };
  const parsedOverride = parseSkillsPerEntryTargetOverride(body.target);
  if (body.target === null) {
    delete nextMetadata[METADATA_OVERRIDE_KEY];
  } else if (parsedOverride != null) {
    nextMetadata[METADATA_OVERRIDE_KEY] = parsedOverride;
  }

  const { error: updateError } = await supabase
    .from("key_skill_review_entries")
    .update({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewEntryId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update review entry: " + updateError.message },
      { status: 500 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_skills_per_entry_target")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError && !isMissingProfileTargetColumnError(profileError)) {
    return NextResponse.json(
      { error: "Failed to load profile target: " + profileError.message },
      { status: 500 },
    );
  }

  const profileDefault = isMissingProfileTargetColumnError(profileError)
    ? RECOMMENDED_SKILLS_PER_ENTRY_TARGET
    : profile?.default_skills_per_entry_target;
  const overrideTarget =
    body.target === null ? null : parseSkillsPerEntryTargetOverride(body.target);
  const effectiveTarget = resolveEffectiveSkillsPerEntryTarget(
    overrideTarget,
    profileDefault,
  );

  return NextResponse.json({
    ok: true,
    review_entry_id: reviewEntryId,
    override_target: overrideTarget,
    effective_target: effectiveTarget,
    recommended: RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
    min: MIN_SKILLS_PER_ENTRY_TARGET,
    max: MAX_SKILLS_PER_ENTRY_TARGET,
  });
}
