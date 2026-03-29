"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewEntry } from "@/lib/types/key-skill-review";
import { ReviewCard } from "./ReviewCard";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "./ReviewFilters";

const PAGE_SIZE = 25;
export type ReviewQueueMode = "focus" | "list";
export type FocusReviewMode = "classic" | "swipe";
const SWIPE_THRESHOLD_PX = 96;

type ReviewQueueProps = {
  entries: ReviewEntry[];
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
  confidenceFilter: ConfidenceFilter;
  query: string;
  mode: ReviewQueueMode;
  focusReviewMode?: FocusReviewMode;
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
  onUndoLastAction?: (() => void) | null;
  canUndoLastAction?: boolean;
  onRequestExitSwipeMode?: (() => void) | null;
};

type PendingSuggestionTarget = {
  suggestionId: string;
  source: "linked_cip" | "cross_cip";
};

type PendingSuggestionCandidate = ReviewEntry["linked_cip_suggestions"][number] & {
  source: "linked_cip" | "cross_cip";
};

function isEditableTarget(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  if (target.isContentEditable) return true;
  return false;
}

function countPendingSuggestions(entry: ReviewEntry): number {
  const linkedPending = entry.linked_cip_suggestions.filter((s) => s.status === "suggested").length;
  const crossPending = entry.cross_cip_suggestions.filter((s) => s.status === "suggested").length;
  return linkedPending + crossPending;
}

function firstPendingSuggestion(entry: ReviewEntry): PendingSuggestionTarget | null {
  const all = pendingSuggestionsForEntry(entry);
  if (all.length === 0) return null;
  const next = all[0];
  if (!next?.suggestion_id) return null;
  return { suggestionId: next.suggestion_id, source: next.source };
}

function pendingSuggestionsForEntry(entry: ReviewEntry): PendingSuggestionCandidate[] {
  const all = [
    ...entry.linked_cip_suggestions.map((s) => ({ ...s, source: "linked_cip" as const })),
    ...entry.cross_cip_suggestions.map((s) => ({ ...s, source: "cross_cip" as const })),
  ]
    .filter((s) => s.status === "suggested" && typeof s.suggestion_id === "string" && s.suggestion_id.length > 0)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.key_skill_title.localeCompare(b.key_skill_title);
    });
  return all;
}

