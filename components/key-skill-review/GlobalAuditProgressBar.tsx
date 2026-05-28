"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AUDIT_PROGRESS_STORAGE_KEY,
  AUDIT_PROGRESS_EVENT,
  clearAuditProgress,
  readAuditProgress,
  type PersistedAuditProgress,
} from "@/lib/key-skill-review/audit-progress";

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function GlobalAuditProgressBar() {
  const [progress, setProgress] = useState<PersistedAuditProgress | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const refresh = () => setProgress(readAuditProgress());
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === AUDIT_PROGRESS_STORAGE_KEY) refresh();
    };

    window.addEventListener(AUDIT_PROGRESS_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUDIT_PROGRESS_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!progress) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    if (!progress) return;
    if (progress.status === "running") return;
    if (nowMs - progress.finished_at_ms > 15000) {
      clearAuditProgress();
    }
  }, [nowMs, progress]);

  const elapsedLabel = useMemo(() => {
    if (!progress) return "00:00";
    const baseMs =
      progress.status === "running" ? nowMs : progress.finished_at_ms;
    return formatElapsed((baseMs - progress.started_at_ms) / 1000);
  }, [nowMs, progress]);

  if (!progress) return null;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";

  return (
    <div
      className={[
        "sticky top-0 z-50 border-b px-3 py-1.5 text-[11px] md:px-5",
        isRunning
          ? "border-[#E5E7EB] bg-[#F8FAFC]/95 text-[#334155]"
          : isCompleted
            ? "border-[#14532D]/20 bg-[#ECFDF3] text-[#166534]"
            : "border-[#7F1D1D]/20 bg-[#FEF2F2] text-[#991B1B]",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#94A3B8]/55 border-t-[#334155]" />
          ) : isCompleted ? (
            <span className="text-[12px] leading-none">✓</span>
          ) : (
            <span className="text-[12px] leading-none">!</span>
          )}
          <p className="truncate font-medium tracking-tight">
            {isRunning
              ? `Audit running in background (${elapsedLabel})`
              : isCompleted
                ? `Audit complete: ${progress.issues_found} issues across ${progress.entries_considered} entries`
                : `Audit failed: ${progress.error_message}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/key-skill-review"
            className={[
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
              isRunning
                ? "border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0]"
                : "border-current/30 text-current hover:bg-current/10",
            ].join(" ")}
          >
            View
          </Link>
          {!isRunning && (
            <button
              type="button"
              onClick={() => {
                clearAuditProgress();
                setProgress(null);
              }}
              className="rounded-full border border-current/30 px-2.5 py-0.5 text-[11px] font-medium transition hover:bg-current/10"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
