import { NextResponse } from "next/server";
import {
  emptySummary,
  getAuthFromRequest,
  isLeaseExpired,
  isQueueV2TableMissing,
  loadGroupsWithJobs,
  toIsoLeaseExpiry,
} from "../_shared";
import type {
  PushQueueV2ClaimBody,
  PushQueueV2ClaimResponse,
} from "@/lib/types/key-skill-review-api";

export async function POST(request: Request) {
  const auth = await getAuthFromRequest(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as PushQueueV2ClaimBody | null;
  const limit = Math.min(Math.max(Number(body?.limit ?? 3), 1), 10);
  const leaseSeconds = Math.min(Math.max(Number(body?.lease_seconds ?? 120), 30), 900);
  const workerId = String(body?.worker_id || "portfolioiq-extension-v2").trim();
  const requestedGroupId = String(body?.group_id || "").trim();

  let candidateQuery = auth.supabase
    .from("key_skill_review_push_queue_v2_groups")
    .select("*")
    .eq("user_id", auth.userId)
    .in("status", ["pending", "failed"]);

  if (requestedGroupId) {
    candidateQuery = candidateQuery.eq("id", requestedGroupId).limit(1);
  } else {
    candidateQuery = candidateQuery.order("updated_at", { ascending: true }).limit(limit * 3);
  }

  const { data: candidateRows, error: candidateError } = await candidateQuery;

  if (candidateError) {
    if (isQueueV2TableMissing(candidateError)) {
      const empty: PushQueueV2ClaimResponse = {
        queue_available: false,
        worker_id: workerId,
        claimed_at: new Date().toISOString(),
        claimed_count: 0,
        claimed: [],
      };
      return NextResponse.json(empty);
    }
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  const now = Date.now();
  const claimable = (candidateRows ?? []).filter((row) =>
    isLeaseExpired(row.lease_expires_at, now),
  );

  const claimedIds: string[] = [];
  for (const row of claimable) {
    if (claimedIds.length >= limit) break;
    const claimToken = crypto.randomUUID();
    const claimedAt = new Date().toISOString();
    const leaseExpiresAt = toIsoLeaseExpiry(leaseSeconds);

    const { data: updatedRows, error: updateError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_groups")
      .update({
        status: "running",
        claim_token: claimToken,
        claimed_by: workerId,
        claimed_at: claimedAt,
        lease_expires_at: leaseExpiresAt,
        last_heartbeat_at: claimedAt,
        last_error: null,
        attempt_count: (row.attempt_count ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("user_id", auth.userId)
      .in("status", ["pending", "failed"])
      .select("id")
      .limit(1);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) continue;

    const { error: jobsError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .update({
        status: "running",
        claim_token: claimToken,
        claimed_by: workerId,
        claimed_at: claimedAt,
        lease_expires_at: leaseExpiresAt,
        last_heartbeat_at: claimedAt,
        last_error: null,
      })
      .eq("group_id", row.id)
      .eq("user_id", auth.userId)
      .in("status", ["pending", "failed"]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    claimedIds.push(row.id);
  }

  const { queueAvailable, groups } = await loadGroupsWithJobs(auth.supabase, auth.userId, claimedIds);
  const response: PushQueueV2ClaimResponse = {
    queue_available: queueAvailable,
    worker_id: workerId,
    claimed_at: new Date().toISOString(),
    claimed_count: groups.length,
    claimed: groups,
  };
  return NextResponse.json(response);
}
