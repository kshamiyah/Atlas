export type AttributionStatus = "suggested" | "confirmed" | "rejected";

export type SkillSuggestion = {
  suggestion_id?: string;
  key_skill_id: string;
  cip_number: number;
  key_skill_title: string;
  confidence: number; // 0-1
  rationale: string;
  status: AttributionStatus;
  source: "linked_cip" | "cross_cip";
};

export type DescriptorCoverage = {
  descriptor_id: string;
  descriptor_text: string;
  sort_order: number;
  covered: boolean;
  confidence: number;
  evidence_quote: string | null;
};

export type KeySkillCoverage = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  descriptors: DescriptorCoverage[];
};

export type ReviewEntry = {
  id: string;
  title: string;
  entry_type: string;
  linked_cip_number: number;
  date: string;
  raw_text: string;
  linked_cip_suggestions: SkillSuggestion[];
  cross_cip_suggestions: SkillSuggestion[];
  descriptor_coverage?: KeySkillCoverage[];
};
