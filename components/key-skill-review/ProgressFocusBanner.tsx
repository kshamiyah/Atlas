"use client";

import type { ParsedProgressFocus, ProgressFocusMatch } from "@/lib/key-skill-review/progress-focus";

export function ProgressFocusBanner({
  parsed,
  resolution,
  loading,
  onClear,
}: {
  parsed: ParsedProgressFocus;
  resolution: ProgressFocusMatch | null;
  loading: boolean;
  onClear: () => void;
}) {
  const bits: string[] = [];
  if (parsed.cip != null) bits.push(`CiP ${parsed.cip}`);
  if (parsed.skillId) bits.push("key skill");
  if (parsed.descriptorId) bits.push("descriptor");
  const scopeLabel = bits.length > 0 ? bits.join(" · ") : "Progress";

  let detail: string;
  if (loading || resolution === null) {
    detail = "Locating the matching entry in your queue…";
  } else if (resolution.matchQuality === "matched") {
    detail = `Showing ${scopeLabel} in context.`;
  } else if (resolution.matchQuality === "partial") {
    detail =
      "Some link details did not match this queue — opened the closest entry. You can still review nearby suggestions.";
  } else {
    detail =
      "Could not match this link to your current queue. Try syncing entries or clearing filters.";
  }

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-blue">Focused from Progress</p>
        <p className="mt-1 text-small text-secondary">{detail}</p>
      </div>
      <button type="button" onClick={onClear} className="btn-secondary shrink-0 text-xs">
        Clear focus
      </button>
    </div>
  );
}
