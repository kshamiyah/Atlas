import { createHash } from "crypto";

export function buildKaizenSourceEntryKey(input: {
  source_entry_id?: string;
  kaizen_date: string;
  assessment_type: string;
  title: string;
  category: string;
  training_year: string;
  status: string;
}) {
  const sourceEntryId = String(input.source_entry_id ?? "").trim();

  // Prefer stable source entry id when available so one Kaizen entry
  // always resolves to one review entry across sync/bootstrap runs.
  if (sourceEntryId) {
    return createHash("sha256")
      .update(`kaizen_source_entry_id|${sourceEntryId}`)
      .digest("hex");
  }

  const payload = [
    input.kaizen_date ?? "",
    input.assessment_type ?? "",
    input.title ?? "",
    input.category ?? "",
    input.training_year ?? "",
    input.status ?? "",
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}
