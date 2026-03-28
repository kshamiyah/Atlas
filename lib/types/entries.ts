export type GeneratedEntryType =
  | "reflection"
  | "procedure"
  | "cip_assessment"
  | "cbd"
  | "minicex"
  | "notss"
  | "osats_formative"
  | "osats_summative"
  | "other_evidence";

export type GeneratedEntry = {
  id: string;
  user_id: string;
  entry_type: GeneratedEntryType;
  raw_input: string;
  structured_data: unknown;
  suggested_key_skills: string[] | null;
  stage_id: string | null;
  pushed_to_kaizen: boolean;
  pushed_at: string | null;
  created_at: string;
};
