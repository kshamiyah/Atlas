"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InlineInfoTip } from "./InlineInfoTip";

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
  ltft_pro_rata?: {
    stage_window: string | null;
    stage_elapsed_fraction: number | null;
    working_percent: number;
    expected_key_skills_by_now: number | null;
    expected_key_skills_threshold: number | null;
    expected_key_skills_pct_by_now: number | null;
    actual_key_skills_confirmed: number;
    delta_to_expected: number | null;
    on_track: boolean | null;
    pillars?: {
      osats: {
        expected_by_now: number | null;
        expected_threshold: number | null;
        expected_pct_by_now: number | null;
        actual_complete: number;
        total: number;
        delta_to_expected: number | null;
        on_track: boolean | null;
      };
      courses: {
        expected_by_now: number | null;
        expected_threshold: number | null;
        expected_pct_by_now: number | null;
        actual_complete: number;
        total: number;
        delta_to_expected: number | null;
        on_track: boolean | null;
      };
      exams: {
        expected_by_now: number | null;
        expected_threshold: number | null;
        expected_pct_by_now: number | null;
        actual_complete: number;
        total: number;
        delta_to_expected: number | null;
        on_track: boolean | null;
      };
    };
  };
  projection?: {
    months_left_wte: number | null;
    days_left_wte: number | null;
    overall_status: "done" | "on_track" | "watch" | "at_risk";
    pillars: {
      key_skills: PillarProjection;
      osats: PillarProjection;
      courses: PillarProjection;
      exams: PillarProjection;
    };
    focus_target: {
      key: string;
      label: string;
      units_per_month: number;
      remaining: number;
      status: "done" | "on_track" | "watch" | "at_risk";
    } | null;
  };
};

type PillarProjection = {
  key: string;
  label: string;
  status: "done" | "on_track" | "watch" | "at_risk";
  complete: number;
  total: number;
  remaining: number;
  required_per_month: number | null;
  capacity_per_month: number;
  eta_wte_days: number | null;
  on_track: boolean;
};

