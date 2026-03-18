import type { GapReportKeySkill } from "@/lib/types/gap-report";

const EVIDENCE_QUOTE_MAX_LEN = 100;

function truncateQuote(quote: string | null): string {
  if (!quote) return "";
  if (quote.length <= EVIDENCE_QUOTE_MAX_LEN) return quote;
  return quote.slice(0, EVIDENCE_QUOTE_MAX_LEN).trim() + "…";
}

function suggestEntryType(missingTexts: string[]): string {
  const lower = missingTexts.join(" ").toLowerCase();
  if (lower.includes("teach") || lower.includes("supervis"))
    return "teaching log or TO2";
  if (lower.includes("audit") || lower.includes("quality"))
    return "QI project or audit entry";
  if (lower.includes("research") || lower.includes("evidence"))
    return "research or journal club entry";
  if (lower.includes("communicat") || lower.includes("counsel"))
    return "CbD or Mini-CEX";
  return "reflective CbD entry";
}

type DescriptorPanelProps = {
  keySkill: GapReportKeySkill;
};

export function DescriptorPanel({ keySkill }: DescriptorPanelProps) {
  const missingCount =
    keySkill.total_descriptors - keySkill.evidenced_descriptors;
  const missingDescriptors = keySkill.descriptors.filter((d) => !d.covered);
  const hasMissingDescriptors = missingCount > 0;
  const entryTypeSuggestion = hasMissingDescriptors
    ? suggestEntryType(missingDescriptors.map((d) => d.text))
    : "";

  return (
    <div className="mt-3 rounded-lg border border-subtle bg-surface-3 p-3">
      <ul className="flex flex-col gap-2" role="list">
        {keySkill.descriptors.map((d) => (
          <li key={d.descriptor_id} className="flex flex-col gap-0.5">
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 text-sm font-bold leading-none ${
                  d.covered ? "text-accent-green" : "text-accent-red/70"
                }`}
                aria-hidden
              >
                {d.covered ? "✓" : "✗"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    d.covered
                      ? "text-xs text-primary"
                      : "text-xs text-accent-red/80"
                  }
                >
                  {d.text}
                </p>
                {d.covered && (
                  <>
                    {d.confidence != null && (
                      <p className="mt-0.5 text-[11px] tabular-nums text-secondary">
                        {Math.round(d.confidence * 100)}% confidence
                      </p>
                    )}
                    {d.evidence_quote && (
                      <p className="mt-0.5 text-[11px] italic text-muted">
                        &ldquo;{truncateQuote(d.evidence_quote)}&rdquo;
                      </p>
                    )}
                  </>
                )}
                {!d.covered && (
                  <p className="mt-0.5 text-[11px] text-accent-red/80">
                    Not evidenced
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {hasMissingDescriptors && (
        <div className="mt-3 rounded border border-accent-amber/30 bg-accent-amber/10 px-3 py-2">
          <p className="text-[11px] text-accent-amber">
            Still missing {missingCount}{" "}
            {missingCount === 1 ? "descriptor" : "descriptors"} — a{" "}
            <span className="text-accent-amber">{entryTypeSuggestion}</span>{" "}
            focusing on{" "}
            {missingDescriptors
              .slice(0, 2)
              .map((d) => `"${d.text.slice(0, 50)}${d.text.length > 50 ? "…" : ""}"`)
              .join(", ")}{" "}
            would help cover these.
          </p>
        </div>
      )}
    </div>
  );
}
