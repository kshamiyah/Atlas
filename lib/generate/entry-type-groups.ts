import type { GeneratedEntryType } from "@/lib/types/entries";

export type EntryTypeGroup = {
  id: string;
  label: string;
  types: GeneratedEntryType[];
};

export const ENTRY_TYPE_GROUPS: EntryTypeGroup[] = [
  {
    id: "clinical",
    label: "Clinical logs",
    types: ["reflection", "procedure", "other_evidence"],
  },
  {
    id: "assessment",
    label: "Assessments",
    types: [
      "cbd",
      "minicex",
      "notss",
      "osats_formative",
      "osats_summative",
      "cip_assessment",
    ],
  },
];
