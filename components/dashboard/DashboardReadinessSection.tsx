"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";
import { ARCPReadinessHero } from "./ARCPReadinessHero";
import { PriorityActionStrip } from "./PriorityActionStrip";
import { DashboardStatsRow } from "./DashboardStatsRow";
import { TrafficLightCard } from "./TrafficLightCard";
import Link from "next/link";

type ArcpReadiness = {
  mode: "on_track" | "predicted_outcome";
  portfolio_pct: number;
  predicted_outcome: 1 | 2 | 3 | 5;
  blockers: string[];
  pillars: {
    key_skills: { pct: number };
    osats: { pct: number };
    courses: { pct: number };
    exams: { pct: number };
  };
  is_waypoint: boolean;
  current_stage: string | null;
  has_es_levels: boolean;
};

const STAGE_TABS = [
  { label: "All", sub: null, value: null },
  { label: "Stage 1", sub: "ST1–3", value: "Stage One" },
  { label: "Stage 2", sub: "ST4–5", value: "Stage Two" },
  { label: "Stage 3", sub: "ST6–7", value: "Stage Three" },
] as const;

type Props = {
  totalEntries: number;
  daysToArcp: number | null;
  arcpDate: string | null;
};

export function DashboardReadinessSection({
  totalEntries,
  daysToArcp,
  arcpDate,
}: Props) {
  const [selectedStageGroup, setSelectedStageGroup] = useState<string | null>(
    null,
  );
  const [cips, setCips] = useState<GapReportCip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readiness, setReadiness] = useState<ArcpReadiness | null>(null);

  useEffect(() => {
    fetch("/api/arcp-readiness")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setReadiness(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const url = selectedStageGroup
      ? `/api/gap-report?stage_group=${encodeURIComponent(selectedStageGroup)}`
      : "/api/gap-report";

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setCips((data?.cips as GapReportCip[]) ?? []);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedStageGroup]);

  const confirmedSkills = cips.reduce((s, c) => s + c.confirmed_skills, 0);
  const cipsInProgress = cips.filter(
    (c) => c.confirmed_skills > 0 && c.coverage_pct < 100,
  ).length;
  const totalCips = cips.length;

  return (
    <div className="flex flex-col gap-6">
      <DashboardStatsRow
        totalEntries={totalEntries}
        confirmedSkills={confirmedSkills}
        cipsInProgress={cipsInProgress}
        totalCips={totalCips}
        daysToArcp={daysToArcp}
        arcpDate={arcpDate}
        isLoading={isLoading}
      />

      <TrafficLightCard cips={cips} isLoading={isLoading} />

      {readiness && (
        <section className="card overflow-hidden">
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-subtle"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-small font-semibold text-primary" style={{ letterSpacing: "-0.014em" }}>
                ARCP Prediction
              </h2>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--surface-3)",
                  color: "var(--text-muted)",
                }}
              >
                {readiness.mode === "predicted_outcome"
                  ? `Based on ES assessments${readiness.current_stage ? ` · ${readiness.current_stage}` : ""}`
                  : `Evidence signals only${readiness.current_stage ? ` · ${readiness.current_stage}` : ""}`}
              </span>
              {readiness.is_waypoint && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(245,158,11,0.15)", color: "var(--accent-amber)" }}
                >
                  Waypoint year
                </span>
              )}
            </div>
            <Link
              href="/dashboard/requirements"
              className="text-[12px] font-medium"
              style={{ color: "var(--accent-blue)" }}
            >
              View requirements →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: "var(--border-subtle)" }}>
            {/* Portfolio % */}
            <div className="flex flex-col items-center justify-center gap-1 px-5 py-5">
              <span
                className="font-bold tabular-nums leading-none"
                style={{ fontSize: "3rem", letterSpacing: "-0.03em", color: "var(--text-primary)" }}
              >
                {readiness.portfolio_pct}%
              </span>
              <span className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                Portfolio complete
              </span>
            </div>

            {/* Predicted outcome */}
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-5">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl font-bold text-[1.4rem]"
                style={{
                  background:
                    readiness.predicted_outcome === 1 ? "rgba(22,163,74,0.14)" :
                    readiness.predicted_outcome === 2 ? "rgba(245,158,11,0.14)" :
                    readiness.predicted_outcome === 3 ? "rgba(220,38,38,0.14)" :
                    "rgba(100,116,139,0.14)",
                  color:
                    readiness.predicted_outcome === 1 ? "var(--accent-green)" :
                    readiness.predicted_outcome === 2 ? "var(--accent-amber)" :
                    readiness.predicted_outcome === 3 ? "var(--accent-red)" :
                    "var(--text-muted)",
                }}
              >
                {readiness.predicted_outcome}
              </div>
              <div className="text-center">
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {readiness.predicted_outcome === 1 && "Predicted Outcome 1"}
                  {readiness.predicted_outcome === 2 && "Predicted Outcome 2"}
                  {readiness.predicted_outcome === 3 && "Predicted Outcome 3"}
                  {readiness.predicted_outcome === 5 && "Outcome 5 Risk"}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {readiness.predicted_outcome === 1 && "Satisfactory progress"}
                  {readiness.predicted_outcome === 2 && "Specific competencies needed"}
                  {readiness.predicted_outcome === 3 && "Additional training time"}
                  {readiness.predicted_outcome === 5 && "Incomplete evidence"}
                </p>
              </div>
            </div>

            {/* Pillar bars */}
            <div className="col-span-1 lg:col-span-2 flex flex-col justify-center gap-2.5 px-5 py-5">
              {[
                { label: "Key Skills", pct: readiness.pillars.key_skills.pct, weight: "50%" },
                { label: "Summative OSATS", pct: readiness.pillars.osats.pct, weight: "30%" },
                { label: "Courses", pct: readiness.pillars.courses.pct, weight: "15%" },
                { label: "Exams", pct: readiness.pillars.exams.pct, weight: "5%" },
              ].map((pillar) => (
                <div key={pillar.label} className="flex items-center gap-2.5">
                  <span className="w-28 shrink-0 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {pillar.label}
                  </span>
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-4)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pillar.pct}%`,
                        background:
                          pillar.pct === 100 ? "var(--accent-green)" :
                          pillar.pct >= 60 ? "var(--accent-blue)" :
                          "var(--accent-amber)",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {pillar.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {readiness.blockers.length > 0 && (
            <div
              className="px-5 py-3 border-t border-subtle"
              style={{ background: "var(--surface-1)" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                To reach Outcome 1
              </p>
              <ul className="space-y-1">
                {readiness.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--accent-amber)" }}>·</span>
                    {b}
                  </li>
                ))}
              </ul>
              {!readiness.has_es_levels && (
                <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Prediction based on evidence signals only. Request your CiP assessments from your Educational Supervisor for a more accurate outcome.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-6 md:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-4">
            <h2
              className="text-small font-semibold text-primary"
              style={{ letterSpacing: "-0.014em" }}
            >
              ARCP Readiness
            </h2>
            <div className="inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
              {STAGE_TABS.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => {
                    setIsLoading(true);
                    setSelectedStageGroup(tab.value);
                  }}
                  className={[
                    "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150",
                    selectedStageGroup === tab.value
                      ? "bg-surface-1 text-primary shadow-sm ring-1 ring-subtle"
                      : "text-muted hover:text-secondary",
                  ].join(" ")}
                >
                  {tab.label}
                  {tab.sub && (
                    <span className="ml-1 opacity-40 text-[10px]">
                      {tab.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <ARCPReadinessHero cips={cips} isLoading={isLoading} />
        </section>

        <PriorityActionStrip cips={cips} isLoading={isLoading} />
      </div>
    </div>
  );
}
