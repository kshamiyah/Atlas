import type { GeneratedEntryType } from "@/lib/types/entries";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";

/** Live RCOG Training ePortfolio (matches extension sync + form-fill). */
export const KAIZEN_BASE_URL =
  (process.env.NEXT_PUBLIC_KAIZEN_BASE_URL ?? "https://training.rcog.org.uk").replace(
    /\/$/,
    "",
  );

/** Drupal "create entry" paths on training.rcog.org.uk */
export const KAIZEN_NEW_ENTRY_PATHS: Record<GeneratedEntryType, string> = {
  reflection: "/node/add/log-entry-reflection",
  procedure: "/node/add/log-entry-procedure",
  cip_assessment: "/node/add/assessment-type-cip-assessment",
  cbd: "/node/add/log-entry-assessment-cbd",
  minicex: "/node/add/log-entry-assessment-mini-cex",
  notss: "/node/add/log-entry-assessment-notss",
  osats_formative: "/node/add/log-entry-assessment-osats",
  osats_summative: "/node/add/log-entry-assessment-osats-summative",
  other_evidence: "/node/add/log-entry",
};

export function buildKaizenNewEntryUrl(entryType: GeneratedEntryType): string {
  const path = KAIZEN_NEW_ENTRY_PATHS[entryType] ?? "/eportfolio";
  return `${KAIZEN_BASE_URL}${path}`;
}

export function kaizenEntryTypeLabel(entryType: GeneratedEntryType): string {
  return ENTRY_TYPE_SCHEMAS[entryType]?.title ?? entryType;
}
