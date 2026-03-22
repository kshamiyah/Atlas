"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";

type Props = {
  cips: GapReportCip[];
  isLoading: boolean;
};

export function ARCPReadinessHero({ cips, isLoading }: Props) {
  const total = cips.reduce((sum, cip) => sum + cip.total_skills, 0);
  const confirmed = cips.reduce((sum, cip) => sum + cip.confirmed_skills, 0);
  const pct = total === 0 ? 0 : Math.round((confirmed / total) * 100);

  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimatedPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const barColor =
    pct >= 70
      ? "var(--accent-green)"
      : pct >= 40
        ? "var(--accent-amber)"
        : "var(--accent-red)";

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-5">
        <div className="flex items-end gap-3">
          <div className="h-[4.5rem] w-28 animate-pulse rounded-xl bg-surface-3" />
          <div className="pb-2 flex flex-col gap-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-3" />
          </div>
        </div>
        <div className="h-2 w-full animate-pulse rounded-full bg-surface-3" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-end gap-4">
        <span
          className="font-bold tabular-nums leading-none tracking-tight text-primary"
          style={{ fontSize: "4.75rem", letterSpacing: "-0.032em" }}
        >
          {pct}%
        </span>
        <div className="pb-2 flex flex-col gap-0.5">
          <span className="text-small font-semibold text-primary">
            ARCP ready
          </span>
          <span className="text-micro text-muted">
            {confirmed} of {total} key skills confirmed
          </span>
        </div>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-4)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${animatedPct}%`,
            background: barColor,
            transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {confirmed < total && total > 0 && (
        <a
          href="/dashboard/key-skill-review"
          className="inline-flex items-center gap-1 text-small font-medium hover:underline underline-offset-2"
          style={{ color: "var(--accent-blue)" }}
        >
          Review {total - confirmed} unconfirmed skill
          {total - confirmed !== 1 ? "s" : ""}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      )}
      {confirmed === total && total > 0 && (
        <p
          className="inline-flex items-center gap-1 text-small font-medium"
          style={{ color: "var(--accent-green)" }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          All key skills confirmed
        </p>
      )}
    </div>
  );
}
