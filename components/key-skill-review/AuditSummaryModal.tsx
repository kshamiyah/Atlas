"use client";

type AuditBreakdown = {
  entriesConsidered: number;
  issuesFound: number;
  overlinkedEntries: number;
  persistenceWarningCount: number;
  replaceCount: number;
  addCount: number;
  flagCount: number;
  skippedUnchangedCount: number;
  warningEntryCount: number;
  llmEstimatedCostUsd: number;
  llmApiCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
};

export function AuditSummaryModal({
  isOpen,
  breakdown,
  onStartReview,
  onViewOverlinkedFirst,
  onClose,
}: {
  isOpen: boolean;
  breakdown: AuditBreakdown;
  onStartReview: () => void;
  onViewOverlinkedFirst: () => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const title =
    breakdown.persistenceWarningCount > 0
      ? "Audit complete with warnings"
      : breakdown.issuesFound > 0
        ? "Audit complete"
        : "All links look good";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card p-6 shadow-2xl space-y-4">
        <h3 className="text-small font-semibold text-primary">{title}</h3>
        <div className="rounded-xl border border-subtle bg-surface-1 p-3 text-[12px] text-secondary space-y-1.5">
          <p>Entries considered: {breakdown.entriesConsidered}</p>
          <p>Issues found: {breakdown.issuesFound}</p>
          <p>Overlinked entries: {breakdown.overlinkedEntries}</p>
          <p>Persistence warnings: {breakdown.persistenceWarningCount}</p>
          <p>Replace findings: {breakdown.replaceCount}</p>
          <p>Add findings: {breakdown.addCount}</p>
          <p>Flag findings: {breakdown.flagCount}</p>
          <p>Skipped unchanged: {breakdown.skippedUnchangedCount}</p>
          <p>Entries with warnings: {breakdown.warningEntryCount}</p>
          <p>
            Estimated run cost: $
            {Number.isFinite(breakdown.llmEstimatedCostUsd)
              ? breakdown.llmEstimatedCostUsd.toFixed(4)
              : "0.0000"}
          </p>
          <p>
            LLM usage: {breakdown.llmApiCalls} calls · {breakdown.llmInputTokens} in ·{" "}
            {breakdown.llmOutputTokens} out tokens
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onStartReview} className="btn-primary text-[11px]">
            Start review
          </button>
          <button type="button" onClick={onViewOverlinkedFirst} className="btn-secondary text-[11px]">
            View overlinked first
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-[11px]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
