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
};

export type AnalyseDescriptorsResponse = {
  processed: number;
  total_descriptors_analysed: number;
};

export type SuggestCrossCipResponse = {
  processed: number;
  skipped: number;
  total_suggestions: number;
};
