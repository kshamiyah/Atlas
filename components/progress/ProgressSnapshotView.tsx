"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressKpiStrip } from "@/components/progress/ProgressKpiStrip";
import {
  buildEntriesYearHref,
  buildRequirementsSummary,
  scopeRequirementsByYear,
  type RequirementsSummary,
} from "@/lib/progress/year-portfolio";
import { scopeTeamObservationSummaryForYear } from "@/lib/requirements/team-observation-evidence";
import {
  curriculumBandLabelForScope,
  curriculumBandLabelForYear,
} from "@/lib/progress/scope-dimensions";
import { normalizeStageName, type StageName, type StageScope } from "@/lib/profile/stage";
import type { GapReport, GapReportCip } from "@/lib/types/gap-report";
import type { ProgressSummaryResponse } from "@/lib/types/progress";

type SnapshotResponse = {
  year: StageName;
  current_year: StageName | null;
  is_retrospective: boolean;
  post_window: {
    grade: StageName;
    post_start: string;
    post_end: string;
    hospital: string | null;
    trust: string | null;
  } | null;
  post_window_label: string | null;
  evidence_scope_method: "post_window" | "training_year";
  evidence: {
    total_entries: number;
    by_post_window: number | null;
    by_training_year: number;
    entry_types: Record<string, number>;
    activity_by_month: Array<{ month: string; label: string; count: number }>;
  };
  review: {
    entries_in_scope: number;
    entries_with_confirmed_skills: number;
    entries_awaiting_review: number;
    pending_suggestions: number;
    review_completion_pct: number;
  };
};

type RequirementScopeData = {
  procedures: Array<{ required_by_stage: string; complete: boolean; name: string }>;
  courses: Array<{ required_by_stage: string; complete: boolean; name: string }>;
  exams: Array<{ required_by_stage: string; complete: boolean; name: string }>;
  team_observations?: {
    complete: number;
    target: number;
    items: Array<{ training_year: string | null; complete: boolean }>;
  };
};

function formatPct(value: number): string {
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

function formatEntryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    osats_formative: "OSATS formative",
    osats_summative: "OSATS summative",
    reflective_log: "Reflection",
    reflective_log_entry: "Reflection",
    cbd: "Case-based discussion",
    mini_cex: "Mini-CEX",
    noa: "NOTSS/NOA",
    other_evidence: "Other evidence",
    teaching: "Teaching",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

function summarizeGapReport(cips: GapReportCip[]) {
  let atRisk = 0;
  let onTrack = 0;
  let totalCoverage = 0;
  for (const cip of cips) {
    const missing = Math.max(0, cip.total_skills - cip.confirmed_skills);
    if (missing === 0 || cip.coverage_pct >= 100) onTrack += 1;
    else if (cip.coverage_pct === 0 || cip.coverage_pct < 45 || missing >= 4) atRisk += 1;
    totalCoverage += Math.min(100, Math.max(0, cip.coverage_pct));
  }
  return {
    atRisk,
    onTrack,
    averageCoveragePct: cips.length > 0 ? Math.round(totalCoverage / cips.length) : 0,
  };
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface-2/60 p-4 shadow-sm backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2 text-heading-2 font-semibold tabular-nums text-primary">{value}</p>
      <p className="mt-2 text-[11px] leading-snug text-muted">{detail}</p>
    </div>
  );
}