function projectionTone(status: "done" | "on_track" | "watch" | "at_risk") {
  if (status === "done" || status === "on_track") {
    return {
      bg: "rgba(22,163,74,0.12)",
      text: "var(--accent-green)",
      border: "1px solid rgba(22,163,74,0.24)",
      label: status === "done" ? "Done" : "On track",
    };
  }
  if (status === "watch") {
    return {
      bg: "rgba(245,158,11,0.14)",
      text: "var(--accent-amber)",
      border: "1px solid rgba(245,158,11,0.24)",
      label: "Watch",
    };
  }
  return {
    bg: "rgba(220,38,38,0.12)",
    text: "var(--accent-red)",
    border: "1px solid rgba(220,38,38,0.24)",
    label: "At risk",
  };
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

/**
 * ARCP prediction and portfolio-weighted signals from `/api/arcp-readiness` only.
 * Detailed curriculum progress lives in `/dashboard/progress`.
 */
export function DashboardReadinessSection() {
  const [readiness, setReadiness] = useState<ArcpReadiness | null>(null);

  useEffect(() => {
    fetch("/api/arcp-readiness")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setReadiness(d);
      })
      .catch(() => {});
  }, []);

  if (!readiness) {
    return (
      <div className="card overflow-hidden">
        <div className="h-48 animate-pulse bg-surface-3/80" />
      </div>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-4">
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
        <Link href="/dashboard/requirements" className="text-[12px] font-medium" style={{ color: "var(--accent-blue)" }}>
          View requirements →
        </Link>
      </div>

      <div
        className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col items-center justify-center gap-1 px-5 py-5">
          <span
            className="font-bold tabular-nums leading-none"
            style={{ fontSize: "3rem", letterSpacing: "-0.03em", color: "var(--text-primary)" }}
          >
            {formatPercent(readiness.portfolio_pct)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
            Portfolio complete
            <InlineInfoTip text="Weighted portfolio score for your current stage scope: Key Skills 50%, Summative OSATS 30%, Courses 15%, Exams 5%." />
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 px-5 py-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl font-bold text-[1.4rem]"
            style={{
              background:
                readiness.predicted_outcome === 1
                  ? "rgba(22,163,74,0.14)"
                  : readiness.predicted_outcome === 2
                    ? "rgba(245,158,11,0.14)"
                    : readiness.predicted_outcome === 3
                      ? "rgba(220,38,38,0.14)"
                      : "rgba(100,116,139,0.14)",
              color:
                readiness.predicted_outcome === 1
                  ? "var(--accent-green)"
                  : readiness.predicted_outcome === 2
                    ? "var(--accent-amber)"
                    : readiness.predicted_outcome === 3
                      ? "var(--accent-red)"
                      : "var(--text-muted)",
            }}
          >
            {readiness.predicted_outcome}
          </div>
          <div className="text-center">
            <p className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              <span>
                {readiness.predicted_outcome === 1 && "Predicted Outcome 1"}
                {readiness.predicted_outcome === 2 && "Predicted Outcome 2"}
                {readiness.predicted_outcome === 3 && "Predicted Outcome 3"}
                {readiness.predicted_outcome === 5 && "Outcome 5 Risk"}
              </span>
              <InlineInfoTip text="Prediction from synced portfolio evidence and stage rules. If Educational Supervisor CiP levels are present, those are prioritized." />
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {readiness.predicted_outcome === 1 && "Satisfactory progress"}
              {readiness.predicted_outcome === 2 && "Specific competencies needed"}
              {readiness.predicted_outcome === 3 && "Additional training time"}
              {readiness.predicted_outcome === 5 && "Incomplete evidence"}
            </p>
          </div>
        </div>

        <div className="col-span-1 flex flex-col justify-center gap-2.5 px-5 py-5 lg:col-span-2">
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
              <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-4)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pillar.pct}%`,
                    background:
                      pillar.pct === 100
                        ? "var(--accent-green)"
                        : pillar.pct >= 60
                          ? "var(--accent-blue)"
                          : "var(--accent-amber)",
                  }}
                />
              </div>
              <span className="w-8 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatPercent(pillar.pct)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {readiness.blockers.length > 0 && (
        <div className="border-t border-subtle px-5 py-3" style={{ background: "var(--surface-1)" }}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
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
              Prediction based on evidence signals only. Request your CiP assessments from your Educational Supervisor for a
              more accurate outcome.
            </p>
          )}
        </div>
      )}

      {readiness.ltft_pro_rata && readiness.ltft_pro_rata.expected_key_skills_threshold !== null && (
        <div className="border-t border-subtle px-5 py-3" style={{ background: "var(--surface-1)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              LTFT Pro-Rata Checkpoint
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={
                readiness.ltft_pro_rata.on_track
                  ? {
                      background: "rgba(22,163,74,0.12)",
                      color: "var(--accent-green)",
                      border: "1px solid rgba(22,163,74,0.24)",
                    }
                  : {
                      background: "rgba(245,158,11,0.14)",
                      color: "var(--accent-amber)",
                      border: "1px solid rgba(245,158,11,0.24)",
                    }
              }
            >
              {readiness.ltft_pro_rata.on_track ? "On track" : "Below expected"}
            </span>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {readiness.ltft_pro_rata.stage_window ?? "Current stage"} expected by now:{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {readiness.ltft_pro_rata.expected_key_skills_threshold} key skills
            </span>{" "}
            ({readiness.ltft_pro_rata.working_percent}% WTE-adjusted). Actual:{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {readiness.ltft_pro_rata.actual_key_skills_confirmed}
            </span>
            .
          </p>
          {readiness.ltft_pro_rata.pillars && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-3">
              {[
                { label: "OSATS", pillar: readiness.ltft_pro_rata.pillars.osats },
                { label: "Courses", pillar: readiness.ltft_pro_rata.pillars.courses },
                { label: "Exams", pillar: readiness.ltft_pro_rata.pillars.exams },
              ].map(({ label, pillar }) => (
                <div
                  key={label}
                  className="rounded-lg border px-2.5 py-2"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}
                >
                  <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Expected by now:{" "}
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{pillar.expected_threshold ?? "—"}</span> ·
                    Actual: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{pillar.actual_complete}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {readiness.projection && (
        <div className="border-t border-subtle px-5 py-4" style={{ background: "var(--surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Full Completion by Current ARCP Date
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Stricter pace check if all remaining outcomes were completed by this ARCP date.
              </p>
            </div>
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {readiness.projection.months_left_wte == null
                ? "Set ARCP date to enable projection"
                : `${readiness.projection.months_left_wte} WTE months left`}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {[
              readiness.projection.pillars.key_skills,
              readiness.projection.pillars.osats,
              readiness.projection.pillars.courses,
              readiness.projection.pillars.exams,
            ].map((pillar) => {
              const tone = projectionTone(pillar.status);
              return (
                <div
                  key={pillar.key}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {pillar.label}
                    </p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: tone.bg, color: tone.text, border: tone.border }}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {pillar.remaining} remaining
                    {pillar.remaining > 0 && pillar.required_per_month != null
                      ? ` · target ${Math.max(1, Math.ceil(pillar.required_per_month))}/month`
                      : ""}
                  </p>
                </div>
              );
            })}
          </div>

          {readiness.projection.focus_target && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Focus this month:{" "}
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {readiness.projection.focus_target.units_per_month}{" "}
                {readiness.projection.focus_target.label.toLowerCase()}
              </span>{" "}
              to stay on trajectory.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
