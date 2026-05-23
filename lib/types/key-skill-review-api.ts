import type { ReviewEntry } from "@/lib/types/key-skill-review";

export type QueueResponse = {
  entries: ReviewEntry[];
  total: number;
};

export type UpdateSuggestionStatusBody = {
  suggestion_id: string;
  status: "suggested" | "confirmed" | "rejected";
};

export type BootstrapResponse = {
  ok: true;
  upserted_entries: number;
  /** Count of entries bootstrapped with linked_cip_number = 0 (no CiP in source data). */
  included_without_linked_cip?: number;
  /** Count of TO1 (Team Observation 1) entries skipped — assessor-only, no accessible content. */
  skipped_to1?: number;
  /** Count of assessor-dependent entries skipped because the assessment request is not signed/completed. */
  skipped_unsigned_assessor?: number;
};

export type AnalyseDescriptorsBody = {
  entry_ids?: string[];
  force_full_refresh?: boolean;
};

export type AnalyseDescriptorsResponse = {
  processed: number;
  total_descriptors_analysed: number;
};

export type SuggestCrossCipBody = {
  entry_ids?: string[];
  force_full_refresh?: boolean;
};

export type SuggestCrossCipResponse = {
  processed: number;
  skipped: number;
  total_suggestions: number;
};

export type PushQueueStatus = "pending" | "running" | "synced" | "failed";

export type PushQueueActionType =
  | "add"
  | "remove"
  | "replace_remove"
  | "replace_add";

export type PushQueueSkill = {
  suggestion_id: string;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  kaizen_id: string | null;
  kaizen_ids: string[];
  display_value: string;
  action_type: PushQueueActionType;
  group_id: string | null;
  sequence_index: number | null;
  kaizen_skill_id: string | null;
  payload: Record<string, unknown> | null;
};

export type PushQueueEntry = {
  review_entry_id: string;
  title: string;
  date: string;
  entry_edit_url: string | null;
  status: PushQueueStatus;
  attempt_count: number;
  last_error: string | null;
  updated_at: string;
  latest_queue_synced_at: string | null;
  snapshot_synced_at: string | null;
  needs_snapshot_refresh: boolean;
  suggestion_ids: string[];
  skills: PushQueueSkill[];
};

export type PushQueueSummary = {
  total: number;
  pending: number;
  running: number;
  synced: number;
  failed: number;
};

export type PushQueueResponse = {
  queue_available: boolean;
  summary: PushQueueSummary;
  entries: PushQueueEntry[];
};

export type PushQueueStatusItem = {
  suggestion_id: string;
  status: PushQueueStatus;
  error?: string | null;
};

export type PushQueueStatusPatchBody = {
  items: PushQueueStatusItem[];
};

export type PushQueueV2GroupStatus = "pending" | "running" | "synced" | "failed";

export type PushQueueV2Job = {
  id: string;
  group_id: string;
  review_entry_id: string;
  suggestion_id: string | null;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  kaizen_id: string | null;
  kaizen_ids: string[];
  display_value: string;
  action_type: PushQueueActionType;
  action_group_id: string | null;
  sequence_index: number | null;
  kaizen_skill_id: string | null;
  payload: Record<string, unknown> | null;
  status: PushQueueV2GroupStatus;
  attempt_count: number;
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

export type PushQueueV2Group = {
  id: string;
  review_entry_id: string;
  source_entry_key: string | null;
  title: string;
  date: string;
  entry_edit_url: string | null;
  status: PushQueueV2GroupStatus;
  logical_change_count: number;
  attempt_count: number;
  last_error: string | null;
  claim_token: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  jobs: PushQueueV2Job[];
};

export type PushQueueV2Summary = {
  total: number;
  pending: number;
  running: number;
  synced: number;
  failed: number;
};

export type PushQueueV2Response = {
  queue_available: boolean;
  summary: PushQueueV2Summary;
  groups: PushQueueV2Group[];
};

export type PushQueueV2ImportBody = {
  statuses?: PushQueueStatus[];
};

export type PushQueueV2ImportResponse = {
  ok: true;
  queue_available: boolean;
  imported_groups: number;
  imported_jobs: number;
  statuses: PushQueueStatus[];
};

export type PushQueueV2ClaimBody = {
  limit?: number;
  worker_id?: string;
  lease_seconds?: number;
  group_id?: string;
};

export type PushQueueV2ClaimResponse = {
  queue_available: boolean;
  worker_id: string;
  claimed_at: string;
  claimed_count: number;
  claimed: PushQueueV2Group[];
};

export type PushQueueV2HeartbeatBody = {
  group_id: string;
  claim_token: string;
  worker_id?: string;
  lease_seconds?: number;
};

export type PushQueueV2FinishBody = {
  group_id: string;
  claim_token: string;
  worker_id?: string;
  detail?: string | null;
};

export type PushQueueV2RequeueBody = {
  group_id: string;
};

export type KeySkillReviewUnlinkBody = {
  review_entry_id: string;
  key_skill_id: string;
  kaizen_skill_id: string;
  reason?: string | null;
};

export type KeySkillReviewReplaceBody = {
  review_entry_id: string;
  recommendation_suggestion_id: string;
  replace_skill_id: string;
  replace_kaizen_skill_id?: string | null;
  recommendation_reason?: string | null;
  remove_reason?: string | null;
};

export type KeySkillReviewReplaceCancelBody = {
  review_entry_id: string;
  recommendation_suggestion_id: string;
  replace_suggestion_id: string;
  group_id?: string | null;
};

export type KeySkillReviewActionResponse = {
  ok: true;
  review_entry_id: string;
  queued: Array<{
    suggestion_id: string;
    action_type: PushQueueActionType;
    sequence_index: number;
  }>;
  group_id?: string | null;
};

export type KeySkillReviewReplaceCancelResponse = {
  ok: true;
  review_entry_id: string;
  cleared_suggestion_ids: string[];
  group_id?: string | null;
};

export type AuditReviewDecisionBody = {
  review_entry_id: string;
  recommendation_key: string;
  decision: "acted" | "kept" | "dismissed";
  audit_input_fingerprint: string;
  action: "remove" | "replace";
  key_skill_id: string;
  replace_skill_id?: string | null;
  key_skill_title?: string | null;
  replace_skill_title?: string | null;
};
