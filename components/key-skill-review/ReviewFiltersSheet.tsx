"use client";

import { useEffect, useState, type ReactNode } from "react";

type ReviewFiltersSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onClearAll: () => void;
  activeFilterCount: number;
  children: ReactNode;
};

export function ReviewFiltersSheet({
  isOpen,
  onClose,
  onClearAll,
  activeFilterCount,
  children,
}: ReviewFiltersSheetProps) {
  const [rendered, setRendered] = useState(isOpen);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      const id = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(id);
    }

    setShown(false);
    const timer = window.setTimeout(() => setRendered(false), 240);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!rendered) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;

  return (
    <div
      className="fixed inset-0 z-[60] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Search and filters"
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close filters"
        onClick={onClose}
      />

      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-2xl border border-subtle bg-surface-2 shadow-2xl transition-transform duration-200 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-surface-4" aria-hidden />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
          <div>
            <h2 className="text-small font-semibold text-primary">Search & filters</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
                : "Narrow which entries and suggestions appear in the queue."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary transition hover:bg-surface-3 hover:text-primary"
            aria-label="Close filters"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">{children}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-subtle bg-surface-2/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            onClick={onClearAll}
            disabled={activeFilterCount === 0}
            className="btn-secondary flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear all
          </button>
          <button type="button" onClick={onClose} className="btn-primary flex-1 text-xs">
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}