function RequirementPillar({
  label,
  summary,
}: {
  label: string;
  summary: { complete: number; total: number };
}) {
  const pct = summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0;
  return (
    <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        <p className="text-[11px] font-semibold tabular-nums text-primary">
          {summary.complete}/{summary.total}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent-green transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

async function fetchSnapshot(year: StageName): Promise<SnapshotResponse> {
  const res = await fetch(`/api/progress/snapshot?year=${encodeURIComponent(year)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as SnapshotResponse;
}

async function fetchRequirements(): Promise<RequirementScopeData | null> {
  try {
    const res = await fetch("/api/requirements");
    const body = await res.json();
    if (!res.ok || !body || typeof body !== "object") return null;
    return body as RequirementScopeData;
  } catch {
    return null;
  }
}

async function fetchGapReport(stageScope: StageScope | null): Promise<GapReport | null> {
  try {
    const url = stageScope
      ? `/api/gap-report?stage_scope=${encodeURIComponent(stageScope)}`
      : "/api/gap-report";
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as GapReport;
  } catch {
    return null;
  }
}

function buildEntriesHref(year: StageName): string {
  return buildEntriesYearHref(year);
}

function ActivityBars({
  rows,
}: {
  rows: Array<{ month: string; label: string; count: number }>;
}) {
  if (rows.length === 0) {
    return <p className="text-[11px] text-muted">No dated entries in this scope yet.</p>;
  }

  const peak = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.month} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-2">
          <span className="text-[10px] text-muted">{row.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent-blue"
              style={{ width: `${Math.round((row.count / peak) * 100)}%` }}
            />
          </div>
          <span className="text-right text-[10px] font-semibold tabular-nums text-primary">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ProgressSnapshotViewProps = {
  selectedYear: StageName | null;
  currentYear: StageName | null;
  selectedStageScope: StageScope | null;
  progressData: ProgressSummaryResponse | null;
  isLoadingProgress: boolean;
};

export function ProgressSnapshotView({
  selectedYear,
  currentYear,
  selectedStageScope,
  progressData,
  isLoadingProgress,
}: ProgressSnapshotViewProps) {
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [requirements, setRequirements] = useState<RequirementsSummary | null>(null);
  const [gapSummary, setGapSummary] = useState<ReturnType<typeof summarizeGapReport> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedYear) {
      setSnapshot(null);
      setRequirements(null);
      setGapSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [snapshotData, requirementsData, gapReport] = await Promise.all([
        fetchSnapshot(selectedYear),
        fetchRequirements(),
        fetchGapReport(selectedStageScope),
      ]);
      setSnapshot(snapshotData);

      if (requirementsData) {
        const procedures = scopeRequirementsByYear(requirementsData.procedures, selectedYear);
        const courses = scopeRequirementsByYear(requirementsData.courses, selectedYear);
        const exams = scopeRequirementsByYear(requirementsData.exams, selectedYear);
        const teamObservations = requirementsData.team_observations
          ? scopeTeamObservationSummaryForYear(requirementsData.team_observations, selectedYear)
          : null;
        setRequirements(
          buildRequirementsSummary(procedures, courses, exams, teamObservations),
        );
      } else {
        setRequirements(null);
      }

      setGapSummary(gapReport?.cips ? summarizeGapReport(gapReport.cips) : null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load snapshot");
      setSnapshot(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStageScope, selectedYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearLabel = selectedYear ?? "Not set";
  const curriculumBandLabel = selectedYear
    ? curriculumBandLabelForYear(selectedYear)
    : selectedStageScope
      ? curriculumBandLabelForScope(selectedStageScope)
      : null;

  const evidenceScopeLabel = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.evidence_scope_method === "post_window" && snapshot.post_window_label) {
      return `Entries dated within your ${yearLabel} post (${snapshot.post_window_label})`;
    }
    return `Entries tagged as ${yearLabel} in ePortfolio`;
  }, [snapshot, yearLabel]);

  const entryTypeRows = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.evidence.entry_types).slice(0, 6);
  }, [snapshot]);

  const scopeComparison = useMemo(() => {
    if (!snapshot || snapshot.evidence_scope_method !== "post_window") return null;
    if (snapshot.evidence.by_post_window == null) return null;
    const postCount = snapshot.evidence.by_post_window;
    const tagCount = snapshot.evidence.by_training_year;
    if (postCount === tagCount) return null;
    return { postCount, tagCount };
  }, [snapshot]);

  const waypointReadyLabel = useMemo(() => {
    if (!progressData) return null;
    const { covered, total } = progressData.kpis.cips_checkpoint;
    return `${covered}/${total} CiPs waypoint-ready`;
  }, [progressData]);

  const isRetrospective =
    selectedYear && currentYear ? selectedYear !== currentYear : snapshot?.is_retrospective;

  if (!selectedYear) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface-2/50 p-6 text-small text-muted">
        Pick a training year above to see a portfolio snapshot.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section
        className={[
          "rounded-2xl border px-4 py-4 md:px-5",
          isRetrospective
            ? "border-accent-blue/25 bg-accent-blue/8"
            : "border-subtle bg-surface-2/50",
        ].join(" ")}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Portfolio snapshot
        </p>
        <h2 className="mt-1 text-lg font-semibold text-primary">
          {yearLabel} portfolio overview
        </h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-secondary">
          {isRetrospective && currentYear ? (
            <>
              Viewing your <span className="font-medium text-primary">{yearLabel}</span> portfolio
              while you are currently in{" "}
              <span className="font-medium text-primary">{currentYear}</span>. Coverage metrics use
              the {curriculumBandLabel ?? "curriculum"} band; formal requirements are scoped to{" "}
              {yearLabel} only.
            </>
          ) : (
            <>
              A consolidated view of coverage, requirements, evidence, and review activity for{" "}
              {yearLabel}.
            </>
          )}
        </p>
        {evidenceScopeLabel ? (
          <p className="mt-2 text-[11px] text-muted">{evidenceScopeLabel}</p>
        ) : null}
        {scopeComparison ? (
          <p className="mt-2 text-[11px] text-secondary">
            Post dates: <span className="font-medium text-primary">{scopeComparison.postCount}</span>
            {" · "}
            ePortfolio {yearLabel} tag:{" "}
            <span className="font-medium text-primary">{scopeComparison.tagCount}</span>
          </p>
        ) : null}
        {snapshot?.post_window?.hospital ? (
          <p className="mt-1 text-[11px] text-muted">
            Placement: {snapshot.post_window.hospital}
            {snapshot.post_window.trust ? ` · ${snapshot.post_window.trust}` : ""}
          </p>
        ) : null}
      </section>

      {errorMessage ? (
        <div
          className="rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-micro text-accent-red"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {isLoadingProgress && !progressData ? (
        <div className="flex justify-center py-8 text-small text-muted">Loading coverage…</div>
      ) : progressData ? (
        <section aria-label="Coverage snapshot">
          <ProgressKpiStrip
            kpis={progressData.kpis}
            checkpoint={progressData.checkpoint}
            showBandCoverageHint={selectedStageScope === "BAND_ST1_2"}
          />
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Evidence entries"
          value={isLoading ? "…" : String(snapshot?.evidence.total_entries ?? 0)}
          detail={
            snapshot?.evidence_scope_method === "post_window"
              ? "Synced ePortfolio entries in your post dates"
              : "Synced ePortfolio entries tagged to this year"
          }
        />
        <MetricCard
          label="Pending suggestions"
          value={isLoading ? "…" : String(snapshot?.review.pending_suggestions ?? 0)}
          detail="Skill matches still waiting for confirmation"
        />
        <MetricCard
          label="Review completion"
          value={
            isLoading ? "…" : formatPct(snapshot?.review.review_completion_pct ?? 0)
          }
          detail={`${snapshot?.review.entries_with_confirmed_skills ?? 0} reviewed · ${snapshot?.review.entries_awaiting_review ?? 0} awaiting review`}
        />
        <MetricCard
          label="CiP coverage"
          value={gapSummary ? formatPct(gapSummary.averageCoveragePct) : isLoading ? "…" : "—"}
          detail={
            gapSummary
              ? `${gapSummary.onTrack} on track · ${gapSummary.atRisk} needing attention`
              : "Curriculum band average"
          }
        />
      </section>

      {waypointReadyLabel || progressData ? (
        <div className="space-y-1 text-[11px] text-secondary">
          {waypointReadyLabel ? (
            <p>
              Waypoint-ready CiPs in this band:{" "}
              <span className="font-medium text-primary">{waypointReadyLabel}</span>
            </p>
          ) : null}
          {progressData ? (
            <p>
              CiP assessments:{" "}
              <span className="font-medium text-primary">
                {progressData.kpis.cip_assessments.covered}/
                {progressData.kpis.cip_assessments.total} complete
              </span>
              {" · "}
              <span className="font-medium text-primary">
                {progressData.kpis.cip_assessments_on_track.covered} on track
              </span>{" "}
              for {progressData.checkpoint.current_stage ?? "this stage"}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4 md:p-5">
          <h3 className="text-small font-semibold text-primary">Activity in this period</h3>
          <p className="mt-1 text-[11px] text-secondary">
            Monthly entry volume for your {yearLabel} portfolio scope.
          </p>
          <div className="mt-4">
            {isLoading ? (
              <p className="text-[11px] text-muted">Loading activity…</p>
            ) : (
              <ActivityBars rows={snapshot?.evidence.activity_by_month ?? []} />
            )}
          </div>
        </div>

        <div className="card p-4 md:p-5">
          <h3 className="text-small font-semibold text-primary">Review status</h3>
          <p className="mt-1 text-[11px] text-secondary">
            How much of your in-scope evidence has confirmed key skills.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Reviewed
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">
                {isLoading ? "…" : snapshot?.review.entries_with_confirmed_skills ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Awaiting review
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">
                {isLoading ? "…" : snapshot?.review.entries_awaiting_review ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Pending suggestions
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">
                {isLoading ? "…" : snapshot?.review.pending_suggestions ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                In scope
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-primary">
                {isLoading ? "…" : snapshot?.review.entries_in_scope ?? 0}
              </p>
            </div>
          </div>
          <Link href="/dashboard/key-skill-review" className="btn-secondary mt-4 text-xs">
            Open review queue
          </Link>
        </div>
      </section>

      {requirements ? (
        <section className="card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-small font-semibold text-primary">
                Formal requirements ({yearLabel})
              </h3>
              <p className="mt-1 text-[11px] text-secondary">
                OSATS, courses, exams, and team observations due by {yearLabel}.
              </p>
            </div>
            <Link href="/dashboard/requirements" className="btn-secondary text-xs">
              Open requirements
            </Link>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <RequirementPillar
              label="OSATS"
              summary={{
                complete: requirements.procedures_complete,
                total: requirements.procedures_total,
              }}
            />
            <RequirementPillar
              label="Courses"
              summary={{
                complete: requirements.courses_complete,
                total: requirements.courses_total,
              }}
            />
            <RequirementPillar
              label="Exams"
              summary={{
                complete: requirements.exams_complete,
                total: requirements.exams_total,
              }}
            />
            <RequirementPillar
              label="Team observations"
              summary={{
                complete: requirements.team_observations_complete,
                total: requirements.team_observations_total,
              }}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4 md:p-5">
          <h3 className="text-small font-semibold text-primary">Evidence breakdown</h3>
          <p className="mt-1 text-[11px] text-secondary">
            Entry types contributing to your {yearLabel} portfolio.
          </p>
          {entryTypeRows.length === 0 ? (
            <p className="mt-4 text-[11px] text-muted">
              {isLoading ? "Loading evidence…" : "No synced entries found for this scope."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {entryTypeRows.map(([type, count]) => (
                <li
                  key={type}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-surface-1/70 px-3 py-2 text-[11px]"
                >
                  <span className="text-secondary">{formatEntryTypeLabel(type)}</span>
                  <span className="font-semibold tabular-nums text-primary">{count}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href={buildEntriesHref(selectedYear)} className="btn-secondary mt-4 text-xs">
            Browse entries
          </Link>
        </div>

        <div className="card p-4 md:p-5">
          <h3 className="text-small font-semibold text-primary">Go deeper</h3>
          <p className="mt-1 text-[11px] text-secondary">
            Drill into coverage details or continue reviewing evidence from this period.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={`/dashboard/progress?view=overview&year=${encodeURIComponent(selectedYear)}&tab=cips`}
              className="btn-secondary text-xs"
            >
              CiP coverage drill-down
            </Link>
            <Link
              href={`/dashboard/key-skill-review`}
              className="btn-secondary text-xs"
            >
              Review entries
            </Link>
            {isRetrospective ? (
              <Link
                href={`/dashboard/progress?view=priorities&year=${encodeURIComponent(selectedYear)}`}
                className="text-[11px] font-medium text-accent-blue hover:underline"
              >
                View {yearLabel} priorities
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
