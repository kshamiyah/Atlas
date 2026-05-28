import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "@/components/key-skill-review/ReviewFilters";

export function statusFilterLabel(value: StatusFilter): string {
  if (value === "suggested") return "Pending";
  if (value === "confirmed") return "Accepted";
  if (value === "rejected") return "Skipped";
  return "All statuses";
}

export function sourceFilterLabel(value: SourceFilter): string {
  if (value === "linked_cip") return "Same CiP";
  if (value === "cross_cip") return "From another CiP";
  return "All sources";
}

export function confidenceFilterLabel(value: ConfidenceFilter): string {
  if (value === "lt_0_7") return "Lower confidence";
  if (value === "gte_0_7") return "High confidence";
  return "Any confidence";
}

export function quickFocusPresetLabel(
  preset: "pending" | "cross_pending" | "high_confidence" | null,
): string | null {
  if (preset === "pending") return "Pending only";
  if (preset === "cross_pending") return "From another CiP";
  if (preset === "high_confidence") return "High confidence first";
  return null;
}
