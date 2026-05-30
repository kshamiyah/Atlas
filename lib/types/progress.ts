/** Shared contract for GET /api/progress/summary and Progress hub UI. */

export type ProgressSummaryScope = {
  stage_id: string | null;
  stage_scope?: string | null;
  stage_group?: string | null;
  date_from: string | null;
  date_to: string | null;
  cip: number | null;
  year?: string | null;
};

export type ProgressKpiBlock = {
  covered: number;
  total: number;
  pct: number;
};

export type ProgressCheckpointType = "annual" | "stage_end" | "waypoint";
export type ProgressCheckpointTypeLabel =
  | "Annual ARCP"
  | "Stage-End ARCP"
  | "Waypoint ARCP";

export type ProgressCheckpointContext = {
  type: ProgressCheckpointType;
  label: ProgressCheckpointTypeLabel;
  current_stage: string | null;
  stage_elapsed_fraction: number | null;
  working_percent: number;
};

export type ProgressMessagePriority = "high" | "medium" | "low";

export type ProgressMessage = {
  id: string;
  priority: ProgressMessagePriority;
  title: string;
  body: string;
  cta_label: string;
  cta_href: string;
};

export type ProgressSummaryResponse = {
  scope: ProgressSummaryScope;
  checkpoint: ProgressCheckpointContext;
  kpis: {
    cips_checkpoint: ProgressKpiBlock;
    cips: ProgressKpiBlock;
    cip_assessments: ProgressKpiBlock;
    cip_assessments_on_track: ProgressKpiBlock;
    key_skills: ProgressKpiBlock;
    descriptors: ProgressKpiBlock;
  };
  messages: ProgressMessage[];
  updated_at: string;
};

export type ProgressRagStatus = "green" | "amber" | "red";

export type ProgressCipTopEntry = {
  review_entry_id: string;
  title: string;
  event_date: string | null;
};

export type ProgressCipGapKeySkill = {
  key_skill_id: string;
  skill_number: number;
  title: string;
};

export type ProgressCipGapDescriptor = {
  descriptor_id: string;
  key_skill_id: string;
  text: string;
};

export type ProgressCipAssessmentStatus =
  | "missing"
  | "below_expectations"
  | "below_entrustment"
  | "pending_entrustment"
  | "on_track";

export type ProgressCipAssessmentSummary = {
  status: ProgressCipAssessmentStatus;
  status_reason: string;
  is_complete: boolean;
  is_clinical: boolean;
  expected_entrustment: number | null;
  expected_entrustment_label: string | null;
  es_entrustment: number | null;
  es_entrustment_label: string | null;
  es_meets_expectations: boolean | null;
  es_meets_expectations_label: string | null;
  trainee_entrustment: number | null;
  trainee_entrustment_label: string | null;
  assessment_date: string | null;
  record_status: string | null;
};

export type ProgressCipRow = {
  cip_number: number;
  cip_title: string;
  status: ProgressRagStatus;
  checkpoint_type: ProgressCheckpointType;
  expected_key_skills_by_now: number | null;
  status_reason: string;
  evidence_status: ProgressRagStatus;
  evidence_status_reason: string;
  assessment: ProgressCipAssessmentSummary;
  entries_count: number;
  last_entry_date: string | null;
  key_skills: ProgressKpiBlock;
  descriptors: ProgressKpiBlock;
  missing_key_skills: number;
  missing_descriptors: number;
  gap_key_skills: ProgressCipGapKeySkill[];
  gap_descriptors: ProgressCipGapDescriptor[];
  top_entries: ProgressCipTopEntry[];
};

export type ProgressCipsResponse = {
  scope: ProgressSummaryScope;
  checkpoint: ProgressCheckpointContext;
  cips: ProgressCipRow[];
  updated_at: string;
};

export type ProgressKeySkillDescriptorItem = {
  descriptor_id: string;
  text: string;
  covered: boolean;
};

export type ProgressKeySkillRow = {
  key_skill_id: string;
  skill_number: number;
  title: string;
  is_confirmed: boolean;
  confirmed_entry_count: number;
  descriptor_coverage: ProgressKpiBlock;
  descriptor_items: ProgressKeySkillDescriptorItem[];
  top_entries: ProgressCipTopEntry[];
};

export type ProgressKeySkillGroup = {
  cip_number: number;
  cip_title: string;
  key_skills: ProgressKeySkillRow[];
};

export type ProgressKeySkillsResponse = {
  scope: ProgressSummaryScope;
  groups: ProgressKeySkillGroup[];
  updated_at: string;
};

export type ProgressDescriptorRow = {
  descriptor_id: string;
  text: string;
  covered: boolean;
  latest_activity_date: string | null;
  evidence_quote: string | null;
  confidence: number | null;
  supporting_entry_count: number;
  supporting_entries: ProgressCipTopEntry[];
};

export type ProgressDescriptorSkillGroup = {
  key_skill_id: string;
  skill_number: number;
  title: string;
  descriptor_coverage: ProgressKpiBlock;
  descriptors: ProgressDescriptorRow[];
};

export type ProgressDescriptorCipGroup = {
  cip_number: number;
  cip_title: string;
  skills: ProgressDescriptorSkillGroup[];
};

export type ProgressDescriptorsResponse = {
  scope: ProgressSummaryScope;
  groups: ProgressDescriptorCipGroup[];
  updated_at: string;
};
