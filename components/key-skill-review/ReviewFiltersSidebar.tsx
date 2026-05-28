"use client";

import type { ReactNode } from "react";
import {
  ReviewActiveFilterChips,
  type ActiveFilterChip,
} from "@/components/key-skill-review/ReviewActiveFilterChips";

type ReviewFiltersSidebarProps = {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  activeFilterCount: number;
  chips: ActiveFilterChip[];
  onClearAll: () => void;
  queuePending: number;
  queueFailed: number;
  children: ReactNode;
  batchActions?: ReactNode;
};

export function ReviewFiltersSidebar({
  isCollapsed,
  onToggleCollapsed,
  activeFilterCount,
  chips,
  onClearAll,
  queuePending,
  queueFailed,
  children,
  batchActions,
}: ReviewFiltersSidebarProps) {
  if (isCollapsed) {
    return (
      <aside className="hidden lg:sticky lg:top-5 lg:block lg:self-start">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="group flex w-11 flex-col items-center gap-2 rounded-xl border border-subtle bg-surface-2 px-2 py-3 shadow-sm transition hover:border-accent-blue/30 hover:bg-surface-1"
          aria-label={
            activeFilterCount > 0
              ? `Show filters, ${activeFilterCount} active`
              : "Show filters"
          }
          title="Show filters"
        >
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-1 text-secondary transition group-hover:text-accent-blue">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-blue px-1 text-[9px] font-semibold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </span>
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted [writing-mode:vertical-rl] rotate-180"
          >
            Filters
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block lg:max-h-[calc(100vh-2rem)] lg:w-[320px] lg:self-start">
      <div className="card flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden">
        <div className="shrink-0 border-b border-subtle px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                Search & filters
              </p>
              <h2 className="text-small font-semibold text-primary">Narrow the queue</h2>
              <p className="mt-0.5 text-[11px] text-secondary">
                {activeFilterCount > 0
                  ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"} applied`
                  : "Refine which entries appear in the review queue."}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary transition hover:bg-surface-3 hover:text-primary"
              title="Hide filters"
              aria-label="Hide filters"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          {chips.length > 0 ? (
            <div className="mt-3 border-t border-subtle pt-3">
              <ReviewActiveFilterChips
                chips={chips}
                onClearAll={onClearAll}
                onOpenFilters={() => undefined}
                showEditLink={false}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-5">{children}</div>

          {batchActions ? (
            <details className="mt-5 rounded-xl border border-subtle bg-surface-1 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-primary">
                Batch actions
              </summary>
              <div className="mt-3 space-y-3">{batchActions}</div>
            </details>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-subtle bg-surface-1/80 px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted">
              Kaizen queue:{" "}
              <span className="font-medium text-secondary">{queuePending} pending</span>
              {queueFailed > 0 ? (
                <>
                  {" "}
                  · <span className="font-medium text-accent-amber">{queueFailed} failed</span>
                </>
              ) : null}
            </p>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[10px] font-medium text-accent-blue hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
