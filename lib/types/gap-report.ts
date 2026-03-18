/**
 * Descriptor-level result from the gap report API.
 */
export type GapReportDescriptor = {
  descriptor_id: string;
  text: string;
  covered: boolean;
  confidence: number | null;
  evidence_quote: string | null;
};

/**
 * Key skill with coverage and descriptor breakdown.
 */
export type GapReportKeySkill = {
  key_skill_id: string;
  skill_number: number;
  title: string;
  is_confirmed: boolean;
  confirmed_entry_count: number;
  total_descriptors: number;
  evidenced_descriptors: number;
  descriptors: GapReportDescriptor[];
};

/**
 * CIP (Classification of Instructional Program) with skill coverage summary.
 */
export type GapReportCip = {
  cip_number: string;
  cip_title: string;
  confirmed_skills: number;
  total_skills: number;
  coverage_pct: number;
  key_skills: GapReportKeySkill[];
};

/**
 * Top-level shape returned by the gap report API.
 */
export type GapReport = {
  cips: GapReportCip[];
};
