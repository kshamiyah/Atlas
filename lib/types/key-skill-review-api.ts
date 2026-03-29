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

export type PushQueueSkill = {
  suggestion_id: string;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  kaizen_id: string | null;
  kaizen_ids: string[];
  display_value: string;
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
