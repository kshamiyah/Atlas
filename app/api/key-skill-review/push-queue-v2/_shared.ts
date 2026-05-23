import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PushQueueActionType,
  PushQueueV2Group,
  PushQueueV2GroupStatus,
  PushQueueV2Job,
  PushQueueV2Summary,
} from "@/lib/types/key-skill-review-api";

type PushQueueV2GroupRow = {
  id: string;
  user_id: string;
  review_entry_id: string;
  source_entry_key: string | null;
  title: string;
  event_date: string | null;
  entry_edit_url: string | null;
  status: PushQueueV2GroupStatus;
  logical_change_count: number | null;
  attempt_count: number | null;
  last_error: string | null;
  claim_token: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type PushQueueV2JobRow = {
  id: string;
  group_id: string;
  review_entry_id: string;
  suggestion_id: string | null;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number | null;
  kaizen_id: string | null;
  kaizen_ids: string[] | null;
  display_value: string;
  action_type: PushQueueActionType;
  action_group_id: string | null;
  sequence_index: number | null;
  kaizen_skill_id: string | null;
  payload: Record<string, unknown> | null;
  status: PushQueueV2GroupStatus;
  attempt_count: number | null;
  last_error: string | null;
  claim_token: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  queued_at: string;
  last_attempt_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type V2ClaimableGroup = PushQueueV2GroupRow & {
  jobs: PushQueueV2JobRow[];
};

export const V2_GROUP_STATUS_ORDER: Record<PushQueueV2GroupStatus, number> = {
  running: 0,
  failed: 1,
  pending: 2,
  synced: 3,
};

const DESCRIPTOR_ONLY_NON_SYNC_KEY_SKILLS = new Set<string>([
  "4::Appreciates the importance of stakeholders in quality improvement work",
]);

export function emptySummary(): PushQueueV2Summary {
  return { total: 0, pending: 0, running: 0, synced: 0, failed: 0 };
}

export function countLogicalChanges(
  jobs: Array<{
    action_type: PushQueueActionType | string | null | undefined;
    action_group_id?: string | null;
  }>,
): number {
  const replaceGroups = new Set<string>();
  let count = 0;

  for (const job of jobs) {
    const actionType = normaliseActionType(job.action_type);
    if (actionType === "replace_remove" || actionType === "replace_add") {
      const groupId = String(job.action_group_id || "").trim();
      if (!groupId || replaceGroups.has(groupId)) continue;
      replaceGroups.add(groupId);
      count += 1;
      continue;
    }

    count += 1;
  }

  return count;
}

export function isDescriptorOnlyNonSyncKeySkill(cipNumber: number, title: string): boolean {
  return DESCRIPTOR_ONLY_NON_SYNC_KEY_SKILLS.has(`${cipNumber}::${title}`);
}

export function normaliseActionType(
  value: PushQueueActionType | string | null | undefined,
): PushQueueActionType {
  const clean = String(value || "").trim();
  if (clean === "remove" || clean === "replace_remove" || clean === "replace_add") {
    return clean;
  }
  return "add";
}

export function isLeaseExpired(leaseExpiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!leaseExpiresAt) return true;
  const expires = new Date(leaseExpiresAt).getTime();
  if (!Number.isFinite(expires)) return true;
  return expires <= now;
}

export function toIsoLeaseExpiry(leaseSeconds: number): string {
  return new Date(Date.now() + leaseSeconds * 1000).toISOString();
}

export function isQueueV2TableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    haystack.includes("key_skill_review_push_queue_v2") &&
    (haystack.includes("does not exist") || haystack.includes("could not find"))
  );
}

export async function getAuthFromRequest(request: Request): Promise<
  | { userId: string; supabase: SupabaseClient }
  | { response: Response }
> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await getUserFromBearerToken(authHeader);
    if ("error" in auth) {
      return { response: Response.json({ error: auth.error }, { status: 401 }) };
    }
    return {
      userId: auth.user.id,
      supabase: createSupabaseClientWithToken(auth.accessToken),
    };
  }

  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    return { response: Response.json({ error: error.message }, { status: 500 }) };
  }
  if (!user) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: user.id, supabase };
}

export async function getUserIdForRead(): Promise<
  | { userId: string; supabase: SupabaseClient; bypassAuth: false }
  | { userId: null; supabase: SupabaseClient; bypassAuth: true }
  | { response: Response }
> {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && !(bypassAuth && !user)) {
    return { response: Response.json({ error: error.message }, { status: 500 }) };
  }
  if (!user && !bypassAuth) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!user && bypassAuth) {
    return { userId: null, supabase, bypassAuth: true };
  }

  return { userId: user!.id, supabase, bypassAuth: false };
}

