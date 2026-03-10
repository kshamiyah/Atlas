export type KaizenCipProgress = {
  id: string;
  user_id: string;
  cip_number: number;
  cip_title: string;
  percentage: number | null;
  status_colour: string | null;
  synced_at: string;
};

export type KaizenKeySkillCoverageLinkedItem = {
  type: string | null;
  name: string | null;
  stage: string | null;
  status: string | null;
};

export type KaizenKeySkillCoverage = {
  id: string;
  user_id: string;
  cip_number: number;
  key_skill_name: string;
  evidence_count: number | null;
  covered: boolean;
  linked_items: KaizenKeySkillCoverageLinkedItem[];
  synced_at: string;
};

export type KaizenEntry = {
  id: string;
  user_id: string;
  kaizen_date: string;
  assessment_type: string;
  title: string;
  category: string;
  training_year: string;
  status: string;
  key_skills_count: number | null;
  synced_at: string;
};

export type KaizenAssessmentRequestDirection = "outgoing" | "incoming";

export type KaizenAssessmentRequest = {
  id: string;
  user_id: string;
  direction: KaizenAssessmentRequestDirection;
  other_party_name: string;
  entry_title: string;
  status: string;
  date: string;
  synced_at: string;
};

export type KaizenSupervisorMeeting = {
  id: string;
  user_id: string;
  date: string;
  title: string;
  meeting_type: string;
  supervisor_name: string;
  synced_at: string;
};

