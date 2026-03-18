"use client";

import { useMemo, useState } from "react";
import type { ReviewEntry } from "@/lib/types/key-skill-review";
import { ReviewCard } from "./ReviewCard";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "./ReviewFilters";

const PAGE_SIZE = 25;

type ReviewQueueProps = {
  entries: ReviewEntry[];
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
  confidenceFilter: ConfidenceFilter;
  query: string;
  onUpdateSuggestion: (
    entryId: string,
    suggestionId: string,
    source: "linked_cip" | "cross_cip",
    nextStatus: "suggested" | "confirmed" | "rejected",
  ) => void;
  disabled?: boolean;
};

export function ReviewQueue({
  entries,
  statusFilter,
  sourceFilter,
  confidenceFilter,
  query,
  onUpdateSuggestion,
  disabled,
}: ReviewQueueProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleEntries = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();

    const applyStatusFilter = (arr: ReviewEntry["linked_cip_suggestions"]) => {
      if (statusFilter === "all") return arr;
      return arr.filter((s) => s.status === statusFilter);
    };

    const applyConfidenceFilter = (arr: ReviewEntry["linked_cip_suggestions"]) => {
      if (confidenceFilter === "all") return arr;
      if (confidenceFilter === "lt_0_7") return arr.filter((s) => s.confidence < 0.7);
      return arr.filter((s) => s.confidence >= 0.7);
    };

    const matchesSuggestionQuery = (s: ReviewEntry["linked_cip_suggestions"][number]) =>
      s.key_skill_title.toLowerCase().includes(normalisedQuery) ||
      s.key_skill_id.toLowerCase().includes(normalisedQuery);

    return entries
      .map((entry) => {
        let linked = entry.linked_cip_suggestions;
        let cross = entry.cross_cip_suggestions;

        if (sourceFilter === "linked_cip") cross = [];
        else if (sourceFilter === "cross_cip") linked = [];

        linked = applyConfidenceFilter(applyStatusFilter(linked));
        cross = applyConfidenceFilter(applyStatusFilter(cross));

        const entryTextMatch =
          !normalisedQuery ||
          entry.title.toLowerCase().includes(normalisedQuery) ||
          entry.raw_text.toLowerCase().includes(normalisedQuery);

        if (!entryTextMatch) {
          linked = linked.filter(matchesSuggestionQuery);
          cross = cross.filter(matchesSuggestionQuery);
        }

        if (linked.length === 0 && cross.length === 0) return null;

        return { ...entry, linked_cip_suggestions: linked, cross_cip_suggestions: cross };
      })
      .filter((e): e is ReviewEntry => e !== null);
  }, [entries, statusFilter, sourceFilter, confidenceFilter, query]);

  // Reset visible count when filters change
  useMemo(() => {
    setVisibleCount(PAGE_SIZE);
  }, [statusFilter, sourceFilter, confidenceFilter, query]);

  if (visibleEntries.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="text-small font-semibold text-primary mb-1.5">Review queue</h2>
        <p className="text-micro text-muted">
          No entries match the current filters. Try broadening your filters or clearing the
          search.
        </p>
      </section>
    );
  }

  const shownEntries = visibleEntries.slice(0, visibleCount);
  const remaining = visibleEntries.length - shownEntries.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-small font-semibold text-primary">Review queue</h2>
        <p className="text-[11px] text-muted">
          Showing {shownEntries.length} of {visibleEntries.length} entries
        </p>
      </div>

      <div className="space-y-3">
        {shownEntries.map((entry) => (
          <ReviewCard
            key={entry.id}
            entry={entry}
            onUpdateSuggestion={onUpdateSuggestion}
            disabled={disabled}
          />
        ))}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="btn-secondary text-[11px]"
          >
            Load {Math.min(remaining, PAGE_SIZE)} more
            <span className="ml-1 text-muted">({remaining} remaining)</span>
          </button>
        </div>
      )}
    </section>
  );
}