export function mapJobRow(job: PushQueueV2JobRow): PushQueueV2Job {
  return {
    id: job.id,
    group_id: job.group_id,
    review_entry_id: job.review_entry_id,
    suggestion_id: job.suggestion_id,
    key_skill_id: job.key_skill_id,
    key_skill_title: job.key_skill_title,
    cip_number: job.cip_number ?? 0,
    kaizen_id: job.kaizen_id,
    kaizen_ids: Array.isArray(job.kaizen_ids)
      ? job.kaizen_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    display_value: job.display_value,
    action_type: normaliseActionType(job.action_type),
    action_group_id: job.action_group_id,
    sequence_index: job.sequence_index,
    kaizen_skill_id: job.kaizen_skill_id,
    payload: job.payload ?? null,
    status: job.status,
    attempt_count: job.attempt_count ?? 0,
    last_error: job.last_error,
    claim_token: job.claim_token,
    claimed_by: job.claimed_by,
    claimed_at: job.claimed_at,
    lease_expires_at: job.lease_expires_at,
    last_heartbeat_at: job.last_heartbeat_at,
    queued_at: job.queued_at,
    last_attempt_at: job.last_attempt_at,
    synced_at: job.synced_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

export function mapGroupRow(group: PushQueueV2GroupRow, jobs: PushQueueV2JobRow[]): PushQueueV2Group {
  const mappedJobs = jobs
    .map(mapJobRow)
    .sort((a, b) => {
      const aSeq = a.sequence_index ?? Number.POSITIVE_INFINITY;
      const bSeq = b.sequence_index ?? Number.POSITIVE_INFINITY;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.created_at.localeCompare(b.created_at);
    });

  return {
    id: group.id,
    review_entry_id: group.review_entry_id,
    source_entry_key: group.source_entry_key,
    title: group.title,
    date: group.event_date ?? "",
    entry_edit_url: group.entry_edit_url,
    status: group.status,
    logical_change_count:
      typeof group.logical_change_count === "number" && Number.isFinite(group.logical_change_count)
        ? group.logical_change_count
        : countLogicalChanges(mappedJobs),
    attempt_count: group.attempt_count ?? 0,
    last_error: group.last_error,
    claim_token: group.claim_token,
    claimed_by: group.claimed_by,
    claimed_at: group.claimed_at,
    lease_expires_at: group.lease_expires_at,
    last_heartbeat_at: group.last_heartbeat_at,
    last_synced_at: group.last_synced_at,
    created_at: group.created_at,
    updated_at: group.updated_at,
    jobs: mappedJobs,
  };
}

export async function loadGroupsWithJobs(
  supabase: SupabaseClient,
  userId: string,
  groupIds?: string[],
): Promise<{
  queueAvailable: boolean;
  groups: PushQueueV2Group[];
}> {
  let groupsQuery = supabase
    .from("key_skill_review_push_queue_v2_groups")
    .select("*")
    .eq("user_id", userId);

  if (Array.isArray(groupIds) && groupIds.length > 0) {
    groupsQuery = groupsQuery.in("id", groupIds);
  }

  const { data: groupsData, error: groupsError } = await groupsQuery.order("updated_at", {
    ascending: false,
  });

  if (groupsError) {
    if (isQueueV2TableMissing(groupsError)) {
      return { queueAvailable: false, groups: [] };
    }
    throw groupsError;
  }

  const groups = (groupsData ?? []) as PushQueueV2GroupRow[];
  if (groups.length === 0) {
    return { queueAvailable: true, groups: [] };
  }

  const groupIdsToLoad = groups.map((group) => group.id);
  const { data: jobsData, error: jobsError } = await supabase
    .from("key_skill_review_push_queue_v2_jobs")
    .select("*")
    .eq("user_id", userId)
    .in("group_id", groupIdsToLoad);

  if (jobsError) {
    if (isQueueV2TableMissing(jobsError)) {
      return { queueAvailable: false, groups: [] };
    }
    throw jobsError;
  }

  const jobsByGroup = new Map<string, PushQueueV2JobRow[]>();
  for (const row of (jobsData ?? []) as PushQueueV2JobRow[]) {
    const existing = jobsByGroup.get(row.group_id);
    if (existing) existing.push(row);
    else jobsByGroup.set(row.group_id, [row]);
  }

  const mappedGroups = groups
    .map((group) => mapGroupRow(group, jobsByGroup.get(group.id) ?? []))
    .sort((a, b) => {
      const byStatus = V2_GROUP_STATUS_ORDER[a.status] - V2_GROUP_STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return { queueAvailable: true, groups: mappedGroups };
}
