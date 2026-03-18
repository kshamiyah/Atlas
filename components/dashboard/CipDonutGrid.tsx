"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";

const D_SIZE = 64;
const D_CENTER = 32;
const D_RADIUS = 22;
const D_STROKE = 5;
const D_CIRCUMFERENCE = 2 * Math.PI * D_RADIUS;

function cipColor(pct: number): string {
  if (pct === 0) return "var(--surface-4)";
  if (pct < 50) return "var(--accent-amber)";
  if (pct < 80) return "var(--accent-blue)";
  return "var(--accent-green)";
}

function cipTextColor(pct: number): string {
  if (pct === 0) return "text-muted";
  if (pct < 50) return "text-accent-amber";
  if (pct < 80) return "text-accent-blue";
  return "text-accent-green";
}

function Donut({
  cip,
  index,
}: {
  cip: GapReportCip;
  index: number;
}) {
  const pct = cip.coverage_pct;
  const [offset, setOffset] = useState(D_CIRCUMFERENCE);

  useEffect(() => {
    const target = D_CIRCUMFERENCE * (1 - pct / 100);
    const delay = index * 60;
    const timer = setTimeout(() => {
      requestAnimationFrame(() => setOffset(target));
    }, delay);
    return () => clearTimeout(timer);
  }, [pct, index]);

  const color = cipColor(pct);
  const textColor = cipTextColor(pct);

  return (
    <div
      className="group flex flex-col items-center gap-1.5"
      title={`${cip.cip_title} — ${cip.confirmed_skills} of ${cip.total_skills} key skills confirmed (${pct}%)`}
    >
      {/* Donut */}
      <div className="relative transition-transform duration-150 group-hover:scale-110">
        <svg
          viewBox={`0 0 ${D_SIZE} ${D_SIZE}`}
          width={D_SIZE}
          height={D_SIZE}
        >
          {/* Track */}
          <circle
            cx={D_CENTER} cy={D_CENTER} r={D_RADIUS}
            fill="none"
            stroke="var(--surface-4)"
            strokeWidth={D_STROKE}
          />
          {/* Progress */}
          <circle
            cx={D_CENTER} cy={D_CENTER} r={D_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={D_STROKE}
            strokeLinecap="round"
            strokeDasharray={D_CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${D_CENTER} ${D_CENTER})`}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
          {/* Inner white fill */}
          <circle
            cx={D_CENTER} cy={D_CENTER} r={D_RADIUS - D_STROKE / 2 - 1}
            fill="var(--surface-2)"
          />
        </svg>

        {/* Center: confirmed/total */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[10px] font-bold tabular-nums leading-none ${textColor}`}>
            {cip.confirmed_skills}/{cip.total_skills}
          </span>
        </div>
      </div>

      {/* Label */}
      <span className="text-[10px] font-medium text-muted tabular-nums">
        CiP {Number(cip.cip_number)}
      </span>
    </div>
  );
}

type Props = {
  cips: GapReportCip[];
  isLoading: boolean;
};

export function CipDonutGrid({ cips, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-x-4 gap-y-5 sm:grid-cols-7 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-16 w-16 animate-pulse rounded-full bg-surface-3" />
            <div className="h-2 w-8 animate-pulse rounded bg-surface-3" />
          </div>
        ))}
      </div>
    );
  }

  if (cips.length === 0) return null;

  return (
    <div className="grid grid-cols-5 gap-x-4 gap-y-5 sm:grid-cols-7 lg:grid-cols-9">
      {cips.map((cip, i) => (
        <Donut key={cip.cip_number} cip={cip} index={i} />
      ))}
    </div>
  );
}
