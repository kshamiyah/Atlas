import type { GeneratedEntryType } from "@/lib/types/entries";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";

/** Live RCOG Training ePortfolio (matches extension sync + form-fill). */
export const KAIZEN_BASE_URL =
  (process.env.NEXT_PUBLIC_KAIZEN_BASE_URL ?? "https://training.rcog.org.uk").replace(
    /\/$/,
    "",
  );

export const KAIZEN_DASHBOARD_URL = `${KAIZEN_BASE_URL}/dashboard`;

/**
 * Create-entry bundle slugs on training.rcog.org.uk.
 * Log entries: /log-entry/add/logentry_*_logentry
 * Assessments: /assessment-type/add/assesstype_*
 */
export const KAIZEN_NEW_ENTRY_PATHS: Record<GeneratedEntryType, string> = {
  reflection: "/log-entry/add/logentry_reflective_logentry",
  procedure: "/log-entry/add/logentry_procedure_logentry",
  other_evidence: "/log-entry/add/logentry_logentry",
  cip_assessment: "/assessment-type/add/assesstype_cip_assessment",
  cbd: "/assessment-type/add/assesstype_cbd",
  minicex: "/assessment-type/add/assesstype_mini_cex",
  notss: "/assessment-type/add/assesstype_notss",
  osats_formative: "/assessment-type/add/assesstype_osats_formative",
  osats_summative: "/assessment-type/add/assesstype_osats_summative",
};

export function buildKaizenNewEntryUrl(entryType: GeneratedEntryType): string {
  const path = KAIZEN_NEW_ENTRY_PATHS[entryType] ?? "/dashboard";
  return `${KAIZEN_BASE_URL}${path}`;
}

export function buildKaizenFillTargetUrl(entryType: GeneratedEntryType): string {
  return buildKaizenNewEntryUrl(entryType);
}

export function kaizenEntryTypeLabel(entryType: GeneratedEntryType): string {
  return ENTRY_TYPE_SCHEMAS[entryType]?.title ?? entryType;
}

export const KAIZEN_ADD_MANUAL_HINT =
  "Dashboard → green Add button → choose the matching entry type.";

/** Menu labels the extension uses if direct navigation fails. */
export const KAIZEN_ADD_MENU_SEARCH: Record<GeneratedEntryType, string[]> = {
  reflection: ["Reflective Practice", "Reflective practice", "Reflective log", "Reflection"],
  procedure: ["Procedure Log", "Procedure log", "Procedure"],
  other_evidence: ["Other Evidence", "Other evidence"],
  cip_assessment: ["CiP Assessment", "CIP Assessment", "CiP assessment"],
  cbd: ["Case-based Discussion", "Case based Discussion", "CBD", "CbD"],
  minicex: [
    "Mini Clinical Evaluation Exercise",
    "Mini-CEX",
    "Mini CEX",
    "Mini-CEX (Mini Clinical Evaluation Exercise)",
  ],
  notss: ["Non-Technical Skills for Surgeons", "NOTSS", "NotSS"],
  osats_formative: ["OSATS (Formative)", "OSATS Formative", "Formative OSATS"],
  osats_summative: ["OSATS (Summative)", "OSATS Summative", "Summative OSATS"],
};
