"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";
import { ARCPReadinessHero } from "./ARCPReadinessHero";
import { CipDonutGrid } from "./CipDonutGrid";
import { TrafficLightCard } from "./TrafficLightCard";
import { PriorityActionStrip } from "./PriorityActionStrip";
import { DashboardStatsRow } from "./DashboardStatsRow";

type StageTab = {
  label: string;
  sub: string | null;
  value: string | null;
};

const STAGE_TABS: StageTab[] = [
  { label: "All", sub: null, value: null },
  { label: "Stage 1", sub: "ST1–ST3", value: "Stage One" },
  { label: "Stage 2", sub: "ST4–ST5", value: "Stage Two" },
  { label: "Stage 3", sub: "ST6–ST7", value: "Stage Three" },
];

type Props = {
  totalEntries: number;
  entriesThisWeek: number;
};

export function DashboardReadinessSection({ totalEntries, entriesThisWeek }: Props) {
  const [selectedStageGroup, setSelectedStageGroup] = useState<string | null>(null);
  const [cips, setCips] = useState<GapReportCip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const url = selectedStageGroup
      ? `/api/gap-report?stage_group=${encodeURIComponent(selectedStageGroup)}`
      : "/api/gap-report";

    fetch(url)
      .then((r) => r.json())
      .then((data) => setCips((data?.cips as GapReportCip[]) ?? []))
      .finally(() => setIsLoading(false));
  }, [selectedStageGroup]);

  // Derived stats for DashboardStatsRow
  const confirmedSkills = cips.reduce((s, c) => s + c.confirmed_skills, 0);
  const cipsInProgress = cips.filter(
    (c) => c.confirmed_skills > 0 && c.coverage_pct < 100
  ).length;
  const totalCips = cips.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Stats row */}
      <DashboardStatsRow
        totalEntries={totalEntries}
        confirmedSkills={confirmedSkills}
        cipsInProgress={cipsInProgress}
        totalCips={totalCips}
        entriesThisWeek={entriesThisWeek}
        isLoading={isLoading}
      />

      {/* Traffic light */}
      <TrafficLightCard cips={cips} isLoading={isLoading} />

      {/* Priority actions */}
      <PriorityActionStrip cips={cips} isLoading={isLoading} />

      {/* Readiness section card */}
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-small font-semibold text-primary">ARCP Readiness</h2>
          {/* Stage filter pills */}
          <div className="inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
            {STAGE_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setSelectedStageGroup(tab.value)}
                className={[
                  "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150",
                  selectedStageGroup === tab.value
                    ? "bg-surface-1 text-primary shadow-sm"
                    : "text-muted hover:text-secondary",
                ].join(" ")}
              >
                {tab.label}
                {tab.sub && (
                  <span className="ml-1 opacity-40 text-[10px]">{tab.sub}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
          {/* Ring */}
          <div className="shrink-0">
            <ARCPReadinessHero cips={cips} isLoading={isLoading} />
          </div>

          {/* Donut grid */}
          <div className="flex-1">
            <p className="mb-3 text-micro font-semibold uppercase tracking-wider text-muted">
              CiP Coverage
            </p>
            <CipDonutGrid cips={cips} isLoading={isLoading} />
          </div>
        </div>
      </section>
    </div>
  );
}
