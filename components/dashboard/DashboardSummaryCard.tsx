"use client";

import { useEffect, useMemo, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";
import type { QueueResponse } from "@/lib/types/key-skill-review-api";
import type { ProgressSummaryResponse } from "@/lib/types/progress";
import { buildWriteEntryHref } from "@/lib/generate/query-params";

type DashboardSummaryCardProps = {
  totalEntries: number;
  daysToArcp: number | null;
  currentStageScope?: string | null;
  currentStageGroupLabel?: string | null;
};

type SummaryState = {
  cips: GapReportCip[];
  pendingSuggestionCount: number;
  progress: ProgressSummaryResponse | null;
  loading: boolean;
};

type SummaryAction = {
  eyebrow: string;
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

function buildSummaryAction(
  cips: GapReportCip[],
  pendingSuggestionCount: number,
): SummaryAction {
  const normalized = cips.map((cip) => ({
    ...cip,
    coverage_pct: Math.round(Math.min(100, Math.max(0, cip.coverage_pct))),
  }));
  const sorted = [...normalized].sort((a, b) => a.coverage_pct - b.coverage_pct);

  const notStarted = sorted.filter((cip) => cip.coverage_pct === 0);
  if (notStarted.length > 0) {
    const first = notStarted[0];
    return {
      eyebrow: "What needs attention now",
      title: `Start with CiP ${first.cip_number}`,
      body: `${first.cip_title} has no confirmed key skills yet. It’s the fastest place to improve your portfolio signal.`,
      primaryHref: "/dashboard/key-skill-review",
      primaryLabel: "Review what Atlas found",
      secondaryHref: buildWriteEntryHref({ cip: first.cip_number }),
      secondaryLabel: "Write an entry",
    };
  }

  const belowHalf = sorted.filter((cip) => cip.coverage_pct > 0 && cip.coverage_pct < 50);
  if (belowHalf.length > 0) {
    const first = belowHalf[0];
    return {
      eyebrow: "What needs attention now",
      title: `Lift CiP ${first.cip_number} above 50%`,
      body: `${first.cip_title} is currently ${first.coverage_pct}% covered. A few confirmed reviews here will move the picture quickly.`,
      primaryHref: "/dashboard/key-skill-review",
      primaryLabel: "Review Skills",
      secondaryHref: "/dashboard/progress?tab=cips",
      secondaryLabel: "Open Progress Hub",
    };
  }

  if (pendingSuggestionCount > 0) {
    return {
      eyebrow: "What needs attention now",
      title: `${pendingSuggestionCount} skill suggestion${pendingSuggestionCount === 1 ? "" : "s"} waiting`,
      body: "Confirm or reject Atlas suggestions to sharpen your coverage picture before your next review.",
      primaryHref: "/dashboard/key-skill-review",
      primaryLabel: "Review Skills",
      secondaryHref: "/dashboard/progress",
      secondaryLabel: "Open Progress Hub",
    };
  }

  return {
    eyebrow: "Looking good",
    title: "Your portfolio is in a steady state",
    body: "There are no obvious urgent gaps right now. Use Progress Hub for a deeper curriculum view or generate a new entry while the context is fresh.",
    primaryHref: "/dashboard/progress",
    primaryLabel: "Open Progress Hub",
      secondaryHref: buildWriteEntryHref({ cip: sorted[0]?.cip_number }),
      secondaryLabel: "Write an entry",
  };
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-primary">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-muted">{detail}</p>
    </div>
  );
}

export function DashboardSummaryCard({
  totalEntries,
  daysToArcp,
  currentStageScope = null,
  currentStageGroupLabel = null,
}: DashboardSummaryCardProps) {
  const [state, setState] = useState<SummaryState>({
    cips: [],
    pendingSuggestionCount: 0,
    progress: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    const progressUrl = currentStageScope
      ? `/api/progress/summary?stage_scope=${encodeURIComponent(currentStageScope)}`
      : "/api/progress/summary";
    const gapReportUrl = currentStageScope
      ? `/api/gap-report?stage_scope=${encodeURIComponent(currentStageScope)}`
      : "/api/gap-report";

    Promise.all([
      fetch(gapReportUrl, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/key-skill-review/queue", { cache: "no-store" }).then(
        (r) => r.json() as Promise<QueueResponse>,
      ),
      fetch(progressUrl, { cache: "no-store" })
        .then(async (r) => {
          const text = await r.text();
          return text ? (JSON.parse(text) as ProgressSummaryResponse) : null;
        })
        .catch(() => null),
    ])
      .then(([gapData, queueData, progressData]) => {
        if (!active) return;

        const entries = Array.isArray(queueData?.entries) ? queueData.entries : [];
        let pending = 0;
        for (const entry of entries) {
          for (const suggestion of entry.linked_cip_suggestions ?? []) {
            if (suggestion.status === "suggested" && suggestion.suggestion_id) pending += 1;
          }
          for (const suggestion of entry.cross_cip_suggestions ?? []) {
            if (suggestion.status === "suggested" && suggestion.suggestion_id) pending += 1;
          }
        }

        setState({
          cips: (gapData?.cips as GapReportCip[]) ?? [],
          pendingSuggestionCount: pending,
          progress: progressData,
          loading: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setState((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      active = false;
    };
  }, [currentStageScope]);

  const action = useMemo(
    () => buildSummaryAction(state.cips, state.pendingSuggestionCount),
    [state.cips, state.pendingSuggestionCount],
  );

  const metrics = useMemo(() => {
    const kpis = state.progress?.kpis;
    return [
      {
        label: "Key skills",
        value: kpis ? `${Math.round(kpis.key_skills.pct)}%` : "—",
        detail: kpis ? `${kpis.key_skills.covered}/${kpis.key_skills.total} confirmed` : "Loading",
      },
      {
        label: "CiPs complete",
        value: kpis ? `${Math.round(kpis.cips.pct)}%` : "—",
        detail: kpis ? `${kpis.cips.covered}/${kpis.cips.total} complete` : "Loading",
      },
      {
        label: "Entries",
        value: String(totalEntries),
        detail: "Synced from Kaizen",
      },
      {
        label: "ARCP",
        value:
          daysToArcp === null
            ? "—"
            : daysToArcp > 0
              ? `${daysToArcp}d`
              : "Past",
        detail:
          daysToArcp === null
            ? "Set your ARCP date"
            : daysToArcp > 0
              ? "Days remaining"
              : "Review your timeline",
      },
    ];
  }, [daysToArcp, state.progress, totalEntries]);

  if (state.loading) {
    return (
      <section className="card overflow-hidden rounded-lg p-5 shadow-none md:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded bg-surface-3" />
            <div className="h-10 w-4/5 animate-pulse rounded bg-surface-3" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-3" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-lg bg-surface-3" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden rounded-lg p-5 shadow-none md:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-center">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {action.eyebrow}
          </p>
          {currentStageGroupLabel ? (
            <p className="text-[12px] text-muted">
              Curriculum scope: <span className="font-medium text-secondary">{currentStageGroupLabel}</span>
            </p>
          ) : null}
          <div className="space-y-2">
            <h2 className="max-w-2xl text-2xl font-semibold text-primary">
              {action.title}
            </h2>
            <p className="max-w-2xl text-[14px] leading-6 text-secondary">
              {action.body}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <a href={action.primaryHref} className="btn-primary px-4 py-2 text-small">
              {action.primaryLabel}
            </a>
            <a href={action.secondaryHref} className="btn-secondary px-4 py-2 text-small">
              {action.secondaryLabel}
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 self-start">
          {metrics.map((metric) => (
            <SummaryMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
