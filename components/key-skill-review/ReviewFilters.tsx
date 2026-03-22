"use client";

import { useMemo } from "react";
import type { AttributionStatus } from "@/lib/types/key-skill-review";

export type StatusFilter = "all" | AttributionStatus;
export type SourceFilter = "all" | "linked_cip" | "cross_cip";
export type ConfidenceFilter = "all" | "lt_0_7" | "gte_0_7";

type ReviewFiltersProps = {
  status: StatusFilter;
  source: SourceFilter;
  confidence: ConfidenceFilter;
  query: string;
  onStatusChange: (value: StatusFilter) => void;
  onSourceChange: (value: SourceFilter) => void;
  onConfidenceChange: (value: ConfidenceFilter) => void;
  onQueryChange: (value: string) => void;
};

export function ReviewFilters({
  status,
  source,
  confidence,
  query,
  onStatusChange,
  onSourceChange,
  onConfidenceChange,
  onQueryChange,
}: ReviewFiltersProps) {
  const statusOptions: { value: StatusFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      { value: "suggested", label: "Suggested" },
      { value: "confirmed", label: "Confirmed" },
      { value: "rejected", label: "Rejected" },
    ],
    [],
  );

  const sourceOptions: { value: SourceFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "All sources" },
      { value: "linked_cip", label: "Linked CiP" },
      { value: "cross_cip", label: "Cross-CiP" },
    ],
    [],
  );

  const confidenceOptions: { value: ConfidenceFilter; label: string }[] =
    useMemo(
      () => [
        { value: "all", label: "All confidence" },
        { value: "lt_0_7", label: "< 0.7" },
        { value: "gte_0_7", label: "≥ 0.7" },
      ],
      [],
    );

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-subtle pb-3">
        <h2 className="text-small font-semibold text-primary">
          Review filters
        </h2>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Search
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search title, text, or key skill…"
            className="mt-1 w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-xs text-primary placeholder:text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Status
          </label>
          <select
            className="mt-1 block w-full rounded-lg border border-subtle bg-surface-1 px-2 py-2 text-xs text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Source
          </label>
          <select
            className="mt-1 block w-full rounded-lg border border-subtle bg-surface-1 px-2 py-2 text-xs text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            value={source}
            onChange={(e) => onSourceChange(e.target.value as SourceFilter)}
          >
            {sourceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Confidence
          </label>
          <select
            className="mt-1 block w-full rounded-lg border border-subtle bg-surface-1 px-2 py-2 text-xs text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            value={confidence}
            onChange={(e) =>
              onConfidenceChange(e.target.value as ConfidenceFilter)
            }
          >
            {confidenceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
