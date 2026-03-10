export type CurriculumVersion = {
  id: string;
  name: string;
  source_document: string;
  effective_from: string | null;
  created_at: string | null;
};

export type CipCategory = "generic" | "clinical" | "specialty";

export type Cip = {
  id: string;
  curriculum_version_id: string;
  number: number;
  title: string;
  description: string;
  category: CipCategory;
};

export type KeySkill = {
  id: string;
  cip_id: string;
  skill_number: number;
  title: string;
  legacy_id: string | null;
};

export type Descriptor = {
  id: string;
  key_skill_id: string;
  text: string;
  sort_order: number;
};

export type ProcedureCatalogItem = {
  id: string;
  curriculum_version_id: string;
  name: string;
  category: "obstetrics" | "gynaecology";
  requires_summative_osats: boolean;
};

export type Stage = {
  id: string;
  name: string;
  stage_group: "Stage One" | "Stage Two" | "Stage Three";
  sort_order: number;
};

export type StageRequirementType =
  | "evidence_per_key_skill"
  | "procedure_target"
  | "supervision_level";

export type StageRequirement = {
  id: string;
  stage_id: string;
  cip_id: string;
  requirement_type: StageRequirementType;
  target_value: string;
  notes: string | null;
};

export type CourseCatalogItem = {
  id: string;
  curriculum_version_id: string;
  name: string;
  required_by_stage: string;
};

export type ExamCatalogItem = {
  id: string;
  curriculum_version_id: string;
  name: string;
  required_by_stage: string;
  notes: string | null;
};

