import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  AUDIT_REVIEW_DECISIONS_KEY,
  parseAuditReviewDecisions,
  upsertAuditReviewDecision,
  type AuditReviewDecisionRecord,
} from "@/lib/key-skill-review/audit-review-decisions";
import type { AuditReviewDecisionBody } from "@/lib/types/key-skill-review-api";

type EntryRow = {
  metadata: Record<string, unknown> | null;
};

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

  let body: AuditReviewDecisionBody;
  try {
    body = (await request.json()) as AuditReviewDecisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewEntryId =
    typeof body.review_entry_id === "string" ? body.review_entry_id.trim() : "";
  const recommendationKey =
    typeof body.recommendation_key === "string" ? body.recommendation_key.trim() : "";
  const auditInputFingerprint =
    typeof body.audit_input_fingerprint === "string"
      ? body.audit_input_fingerprint.trim()
      : "";
  const keySkillId =
    typeof body.key_skill_id === "string" ? body.key_skill_id.trim() : "";

  if (!reviewEntryId || !recommendationKey || !auditInputFingerprint || !keySkillId) {
    return NextResponse.json(
      { error: "review_entry_id, recommendation_key, audit_input_fingerprint and key_skill_id are required" },
      { status: 400 },
    );
  }
  if (
    body.decision !== "acted" &&
    body.decision !== "kept" &&
    body.decision !== "dismissed"
  ) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  if (body.action !== "remove" && body.action !== "replace") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: entryRow, error: entryError } = await supabase
    .from("key_skill_review_entries")
    .select("metadata")
    .eq("id", reviewEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (entryError) {
    return NextResponse.json(
      { error: "Failed to load review entry: " + entryError.message },
      { status: 500 },
    );
  }
  if (!entryRow) {
    return NextResponse.json({ error: "Review entry not found" }, { status: 404 });
  }

  const metadata =
    entryRow && typeof (entryRow as EntryRow).metadata === "object"
      ? ((entryRow as EntryRow).metadata ?? {})
      : {};
  const currentDecisions = parseAuditReviewDecisions(metadata);
  const nextDecision: AuditReviewDecisionRecord = {
    recommendation_key: recommendationKey,
    decision: body.decision,
    audit_input_fingerprint: auditInputFingerprint,
    action: body.action,
    key_skill_id: keySkillId,
    replace_skill_id:
      typeof body.replace_skill_id === "string" ? body.replace_skill_id.trim() : null,
    key_skill_title:
      typeof body.key_skill_title === "string" ? body.key_skill_title : null,
    replace_skill_title:
      typeof body.replace_skill_title === "string" ? body.replace_skill_title : null,
    reviewed_at: new Date().toISOString(),
  };
  const nextDecisions = upsertAuditReviewDecision(currentDecisions, nextDecision);

  const { error: updateError } = await supabase
    .from("key_skill_review_entries")
    .update({
      metadata: {
        ...metadata,
        [AUDIT_REVIEW_DECISIONS_KEY]: nextDecisions,
      },
    })
    .eq("id", reviewEntryId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to store audit review decision: " + updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    review_entry_id: reviewEntryId,
    decision: nextDecision,
    decision_count: nextDecisions.length,
  });
}
