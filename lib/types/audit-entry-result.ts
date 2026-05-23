export type AuditFindingType =
  | "overlinked"
  | "add"
  | "replace"
  | "remove"
  | "flag"
  | "ok";

export type AuditWarningCode =
  | "descriptor_analysis_failed"
  | "candidate_analysis_failed"
  | "plan_review_failed"
  | "audit_suggestion_upsert_failed"
  | "audit_structured_action_columns_unavailable"
  | "audit_marker_update_failed";

export type AuditWarningStage =
  | "descriptor_analysis"
  | "candidate_analysis"
  | "plan_review"
  | "suggestion_persistence"
  | "marker_update";

export type AuditWarningDetail = {
  warning: AuditWarningCode | string;
  stage: AuditWarningStage | string;
  message: string;
  code?: string;
  status?: number;
  name?: string;
};

export type AuditCurrentLinkedSkill = {
  raw: string;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  kaizen_id: string | null;
  descriptor_count: number;
  match_method: "kaizen_id" | "kaizen_id_alias" | "title_exact";
};

export type AuditLinkedSkillQuality = {
  key_skill_id: string;
  key_skill_title: string;
  evidence_score: number;
  verdict: "weak" | "moderate" | "strong";
  total_descriptors: number;
  covered_descriptors_count: number;
  covered_descriptor_ids: string[];
  weak_descriptor_ids: string[];
};

export type AuditCandidateRecommendation = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  action: "add" | "replace" | "remove";
  replace_skill_id: string | null;
  replace_skill_title: string | null;
  confidence: number;
  rationale: string;
  suggestion_id?: string;
  portfolio_need_score?: number;
  removal_cost?: number;
  target_kaizen_skill_id?: string | null;
  logic_points?: string[];
};

export type AuditLinkPlanSkillDecision =
  | "keep"
  | "remove"
  | "replace_in"
  | "replace_out"
  | "ignore_pending";

export type AuditLinkPlanSkill = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  decision: AuditLinkPlanSkillDecision;
  source: "current_kaizen" | "pending_suggestion";
  confidence: number | null;
  rationale: string;
  suggestion_source?: "linked_cip" | "cross_cip" | null;
  replace_skill_id?: string | null;
  replace_skill_title?: string | null;
  logic_points?: string[];
};

export type AuditLinkPlanOptionalReplacement = {
  incoming_key_skill_id: string;
  incoming_key_skill_title: string;
  incoming_cip_number: number;
  outgoing_key_skill_id: string;
  outgoing_key_skill_title: string | null;
  confidence: number;
  rationale: string;
  logic_points?: string[];
};

export type AuditLinkPlan = {
  mode: "rebalance";
  effective_target: number;
  current_linked_count: number;
  recommended_final_skill_ids: string[];
  keep_count: number;
  remove_count: number;
  replace_count: number;
  ignore_pending_count: number;
  summary: string;
  skills: AuditLinkPlanSkill[];
  optional_replacements?: AuditLinkPlanOptionalReplacement[];
};

export type AuditFinding =
  | {
      type: "overlinked";
      current_linked_skill_count: number;
      raw_linked_skill_count: number;
      effective_linked_skill_count: number;
      effective_target: number;
      overlinked_by: number;
      rationale: string;
    }
  | {
      type: "replace";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      replace_skill_id: string;
      replace_skill_title: string | null;
      confidence: number;
      rationale: string;
    }
  | {
      type: "add";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      confidence: number;
      rationale: string;
    }
  | {
      type: "remove";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      confidence: number;
      rationale: string;
      removal_cost?: number;
    }
  | {
      type: "flag";
      key_skill_id: string;
      key_skill_title: string;
      reason: "weak_unreplaced";
      evidence_score: number;
      rationale: string;
    }
  | {
      type: "ok";
      rationale: string;
    };

export type AuditEntryResult = {
  review_entry_id?: string;
  audit_input_fingerprint?: string | null;
  source_entry_id?: string | null;
  effective_target?: number;
  confirmed_skill_count?: number;
  current_linked_skill_count?: number;
  raw_linked_skill_count?: number;
  effective_linked_skill_count?: number;
  overlinked?: boolean;
  overlinked_by?: number;
  slots_remaining?: number;
  linked_key_skills_raw?: string;
  linked_key_skills_parsed?: string[];
  current_linked_skills?: AuditCurrentLinkedSkill[];
  current_linked_skill_quality?: AuditLinkedSkillQuality[];
  candidate_recommendations?: AuditCandidateRecommendation[];
  audit_findings?: AuditFinding[];
  primary_finding?: AuditFinding;
  unresolved_linked_skills?: string[];
  gap_skill_ids?: string[];
  gap_skill_count?: number;
  status_hint?: string;
  audit_link_plan?: AuditLinkPlan;
  audit_skipped?: boolean;
  skip_reason?: string;
  audit_cost?: {
    model: string;
    api_calls: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
  audit_warning?: Array<AuditWarningCode | string>;
  audit_warning_details?: AuditWarningDetail[];
};