export function ReviewQueue({
  entries,
  statusFilter,
  sourceFilter,
  confidenceFilter,
  query,
  mode,
  focusReviewMode = "classic",
  onUpdateSuggestion,
  disabled,
  progressFocusEntryId = null,
  progressFocusSkillId = null,
  progressFocusDescriptorId = null,
  onUndoLastAction = null,
  canUndoLastAction = false,
  onRequestExitSwipeMode = null,
}: ReviewQueueProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [focusIndex, setFocusIndex] = useState(0);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [navigationDirection, setNavigationDirection] = useState<"next" | "prev">("next");
  const [swipeDragX, setSwipeDragX] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState<"confirm" | "reject" | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeStartX = useRef<number | null>(null);

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

  const pendingCountsByEntryId = useMemo(() => {
    const out = new Map<string, number>();
    for (const entry of visibleEntries) {
      out.set(entry.id, countPendingSuggestions(entry));
    }
    return out;
  }, [visibleEntries]);

  const pendingEntryIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < visibleEntries.length; i += 1) {
      const entry = visibleEntries[i];
      if (!entry) continue;
      if ((pendingCountsByEntryId.get(entry.id) ?? 0) > 0) out.push(i);
    }
    return out;
  }, [pendingCountsByEntryId, visibleEntries]);

  const totalPendingAcrossVisible = useMemo(
    () => [...pendingCountsByEntryId.values()].reduce((acc, n) => acc + n, 0),
    [pendingCountsByEntryId],
  );

  const activeIndex = Math.min(focusIndex, Math.max(visibleEntries.length - 1, 0));
  const activeEntry = visibleEntries[activeIndex] ?? null;
  const activeEntryPending = activeEntry ? pendingCountsByEntryId.get(activeEntry.id) ?? 0 : 0;
  const activePendingSuggestions = useMemo(
    () => (activeEntry ? pendingSuggestionsForEntry(activeEntry) : []),
    [activeEntry],
  );
  const activeSpotlightSuggestion = activePendingSuggestions[0] ?? null;
  const nextSpotlightSuggestion = activePendingSuggestions[1] ?? null;

  const nextPendingIndex = useMemo(() => {
    if (pendingEntryIndices.length === 0) return null;
    for (const idx of pendingEntryIndices) {
      if (idx > activeIndex) return idx;
    }
    return pendingEntryIndices[0] ?? null;
  }, [activeIndex, pendingEntryIndices]);

  const prevPendingIndex = useMemo(() => {
    if (pendingEntryIndices.length === 0) return null;
    for (let i = pendingEntryIndices.length - 1; i >= 0; i -= 1) {
      const idx = pendingEntryIndices[i];
      if (idx < activeIndex) return idx;
    }
    return pendingEntryIndices[pendingEntryIndices.length - 1] ?? null;
  }, [activeIndex, pendingEntryIndices]);

  const navigateToIndex = useCallback(
    (targetIndex: number) => {
      if (targetIndex === focusIndex) return;
      setSwipeDragX(0);
      setIsSwiping(false);
      setSwipeAnimating(null);
      swipeStartX.current = null;
      setNavigationDirection(targetIndex > focusIndex ? "next" : "prev");
      setFocusIndex(targetIndex);
    },
    [focusIndex],
  );

  const goToNextPending = useCallback(() => {
    if (nextPendingIndex == null) return;
    navigateToIndex(nextPendingIndex);
  }, [navigateToIndex, nextPendingIndex]);

  const goToPrevPending = useCallback(() => {
    if (prevPendingIndex == null) return;
    navigateToIndex(prevPendingIndex);
  }, [navigateToIndex, prevPendingIndex]);

  const updateSuggestionWithAutoAdvance = useCallback(
    (
      entryId: string,
      suggestionId: string,
      source: "linked_cip" | "cross_cip",
      nextStatus: "suggested" | "confirmed" | "rejected",
    ) => {
      if (mode === "focus" && autoAdvanceEnabled && nextStatus !== "suggested") {
        const entryIndex = visibleEntries.findIndex((e) => e.id === entryId);
        if (entryIndex >= 0) {
          const targetEntry = visibleEntries[entryIndex];
          const targetSuggestions =
            source === "linked_cip"
              ? targetEntry.linked_cip_suggestions
              : targetEntry.cross_cip_suggestions;
          const targetSuggestion = targetSuggestions.find((s) => s.suggestion_id === suggestionId);
          const pendingBefore = countPendingSuggestions(targetEntry);

          if (targetSuggestion?.status === "suggested" && pendingBefore === 1) {
            const nextIdxFromCurrent = (() => {
              for (let i = entryIndex + 1; i < visibleEntries.length; i += 1) {
                const candidate = visibleEntries[i];
                if (!candidate) continue;
                if (countPendingSuggestions(candidate) > 0) return i;
              }
              for (let i = 0; i < entryIndex; i += 1) {
                const candidate = visibleEntries[i];
                if (!candidate) continue;
                if (countPendingSuggestions(candidate) > 0) return i;
              }
              return null;
            })();

            if (nextIdxFromCurrent != null) {
              navigateToIndex(nextIdxFromCurrent);
            }
          }
        }
      }

      onUpdateSuggestion(entryId, suggestionId, source, nextStatus);
    },
    [autoAdvanceEnabled, mode, navigateToIndex, onUpdateSuggestion, visibleEntries],
  );

  const applyDecisionToFirstPending = useCallback(
    (status: "confirmed" | "rejected") => {
      if (!activeEntry) return;
      const target = firstPendingSuggestion(activeEntry);
      if (!target) return;
      updateSuggestionWithAutoAdvance(activeEntry.id, target.suggestionId, target.source, status);
    },
    [activeEntry, updateSuggestionWithAutoAdvance],
  );

  const commitSpotlightDecision = useCallback(
    (status: "confirmed" | "rejected") => {
      if (!activeEntry || !activeSpotlightSuggestion?.suggestion_id) return;
      if (swipeAnimating) return;

      setSwipeAnimating(status === "confirmed" ? "confirm" : "reject");
      setSwipeDragX(0);
      setIsSwiping(false);
      swipeStartX.current = null;

      const suggestionId = activeSpotlightSuggestion.suggestion_id;
      const source = activeSpotlightSuggestion.source;
      const entryId = activeEntry.id;
      window.setTimeout(() => {
        updateSuggestionWithAutoAdvance(entryId, suggestionId, source, status);
        setSwipeAnimating(null);
        setSwipeDragX(0);
        setIsSwiping(false);
      }, 280);
    },
    [activeEntry, activeSpotlightSuggestion, swipeAnimating, updateSuggestionWithAutoAdvance],
  );

  const handleSpotlightPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSpotlightSuggestion || disabled || swipeAnimating) return;
    swipeStartX.current = e.clientX;
    setIsSwiping(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [activeSpotlightSuggestion, disabled, swipeAnimating]);

  const handleSpotlightPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSwiping) return;
    const startX = swipeStartX.current;
    if (startX == null) return;
    const delta = e.clientX - startX;
    const clamped = Math.max(-180, Math.min(180, delta));
    setSwipeDragX(clamped);
  }, [isSwiping]);

  const finishSpotlightSwipe = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);
    swipeStartX.current = null;
    if (swipeDragX >= SWIPE_THRESHOLD_PX) {
      commitSpotlightDecision("confirmed");
      return;
    }
    if (swipeDragX <= -SWIPE_THRESHOLD_PX) {
      commitSpotlightDecision("rejected");
      return;
    }
    setSwipeDragX(0);
  }, [commitSpotlightDecision, isSwiping, swipeDragX]);

  useEffect(() => {
    if (!progressFocusEntryId || mode !== "focus") return;
    const idx = visibleEntries.findIndex((e) => e.id === progressFocusEntryId);
    if (idx < 0) return;
    const id = window.requestAnimationFrame(() => {
      navigateToIndex(idx);
    });
    return () => window.cancelAnimationFrame(id);
  }, [navigateToIndex, progressFocusEntryId, mode, visibleEntries]);

  useEffect(() => {
    if (mode !== "focus") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const active = document.activeElement;
      if (isEditableTarget(active)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && focusReviewMode === "swipe" && onRequestExitSwipeMode) {
        e.preventDefault();
        onRequestExitSwipeMode();
        return;
      }
      const key = e.key.toLowerCase();
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (focusReviewMode === "swipe") {
          commitSpotlightDecision("confirmed");
        } else {
          applyDecisionToFirstPending("confirmed");
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (focusReviewMode === "swipe") {
          commitSpotlightDecision("rejected");
        } else {
          applyDecisionToFirstPending("rejected");
        }
        return;
      }
      if (key === "n") {
        e.preventDefault();
        goToNextPending();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        goToPrevPending();
        return;
      }
      if (key === "u" && canUndoLastAction && onUndoLastAction) {
        e.preventDefault();
        onUndoLastAction();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    applyDecisionToFirstPending,
    commitSpotlightDecision,
    canUndoLastAction,
    focusReviewMode,
    goToNextPending,
    goToPrevPending,
    mode,
    onRequestExitSwipeMode,
    onUndoLastAction,
  ]);

  useEffect(() => {
    if (mode !== "focus" || focusReviewMode !== "swipe") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [focusReviewMode, mode]);

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

    const quickActionDisabled = pendingSuggestions <= 0 || disabled || swipeAnimating !== null;
    const swipeAbs = Math.abs(swipeDragX);
    const swipeProgress = Math.min(1, swipeAbs / SWIPE_THRESHOLD_PX);
    const swipeTrackX = Math.max(-52, Math.min(52, swipeDragX * 0.35));
    const swipeScale = 1 - Math.min(0.015, swipeAbs / 4200);
    const swipeTiltStyle = {
      transform: swipeAnimating
        ? "scale(0.985)"
        : `translateX(${swipeTrackX}px) scale(${swipeScale})`,
      opacity: swipeAnimating ? 0 : 1,
      boxShadow:
        swipeAnimating === "confirm"
          ? "0 0 0 3px rgba(52, 199, 89, 0.28)"
          : swipeAnimating === "reject"
            ? "0 0 0 3px rgba(255, 69, 58, 0.24)"
            : swipeDragX >= 18
              ? "0 0 0 2px rgba(52, 199, 89, 0.18)"
              : swipeDragX <= -18
                ? "0 0 0 2px rgba(255, 69, 58, 0.16)"
                : undefined,
      transition: isSwiping
        ? "none"
        : swipeAnimating
          ? "background-color 90ms ease, border-color 90ms ease, box-shadow 90ms ease, opacity 200ms ease 70ms, transform 200ms ease 70ms"
          : "transform 180ms cubic-bezier(0.2, 0.75, 0.2, 1), opacity 180ms cubic-bezier(0.2, 0.75, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.75, 0.2, 1)",
    } as const;
    const stackedCardStyle = {
      transform: `translateY(${swipeAnimating ? 0 : Math.max(0, 10 - swipeProgress * 10)}px) scale(${swipeAnimating ? 1 : 0.97 + swipeProgress * 0.03})`,
      opacity: nextSpotlightSuggestion
        ? swipeAnimating
          ? 0.96
          : 0.62 + swipeProgress * 0.28
        : swipeAnimating
          ? 0.62
          : 0.5,
      transition: isSwiping
        ? "none"
        : "transform 220ms cubic-bezier(0.2, 0.75, 0.2, 1), opacity 220ms cubic-bezier(0.2, 0.75, 0.2, 1)",
    } as const;
    const swipeTintClass =
      swipeAnimating === "confirm"
        ? "border-accent-green/55 bg-accent-green/18"
        : swipeAnimating === "reject"
          ? "border-accent-red/55 bg-accent-red/18"
          : swipeDragX >= 18
        ? "border-accent-green/35 bg-accent-green/6"
        : swipeDragX <= -18
          ? "border-accent-red/35 bg-accent-red/6"
          : "border-subtle bg-surface-1";

    return (
      <section className="space-y-3">
        {focusReviewMode !== "swipe" && (
          <div className="sticky top-3 z-10 rounded-xl border border-subtle bg-surface-2/95 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-secondary">
                <span className="font-semibold text-primary">{activeEntryPending}</span> pending on this entry ·{" "}
                <span className="font-semibold text-primary">{totalPendingAcrossVisible}</span> pending in current queue
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyDecisionToFirstPending("confirmed")}
                  disabled={quickActionDisabled}
                  className="btn-primary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: Right Arrow"
                >
                  Confirm next (Right Arrow)
                </button>
                <button
                  type="button"
                  onClick={() => applyDecisionToFirstPending("rejected")}
                  disabled={quickActionDisabled}
                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: Left Arrow"
                >
                  Reject next (Left Arrow)
                </button>
                <button
                  type="button"
                  onClick={goToNextPending}
                  disabled={nextPendingIndex == null}
                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: N"
                >
                  Next pending (N)
                </button>
                <button
                  type="button"
                  onClick={onUndoLastAction ?? undefined}
                  disabled={!canUndoLastAction || !onUndoLastAction}
                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: U"
                >
                  Undo (U)
                </button>
              </div>
            </div>
          </div>
        )}

        {focusReviewMode !== "swipe" && (
          <div className="rounded-xl border border-subtle bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Focus Mode
                </p>
                <h2 className="text-small font-semibold text-primary">
                  Entry {activeIndex + 1} of {visibleEntries.length}
                </h2>
                <p className="text-[11px] text-muted">
                  {totalPendingAcrossVisible} pending suggestion
                  {totalPendingAcrossVisible === 1 ? "" : "s"} across current filters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToPrevPending}
                  disabled={prevPendingIndex == null}
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous pending
                </button>
                <button
                  type="button"
                  onClick={goToNextPending}
                  disabled={nextPendingIndex == null}
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next pending
                </button>
                <button
                  type="button"
                  onClick={() => navigateToIndex(Math.max(activeIndex - 1, 0))}
                  disabled={activeIndex === 0}
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => navigateToIndex(Math.min(activeIndex + 1, visibleEntries.length - 1))}
                  disabled={activeIndex >= visibleEntries.length - 1}
                  className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-[11px] text-secondary">
                <input
                  type="checkbox"
                  checked={autoAdvanceEnabled}
                  onChange={(e) => setAutoAdvanceEnabled(e.target.checked)}
                />
                Auto-advance when an entry reaches 0 pending
              </label>
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
        )}

        {focusReviewMode !== "swipe" && totalPendingAcrossVisible === 0 && (
          <div className="relative overflow-hidden rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-xs text-accent-green">
            <div className="pointer-events-none absolute -top-8 right-6 h-16 w-16 rounded-full bg-accent-green/15 blur-2xl" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">Queue complete</p>
            <p className="mt-1 text-sm font-semibold text-primary">
              Every suggestion in this filtered queue has been reviewed.
            </p>
            <p className="mt-1 text-xs text-secondary">
              Strong finish. You can switch filters for another pass or move to list mode for final cleanup.
            </p>
          </div>
        )}

        {focusReviewMode === "swipe" ? (
          <div className="fixed inset-0 z-[70] overflow-y-auto">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-md"
              onClick={onRequestExitSwipeMode ?? undefined}
              aria-hidden
            />
            <div className="relative z-[71] flex min-h-full items-start justify-center p-4 md:p-6">
              <article
                role="dialog"
                aria-modal="true"
                aria-label="Swipe spotlight review"
                className="my-2 w-full max-w-2xl rounded-2xl border border-subtle bg-surface-2/95 p-4 shadow-2xl md:my-4 md:p-5"
              >
                <div
                  key={`${activeEntry.id}:${activeSpotlightSuggestion?.suggestion_id ?? "none"}:${navigationDirection}`}
                  className={
                    navigationDirection === "next"
                      ? "animate-entry-in-next"
                      : "animate-entry-in-prev"
                  }
                >
                  {!(totalPendingAcrossVisible === 0 && !activeSpotlightSuggestion) && (
                    <header className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                            Swipe Spotlight
                          </p>
                          <h3 className="text-small font-semibold text-primary">{activeEntry.title}</h3>
                          <p className="text-[11px] text-muted">
                            Entry {activeIndex + 1}/{visibleEntries.length} · Suggestion{" "}
                            {Math.min(totalSuggestions - pendingSuggestions + 1, totalSuggestions)}/{totalSuggestions}
                          </p>
                        </div>
                        {onRequestExitSwipeMode && (
                          <button
                            type="button"
                            onClick={onRequestExitSwipeMode}
                            className="btn-secondary text-[11px]"
                            title="Shortcut: Esc"
                          >
                            Exit (Esc)
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-secondary">
                        {activeEntryPending} pending on this entry · {totalPendingAcrossVisible} pending in queue
                      </p>
                    </header>
                  )}

                  {activeSpotlightSuggestion ? (
                    <div className="mt-4 space-y-2.5">
                      <div className="relative min-h-[200px]">
                        <div
                          className="pointer-events-none absolute inset-x-2 top-2 rounded-2xl border border-subtle bg-surface-1/80 p-4"
                          style={stackedCardStyle}
                          aria-hidden
                        >
                          {nextSpotlightSuggestion ? (
                            <div className="space-y-2">
                              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                                Up next
                              </p>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-semibold text-primary">
                                    {nextSpotlightSuggestion.key_skill_title}
                                  </p>
                                  <p className="text-[11px] text-muted">
                                    CiP {nextSpotlightSuggestion.cip_number} ·{" "}
                                    {nextSpotlightSuggestion.source === "cross_cip"
                                      ? "Cross-CiP"
                                      : "Linked"}
                                  </p>
                                </div>
                                <span className="rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-secondary">
                                  {nextSpotlightSuggestion.confidence >= 0.8
                                    ? "High"
                                    : nextSpotlightSuggestion.confidence >= 0.7
                                      ? "Medium"
                                      : "Low"}{" "}
                                  {Math.round(nextSpotlightSuggestion.confidence * 100)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted">No more pending suggestions after this one.</p>
                          )}
                        </div>

                        <div
                          className={`relative touch-pan-y rounded-2xl border p-4 shadow-sm ${swipeTintClass}`}
                          style={swipeTiltStyle}
                          onPointerDown={handleSpotlightPointerDown}
                          onPointerMove={handleSpotlightPointerMove}
                          onPointerUp={finishSpotlightSwipe}
                          onPointerCancel={finishSpotlightSwipe}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-primary">
                                  {activeSpotlightSuggestion.key_skill_title}
                                </p>
                                <p className="text-[11px] text-muted">
                                  CiP {activeSpotlightSuggestion.cip_number} ·{" "}
                                  {activeSpotlightSuggestion.source === "cross_cip"
                                    ? "Cross-CiP"
                                    : "Linked"}
                                </p>
                              </div>
                              <span className="rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-secondary">
                                {activeSpotlightSuggestion.confidence >= 0.8
                                  ? "High"
                                  : activeSpotlightSuggestion.confidence >= 0.7
                                    ? "Medium"
                                    : "Low"}{" "}
                                {Math.round(activeSpotlightSuggestion.confidence * 100)}%
                              </span>
                            </div>
                            {activeSpotlightSuggestion.rationale && (
                              <p className="text-[12px] leading-relaxed text-secondary">
                                {activeSpotlightSuggestion.rationale}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted">
                          Swipe left to reject, right to confirm.
                        </p>
                        {nextSpotlightSuggestion ? (
                          <p className="text-[11px] text-secondary">
                            Up next: {nextSpotlightSuggestion.key_skill_title}
                          </p>
                        ) : (
                          <p className="text-[11px] text-secondary">Last suggestion for this entry.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => commitSpotlightDecision("rejected")}
                          disabled={quickActionDisabled}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: Left Arrow"
                        >
                          Reject (Left Arrow)
                        </button>
                        <button
                          type="button"
                          onClick={() => commitSpotlightDecision("confirmed")}
                          disabled={quickActionDisabled}
                          className="btn-primary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: Right Arrow"
                        >
                          Confirm (Right Arrow)
                        </button>
                        <button
                          type="button"
                          onClick={goToNextPending}
                          disabled={nextPendingIndex == null}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: N"
                        >
                          Next pending (N)
                        </button>
                        <button
                          type="button"
                          onClick={onUndoLastAction ?? undefined}
                          disabled={!canUndoLastAction || !onUndoLastAction}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: U"
                        >
                          Undo (U)
                        </button>
                      </div>

                      <details className="rounded-xl border border-subtle bg-surface-1 p-3">
                        <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                          View full entry text
                        </summary>
                        <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                          <p className="text-[11px] leading-relaxed text-secondary">
                            {activeEntry.raw_text}
                          </p>
                        </div>
                      </details>
                    </div>
                  ) : totalPendingAcrossVisible === 0 ? (
                    <div className="relative overflow-hidden rounded-2xl border border-accent-green/45 bg-accent-green/10 p-5 animate-fade-up">
                      <div className="pointer-events-none absolute -top-10 -right-6 h-24 w-24 rounded-full bg-accent-green/18 blur-2xl" aria-hidden />
                      <div className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-accent-blue/15 blur-2xl" aria-hidden />
                      <div className="pointer-events-none absolute right-5 top-4 flex items-center gap-1" aria-hidden>
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-dot" />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse-dot [animation-delay:140ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-amber animate-pulse-dot [animation-delay:280ms]" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-green">
                        Milestone reached
                      </p>
                      <p className="mt-1 text-base font-semibold text-primary">
                        You reviewed every pending suggestion.
                      </p>
                      <p className="mt-1 text-xs text-secondary">
                        Queue complete. Great work keeping your portfolio evidence clean and current.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {onRequestExitSwipeMode && (
                          <button
                            type="button"
                            onClick={onRequestExitSwipeMode}
                            className="btn-primary text-[11px]"
                          >
                            Finish spotlight
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onUndoLastAction ?? undefined}
                          disabled={!canUndoLastAction || !onUndoLastAction}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: U"
                        >
                          Undo last action
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-xs text-secondary">
                      No pending suggestions on this entry. Use Next pending to continue.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </div>
        ) : (
          <div
            key={`${activeEntry.id}:${navigationDirection}`}
            className={
              navigationDirection === "next"
                ? "animate-entry-in-next"
                : "animate-entry-in-prev"
            }
          >
            <ReviewCard
              entry={activeEntry}
              onUpdateSuggestion={updateSuggestionWithAutoAdvance}
              disabled={disabled}
              expandedByDefault
              highlightSkillId={cardFocusProps(activeEntry.id).highlightSkillId}
              highlightDescriptorId={cardFocusProps(activeEntry.id).highlightDescriptorId}
              descriptorPanelInitialOpen={cardFocusProps(activeEntry.id).descriptorPanelInitialOpen}
              suggestedOnly
            />
          </div>
        )}
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
