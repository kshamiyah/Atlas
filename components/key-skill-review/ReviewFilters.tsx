"use client";

import { useMemo } from "react";
import type { AttributionStatus } from "@/lib/types/key-skill-review";

export type StatusFilter = "all" | AttributionStatus;
export type SourceFilter = "all" | "linked_cip" | "cross_cip";
export type ConfidenceFilter = "all" | "lt_0_7" | "gte_0_7";
export type ReviewFiltersLayout = "select" | "stacked-pills";

type ReviewFiltersProps = {
  status: StatusFilter;
  source: SourceFilter;
  confidence: ConfidenceFilter;
  query: string;
  showTitle?: boolean;
  showFacetFilters?: boolean;
  helperText?: string | null;
  layout?: ReviewFiltersLayout;
  onStatusChange: (value: StatusFilter) => void;
  onSourceChange: (value: SourceFilter) => void;
  onConfidenceChange: (value: ConfidenceFilter) => void;
  onQueryChange: (value: string) => void;
};

function pillButtonClass(active: boolean): string {
  return [
    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
    active
      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
      : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary",
  ].join(" ");
}

function FilterPillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={pillButtonClass(value === option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewFilters({
  status,
  source,
  confidence,
  query,
  showTitle = true,
  showFacetFilters = true,
  helperText = null,
  layout = "select",
  onStatusChange,
  onSourceChange,
  onConfidenceChange,
  onQueryChange,
}: ReviewFiltersProps) {
  const statusOptions: { value: StatusFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "suggested", label: "Pending" },
      { value: "confirmed", label: "Accepted" },
      { value: "rejected", label: "Skipped" },
    ],
    [],
  );

  const sourceOptions: { value: SourceFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "linked_cip", label: "Same CiP" },
      { value: "cross_cip", label: "Other CiP" },
    ],
    [],
  );

  const confidenceOptions: { value: ConfidenceFilter; label: string }[] =
    useMemo(
      () => [
        { value: "all", label: "Any" },
        { value: "gte_0_7", label: "High" },
        { value: "lt_0_7", label: "Lower" },
      ],
      [],
    );

  return (
    <section className="space-y-4">
      <div className={showFacetFilters && layout === "select" ? "space-y-3 border-b border-subtle pb-3" : "space-y-3"}>
        {showTitle && (
          <h2 className="text-small font-semibold text-primary">Search & filters</h2>
        )}
        <div>
          <label
            htmlFor="review-filter-search"
            className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted"
          >
            Search
          </label>
          <div className="relative mt-1.5">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="review-filter-search"
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Title, entry text, or skill…"
              className="w-full rounded-xl border border-subtle bg-surface-1 py-2 pl-9 pr-3 text-xs text-primary placeholder:text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            />
          </div>
          {helperText && layout === "select" ? (
            <p className="mt-1.5 text-[11px] text-muted">{helperText}</p>
          ) : null}
        </div>
      </div>

      {showFacetFilters && layout === "stacked-pills" ? (
        <div className="space-y-4">
          <FilterPillGroup
            label="Status"
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
          />
          <FilterPillGroup
            label="Source"
            value={source}
            options={sourceOptions}
            onChange={onSourceChange}
          />
          <FilterPillGroup
            label="Confidence"
            value={confidence}
            options={confidenceOptions}
            onChange={onConfidenceChange}
          />
        </div>
      ) : null}

      {showFacetFilters && layout === "select" ? (
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
      ) : null}
    </section>
  );
}
