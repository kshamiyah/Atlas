"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReviewEntry } from "@/lib/types/key-skill-review";
import { ReviewCard } from "./ReviewCard";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "./ReviewFilters";

const PAGE_SIZE = 25;
export type ReviewQueueMode = "focus" | "list";

type ReviewQueueProps = {
  entries: ReviewEntry[];
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
  confidenceFilter: ConfidenceFilter;
  query: string;
  mode: ReviewQueueMode;
  onUpdateSuggestion: (
    entryId: string,
    suggestionId: string,
    source: "linked_cip" | "cross_cip",
    nextStatus: "suggested" | "confirmed" | "rejected",
  ) => void;
  disabled?: boolean;
  /** Progress hub deep-link: scroll focus mode to this entry when it appears in the filtered list. */
  progressFocusEntryId?: string | null;
  progressFocusSkillId?: string | null;
  progressFocusDescriptorId?: string | null;
};

export function ReviewQueue({
  entries,
  statusFilter,
  sourceFilter,
  confidenceFilter,
  query,
  mode,
  onUpdateSuggestion,
  disabled,
  progressFocusEntryId = null,
  progressFocusSkillId = null,
  progressFocusDescriptorId = null,
}: ReviewQueueProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [focusIndex, setFocusIndex] = useState(0);

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

  useEffect(() => {
    if (!progressFocusEntryId || mode !== "focus") return;
    const idx = visibleEntries.findIndex((e) => e.id === progressFocusEntryId);
    if (idx < 0) return;
    const id = window.requestAnimationFrame(() => {
      setFocusIndex(idx);
    });
    return () => window.cancelAnimationFrame(id);
  }, [progressFocusEntryId, mode, visibleEntries]);

  const cardFocusProps = (entryId: string) => {
    if (!progressFocusEntryId || entryId !== progressFocusEntryId) {
      return {
        highlightSkillId: null as string | null,
        highlightDescriptorId: null as string | null,
        descriptorPanelInitialOpen: false,
        expandedByDefault: false,
      };
    }
    return {
      highlightSkillId: progressFocusSkillId,
      highlightDescriptorId: progressFocusDescriptorId,
      descriptorPanelInitialOpen: Boolean(progressFocusDescriptorId && progressFocusSkillId),
      expandedByDefault: true,
    };
  };

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

  if (mode === "focus") {
    const activeIndex = Math.min(focusIndex, visibleEntries.length - 1);
    const activeEntry = visibleEntries[activeIndex];
    if (!activeEntry) return null;

    const totalSuggestions =
      activeEntry.linked_cip_suggestions.length +
      activeEntry.cross_cip_suggestions.length;
    const pendingSuggestions =
      activeEntry.linked_cip_suggestions.filter((s) => s.status === "suggested")
        .length +
      activeEntry.cross_cip_suggestions.filter((s) => s.status === "suggested")
        .length;
    const reviewedPct =
      totalSuggestions === 0
        ? 0
        : Math.round(((totalSuggestions - pendingSuggestions) / totalSuggestions) * 100);
    const progressPct =
      visibleEntries.length === 1
        ? 100
        : Math.round((activeIndex / (visibleEntries.length - 1)) * 100);

    return (
      <section className="space-y-3">
        <div className="rounded-xl border border-subtle bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Focus Mode
              </p>
              <h2 className="text-small font-semibold text-primary">
                Entry {activeIndex + 1} of {visibleEntries.length}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFocusIndex((i) => Math.max(i - 1, 0))}
                disabled={activeIndex === 0}
                className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setFocusIndex((i) => Math.min(i + 1, visibleEntries.length - 1))
                }
                disabled={activeIndex >= visibleEntries.length - 1}
                className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-secondary">
              {pendingSuggestions} pending of {totalSuggestions} suggestions on this entry
            </p>
            <p className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-secondary">
              {reviewedPct}% reviewed for this entry
            </p>
          </div>

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-4">
              <div
                className="h-full rounded-full bg-surface-5 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <ReviewCard
          key={activeEntry.id}
          entry={activeEntry}
          onUpdateSuggestion={onUpdateSuggestion}
          disabled={disabled}
          expandedByDefault
          highlightSkillId={cardFocusProps(activeEntry.id).highlightSkillId}
          highlightDescriptorId={cardFocusProps(activeEntry.id).highlightDescriptorId}
          descriptorPanelInitialOpen={cardFocusProps(activeEntry.id).descriptorPanelInitialOpen}
        />
      </section>
    );
  }

  const shownEntries = visibleEntries.slice(
    0,
    Math.min(visibleCount, visibleEntries.length),
  );
  const remaining = visibleEntries.length - shownEntries.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-subtle bg-surface-2 px-4 py-3">
        <h2 className="text-small font-semibold text-primary">Review queue</h2>
        <p className="text-xs text-muted">
          Showing {shownEntries.length} of {visibleEntries.length} entries
        </p>
      </div>

      <div className="space-y-3">
        {shownEntries.map((entry) => {
          const fp = cardFocusProps(entry.id);
          return (
            <ReviewCard
              key={entry.id}
              entry={entry}
              onUpdateSuggestion={onUpdateSuggestion}
              disabled={disabled}
              expandedByDefault={fp.expandedByDefault}
              highlightSkillId={fp.highlightSkillId}
              highlightDescriptorId={fp.highlightDescriptorId}
              descriptorPanelInitialOpen={fp.descriptorPanelInitialOpen}
            />
          );
        })}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="btn-secondary text-xs"
          >
            Load {Math.min(remaining, PAGE_SIZE)} more
            <span className="ml-1 text-muted">({remaining} remaining)</span>
          </button>
        </div>
      )}
    </section>
  );
}
