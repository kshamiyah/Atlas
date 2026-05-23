import { NextResponse } from "next/server";
import {
  getAuthFromRequest,
  isDescriptorOnlyNonSyncKeySkill,
  isQueueV2TableMissing,
} from "../_shared";
import type { PushQueueV2RequeueBody } from "@/lib/types/key-skill-review-api";

export async function POST(request: Request) {
  const auth = await getAuthFromRequest(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as PushQueueV2RequeueBody | null;
  const groupId = String(body?.group_id || "").trim();

  if (!groupId) {
    return NextResponse.json({ error: "group_id is required." }, { status: 400 });
  }

  const { data: existingJobs, error: existingJobsError } = await auth.supabase
    .from("key_skill_review_push_queue_v2_jobs")
    .select("id,cip_number,key_skill_title")
    .eq("group_id", groupId)
    .eq("user_id", auth.userId);

  if (existingJobsError) {
    return NextResponse.json({ error: existingJobsError.message }, { status: 500 });
  }

  const skipJobIds = ((existingJobs ?? []) as Array<{
    id: string;
    cip_number: number | null;
    key_skill_title: string | null;
  }>)
    .filter((job) =>
      isDescriptorOnlyNonSyncKeySkill(Number(job.cip_number ?? 0), String(job.key_skill_title ?? "")),
    )
    .map((job) => job.id);

  const activeJobIds = ((existingJobs ?? []) as Array<{ id: string }>)
    .map((job) => job.id)
    .filter((id) => !skipJobIds.includes(id));

  const nowIso = new Date().toISOString();
  const groupStatus = activeJobIds.length > 0 ? "pending" : "synced";

  const { data: groupRows, error: groupError } = await auth.supabase
    .from("key_skill_review_push_queue_v2_groups")
    .update({
      status: groupStatus,
      last_error: null,
      claim_token: null,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_heartbeat_at: null,
      last_synced_at: groupStatus === "synced" ? nowIso : null,
    })
    .eq("id", groupId)
    .eq("user_id", auth.userId)
    .select("id")
    .limit(1);

  if (groupError) {
    if (isQueueV2TableMissing(groupError)) {
      return NextResponse.json(
        { error: "V2 queue tables are unavailable. Run the latest migration first." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }
  if (!groupRows || groupRows.length === 0) {
    return NextResponse.json({ error: "V2 group not found." }, { status: 404 });
  }

  if (activeJobIds.length > 0) {
    const { error: activeJobsError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .update({
        status: "pending",
        last_error: null,
        claim_token: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_heartbeat_at: null,
        synced_at: null,
      })
      .eq("user_id", auth.userId)
      .in("id", activeJobIds);

    if (activeJobsError) {
      return NextResponse.json({ error: activeJobsError.message }, { status: 500 });
    }
  }

  if (skipJobIds.length > 0) {
    const { error: skipJobsError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .update({
        status: "synced",
        last_error: null,
        claim_token: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_heartbeat_at: null,
        synced_at: nowIso,
      })
      .eq("user_id", auth.userId)
      .in("id", skipJobIds);

    if (skipJobsError) {
      return NextResponse.json({ error: skipJobsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    group_id: groupId,
    requeued_at: nowIso,
  });
}
