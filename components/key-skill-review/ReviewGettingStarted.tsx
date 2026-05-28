"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type StepStatus = "complete" | "current" | "upcoming";

type GuideStep = {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  action?: ReactNode;
};

type ReviewGettingStartedProps = {
  entriesCount: number;
  hasAuditData: boolean;
  pendingReviewCount: number;
  reviewedQueuedCount: number;
  syncPendingCount: number;
  syncFailedCount: number;
  onOpenAudit: () => void;
  onSyncToKaizen: () => void;
  canRunAudit: boolean;
  canSyncToKaizen: boolean;
  isAuditing: boolean;
  isSyncing: boolean;
};

function StepIndicator({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-green/35 bg-accent-green/12 text-accent-green">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (status === "current") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-blue/40 bg-accent-blue/12 text-[11px] font-semibold text-accent-blue">
        →
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-2 text-[11px] font-medium text-muted">
      ·
    </span>
  );
}

export function ReviewGettingStarted({
  entriesCount,
  hasAuditData,
  pendingReviewCount,
  reviewedQueuedCount,
  syncPendingCount,
  syncFailedCount,
  onOpenAudit,
  onSyncToKaizen,
  canRunAudit,
  canSyncToKaizen,
  isAuditing,
  isSyncing,
}: ReviewGettingStartedProps) {
  const entriesSynced = entriesCount > 0;
  const reviewComplete = entriesSynced && hasAuditData && pendingReviewCount === 0;
  const syncNeedsAction =
    syncPendingCount > 0 || reviewedQueuedCount > 0 || syncFailedCount > 0;

  const headline = !entriesSynced
    ? "Get started with skill review"
    : !hasAuditData
      ? "Your entries are in — run an audit next"
      : reviewComplete && syncNeedsAction
        ? "Review complete — sync changes to Kaizen"
        : reviewComplete
          ? "You're all caught up on this pass"
          : "Almost ready to review";

  const subhead = !entriesSynced
    ? "Import Kaizen entries with the Atlas extension, then work through the steps below."
    : !hasAuditData
      ? "An audit finds over-linked entries, gaps, and new skill suggestions to review."
      : reviewComplete && syncNeedsAction
        ? "Confirmed changes are queued. Push them back to Kaizen when you're ready."
        : reviewComplete
          ? "Run Kaizen Sync after your next review session, or run Audit again for a fresh pass."
          : "Finish the steps below to open your review queue.";

  const steps: GuideStep[] = [
    {
      id: "sync",
      title: "Sync entries from Kaizen",
      description:
        "Use the Atlas Chrome extension on Kaizen to import your portfolio entries.",
      status: entriesSynced ? "complete" : "current",
      action: !entriesSynced ? (
        <Link href="/dashboard/entries" className="btn-secondary text-xs">
          View synced entries
        </Link>
      ) : (
        <Link href="/dashboard/entries" className="text-[11px] font-medium text-accent-blue hover:underline">
          {entriesCount} {entriesCount === 1 ? "entry" : "entries"} synced
        </Link>
      ),
    },
    {
      id: "audit",
      title: "Run portfolio audit",
      description:
        "Atlas checks skill links on each entry and surfaces suggestions, replacements, and over-cap issues.",
      status: !entriesSynced
        ? "upcoming"
        : hasAuditData
          ? "complete"
          : "current",
      action:
        entriesSynced && !hasAuditData ? (
          <button
            type="button"
            onClick={onOpenAudit}
            disabled={!canRunAudit}
            className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAuditing ? "Auditing..." : "Run audit"}
          </button>
        ) : hasAuditData ? (
          <button
            type="button"
            onClick={onOpenAudit}
            disabled={!canRunAudit}
            className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run audit again
          </button>
        ) : null,
    },
    {
      id: "review",
      title: "Review suggestions",
      description:
        "Work through pending skill links one entry at a time — confirm, reject, or action audit recommendations.",
      status: !hasAuditData
        ? "upcoming"
        : pendingReviewCount > 0
          ? "current"
          : reviewComplete
            ? "complete"
            : "upcoming",
      action:
        hasAuditData && pendingReviewCount === 0 && !reviewComplete ? (
          <p className="text-[11px] text-muted">No pending items right now.</p>
        ) : null,
    },
    {
      id: "push",
      title: "Sync back to Kaizen",
      description:
        "Push confirmed cross-CiP skills and queued link changes to your Kaizen portfolio.",
      status: !reviewComplete
        ? "upcoming"
        : syncNeedsAction
          ? "current"
          : "complete",
      action:
        reviewComplete && syncNeedsAction ? (
          <button
            type="button"
            onClick={onSyncToKaizen}
            disabled={!canSyncToKaizen}
            className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSyncing ? "Syncing..." : "Sync to Kaizen"}
          </button>
        ) : reviewComplete ? (
          <p className="text-[11px] text-muted">Nothing waiting to sync.</p>
        ) : null,
    },
  ];

  return (
    <section className="card overflow-hidden p-0">
      <div className="border-b border-subtle bg-gradient-to-r from-accent-blue/8 via-surface-1 to-surface-1 px-4 py-4 md:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
          Getting started
        </p>
        <h2 className="mt-1 text-lg font-semibold text-primary">{headline}</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-secondary">{subhead}</p>
      </div>

      <ol className="divide-y divide-subtle px-4 py-2 md:px-5">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex gap-3 py-3.5 ${
              step.status === "current" ? "bg-accent-blue/[0.03]" : ""
            }`}
          >
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <StepIndicator status={step.status} />
              {index < steps.length - 1 ? (
                <span
                  className={`mt-1 h-full min-h-6 w-px ${
                    step.status === "complete" ? "bg-accent-green/35" : "bg-subtle"
                  }`}
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-sm font-semibold ${
                    step.status === "upcoming" ? "text-muted" : "text-primary"
                  }`}
                >
                  {step.title}
                </p>
                {step.status === "current" ? (
                  <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-blue">
                    Next step
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] leading-relaxed text-secondary">{step.description}</p>
              {step.action ? <div className="pt-0.5">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
