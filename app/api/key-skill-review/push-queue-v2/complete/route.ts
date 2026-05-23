import { NextResponse } from "next/server";
import { getAuthFromRequest, isQueueV2TableMissing } from "../_shared";
import type { PushQueueV2FinishBody } from "@/lib/types/key-skill-review-api";

export async function PATCH(request: Request) {
  const auth = await getAuthFromRequest(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as PushQueueV2FinishBody | null;
  const groupId = String(body?.group_id || "").trim();
  const claimToken = String(body?.claim_token || "").trim();

  if (!groupId || !claimToken) {
    return NextResponse.json(
      { error: "group_id and claim_token are required." },
      { status: 400 },
    );
  }

  const syncedAt = new Date().toISOString();
  const { data: groupRows, error: groupError } = await auth.supabase
    .from("key_skill_review_push_queue_v2_groups")
    .update({
      status: "synced",
      last_error: null,
      last_synced_at: syncedAt,
      claim_token: null,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_heartbeat_at: null,
    })
    .eq("id", groupId)
    .eq("user_id", auth.userId)
    .eq("claim_token", claimToken)
    .eq("status", "running")
    .select("id")
    .limit(1);

  if (groupError) {
    if (isQueueV2TableMissing(groupError)) {
      return NextResponse.json({ error: "V2 queue tables are unavailable." }, { status: 500 });
    }
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }
  if (!groupRows || groupRows.length === 0) {
    return NextResponse.json({ error: "Claim no longer active for this V2 group." }, { status: 409 });
  }

  const { error: jobsError } = await auth.supabase
    .from("key_skill_review_push_queue_v2_jobs")
    .update({
      status: "synced",
      last_error: null,
      synced_at: syncedAt,
      claim_token: null,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_heartbeat_at: null,
    })
    .eq("group_id", groupId)
    .eq("user_id", auth.userId)
    .eq("claim_token", claimToken)
    .eq("status", "running");

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, group_id: groupId, synced_at: syncedAt });
}
