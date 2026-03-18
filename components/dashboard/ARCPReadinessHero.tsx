"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";

const RING_SIZE = 200;
const CENTER = 100;
const RADIUS = 80;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  cips: GapReportCip[];
  isLoading: boolean;
};

export function ARCPReadinessHero({ cips, isLoading }: Props) {
  const total = cips.reduce((sum, cip) => sum + cip.total_skills, 0);
  const confirmed = cips.reduce((sum, cip) => sum + cip.confirmed_skills, 0);
  const pct = total === 0 ? 0 : Math.round((confirmed / total) * 100);

  const [animatedOffset, setAnimatedOffset] = useState<number>(CIRCUMFERENCE);

  useEffect(() => {
    const targetOffset = CIRCUMFERENCE * (1 - pct / 100);
    const id = requestAnimationFrame(() => setAnimatedOffset(targetOffset));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* SVG ring */}
      <div className="relative h-[200px] w-[200px] shrink-0">
        <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} width={RING_SIZE} height={RING_SIZE}>
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none"
            stroke="var(--surface-4)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none"
            stroke="var(--accent-green)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={animatedOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tracking-tight tabular-nums ${isLoading ? "text-muted" : "text-primary"}`}>
            {pct}%
          </span>
          <span className="mt-0.5 text-micro text-muted">ARCP ready</span>
        </div>
      </div>

      {/* Sub-stat */}
      <p className="text-small text-secondary text-center">
        {confirmed} of {total} key skills confirmed
      </p>
      {confirmed < total && total > 0 && (
        <a
          href="/dashboard/key-skill-review"
          className="inline-flex items-center gap-1 text-micro font-medium text-accent-green hover:underline"
        >
          Review {total - confirmed} unconfirmed skill{total - confirmed !== 1 ? "s" : ""}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      )}
      {confirmed === total && total > 0 && (
        <p className="inline-flex items-center gap-1 text-micro font-medium text-accent-green">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          All key skills confirmed
        </p>
      )}
    </div>
  );
}
