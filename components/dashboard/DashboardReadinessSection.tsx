"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InlineInfoTip } from "./InlineInfoTip";

type ArcpReadiness = {
  mode: "on_track" | "predicted_outcome";
  portfolio_pct: number;
  predicted_outcome: 1 | 2 | 3 | 4 | 5;
  blockers: string[];
  pillars: {
    key_skills: { pct: number };
    osats: { pct: number };
    courses: { pct: number };
    exams: { pct: number };
  };
  is_waypoint: boolean;
  current_stage: string | null;
  current_stage_group?: string | null;
  curriculum_scope?: string | null;
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

function predictedOutcomeTone(outcome: ArcpReadiness["predicted_outcome"]) {
  if (outcome === 1) {
    return {
      background: "rgba(22,163,74,0.14)",
      color: "var(--accent-green)",
      title: "Predicted Outcome 1",
      subtitle: "Satisfactory progress",
    };
  }
  if (outcome === 2) {
    return {
      background: "rgba(245,158,11,0.14)",
      color: "var(--accent-amber)",
      title: "Predicted Outcome 2",
      subtitle: "Specific competencies needed",
    };
  }
  if (outcome === 3) {
    return {
      background: "rgba(220,38,38,0.14)",
      color: "var(--accent-red)",
      title: "Predicted Outcome 3",
      subtitle: "Additional training time likely",
    };
  }
  if (outcome === 4) {
    return {
      background: "rgba(127,29,29,0.16)",
      color: "#991b1b",
      title: "Predicted Outcome 4",
      subtitle: "Severe shortfall at this stage",
    };
  }
  return {
    background: "rgba(100,116,139,0.14)",
    color: "var(--text-muted)",
    title: "Predicted Outcome 5",
    subtitle: "Incomplete evidence to judge",
  };
}

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

type DashboardReadinessSectionProps = {
  stageKey?: string;
};

/**
 * ARCP prediction and portfolio-weighted signals from `/api/arcp-readiness` only.
 * Detailed curriculum progress lives in `/dashboard/progress`.
 */
export function DashboardReadinessSection({
  stageKey = "none",
}: DashboardReadinessSectionProps) {
  const [readiness, setReadiness] = useState<ArcpReadiness | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState("loading");

    fetch("/api/arcp-readiness", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load readiness");
        }
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        if (data.error) {
          setLoadState("error");
          return;
        }
        setReadiness(data);
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [stageKey, retryKey]);

  if (loadState === "loading") {
    return (
      <div className="card overflow-hidden rounded-lg shadow-none">
        <div className="h-48 animate-pulse bg-surface-3/80" />
      </div>
    );
  }

  if (loadState === "error" || !readiness) {
    return (
      <section className="card overflow-hidden rounded-lg shadow-none">
        <div className="flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-small font-semibold text-primary" style={{ letterSpacing: "-0.014em" }}>
              ARCP Prediction
            </h2>
            <p className="text-xs leading-relaxed text-secondary">
              We couldn&apos;t load your readiness signals right now. Your other dashboard data is
              still available.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="btn-secondary w-fit px-4 py-2 text-small"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const keySkillsProjection = readiness.projection?.pillars.key_skills ?? null;
  const expectedKeySkills = readiness.ltft_pro_rata?.expected_key_skills_threshold ?? null;
  const actualKeySkills = readiness.ltft_pro_rata?.actual_key_skills_confirmed ?? null;
  const remainingKeySkills = keySkillsProjection?.remaining ?? null;
  const suggestedMonthlyPace =
    keySkillsProjection?.required_per_month != null
      ? Math.max(1, Math.ceil(keySkillsProjection.required_per_month))
      : null;
  const stageWindowLabel = readiness.ltft_pro_rata?.stage_window ?? readiness.current_stage ?? "your current stage";

  const paceTone =
    readiness.ltft_pro_rata?.on_track === false ||
    readiness.projection?.overall_status === "at_risk"
      ? projectionTone("watch")
      : projectionTone("on_track");

  const paceHeadline =
    readiness.ltft_pro_rata?.on_track === false
      ? `You're slightly behind expected pace for ${stageWindowLabel}.`
      : `You're ahead of expected pace for ${stageWindowLabel}.`;

  const supportingPillars = [
    { label: "OSATS", pillar: readiness.projection?.pillars.osats ?? null },
    { label: "Courses", pillar: readiness.projection?.pillars.courses ?? null },
    { label: "Exams", pillar: readiness.projection?.pillars.exams ?? null },
  ];
  const selectedStageLabel = readiness.current_stage ?? "your selected stage";
  const outcomeTone = predictedOutcomeTone(readiness.predicted_outcome);

  return (
    <section className="card overflow-hidden rounded-lg shadow-none">
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
              ? `Judged from ${selectedStageLabel} perspective · ES assessments${readiness.current_stage_group ? ` · ${readiness.current_stage_group}` : ""}`
              : `Judged from ${selectedStageLabel} perspective · Evidence signals only${readiness.current_stage_group ? ` · ${readiness.current_stage_group}` : ""}`}
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

      <div className="grid gap-4 border-b border-subtle p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-subtle bg-surface-1 px-4 py-4 text-center">
            <span
              className="font-bold tabular-nums leading-none"
              style={{ fontSize: "2.5rem", color: "var(--text-primary)" }}
            >
              {formatPercent(readiness.portfolio_pct)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Portfolio complete
              <InlineInfoTip text="Weighted portfolio score for your current stage scope: Key Skills 50%, Summative OSATS 30%, Courses 15%, Exams 5%." />
            </span>
          </div>

          <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-4">
            <div
            className="flex h-14 w-14 items-center justify-center rounded-lg text-[1.4rem] font-bold"
              style={{
                background: outcomeTone.background,
                color: outcomeTone.color,
              }}
            >
              {readiness.predicted_outcome}
            </div>
            <div>
              <p className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                <span>{outcomeTone.title}</span>
                <InlineInfoTip text="Prediction from synced portfolio evidence and stage rules. If Educational Supervisor CiP levels are present, those are prioritized." />
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {outcomeTone.subtitle}
              </p>
              <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Based on your current evidence judged against {selectedStageLabel} expectations.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Pillar completion
          </p>
          <div className="space-y-2.5">
            {[
              { label: "Key skills", pct: readiness.pillars.key_skills.pct, weight: "50%" },
              { label: "Summative OSATS", pct: readiness.pillars.osats.pct, weight: "30%" },
              { label: "Courses", pct: readiness.pillars.courses.pct, weight: "15%" },
              { label: "Exams", pct: readiness.pillars.exams.pct, weight: "5%" },
            ].map((pillar) => (
              <div key={pillar.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] leading-4" style={{ color: "var(--text-secondary)" }}>
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
                <span className="w-9 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatPercent(pillar.pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {readiness.blockers.length > 0 && (
        <div className="border-t border-subtle px-5 py-3" style={{ background: "var(--surface-1)" }}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            To reach Outcome 1 from {selectedStageLabel}
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

      <div className="border-t border-subtle px-5 py-4" style={{ background: "var(--surface-2)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              ARCP Pace
            </p>
            <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              {paceHeadline}
            </p>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: paceTone.bg, color: paceTone.text, border: paceTone.border }}
          >
            {paceTone.label}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Confirmed
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {actualKeySkills ?? "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              key skills confirmed
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Expected by now
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {expectedKeySkills ?? "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              for {stageWindowLabel}
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Remaining by ARCP
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {remainingKeySkills ?? "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              key skills left
            </p>
          </div>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Suggested pace
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {suggestedMonthlyPace ?? "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              key skills per month
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {supportingPillars.map(({ label, pillar }) => {
            if (!pillar) return null;
            const tone = projectionTone(pillar.status);
            return (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
              >
                <span>{label}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: tone.bg, color: tone.text, border: tone.border }}
                >
                  {tone.label}
                </span>
              </div>
            );
          })}
        </div>

        {suggestedMonthlyPace != null && remainingKeySkills != null && remainingKeySkills > 0 ? (
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Focus this month:{" "}
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {suggestedMonthlyPace} key skill{suggestedMonthlyPace === 1 ? "" : "s"}
            </span>{" "}
            to stay on trajectory.
          </p>
        ) : null}
      </div>
    </section>
  );
}
