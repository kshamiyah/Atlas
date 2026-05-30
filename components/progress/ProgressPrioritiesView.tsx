"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeySkillRow } from "@/components/gap-report/KeySkillRow";
import {
  ProgressCipAssessmentBadge,
  ProgressCipAssessmentFields,
} from "@/components/progress/ProgressCipAssessmentBadge";
import { buildWriteEntryHref } from "@/lib/generate/query-params";
import {
  curriculumBandLabelForScope,
  curriculumBandLabelForYear,
} from "@/lib/progress/scope-dimensions";
import {
  normalizeStageName,
  type StageName,
  type StageScope,
} from "@/lib/profile/stage";
import { scopeTeamObservationSummaryForYear } from "@/lib/requirements/team-observation-evidence";
import type { GapReport, GapReportCip } from "@/lib/types/gap-report";
import type {
  ProgressCipAssessmentStatus,
  ProgressCipAssessmentSummary,
  ProgressCipsResponse,
} from "@/lib/types/progress";
import { curriculumBandScopeForYear } from "@/lib/progress/scope-dimensions";

type RequirementOsatsEntry = {
  id: string;
  title: string;
  kaizen_date: string;
  source_url: string | null;
  assessor_role_label: string | null;
  is_consultant_signoff: boolean;
};

type RequirementProcedure = {
  id: string;
  name: string;
  required_by_stage: string;
  complete: boolean;
  osats_target: number;
  total_osats: number;
  consultant_osats: number;
  osats_entries?: RequirementOsatsEntry[];
};

type RequirementCourse = {
  id: string;
  name: string;
  required_by_stage: string;
  complete: boolean;
};

type RequirementExam = {
  evidence_type: string;
  name: string;
  required_by_stage: string;
  complete: boolean;
};

type RequirementScopeData = {
  procedures: RequirementProcedure[];
  courses: RequirementCourse[];
  exams: RequirementExam[];
  team_observations?: {
    complete: number;
    target: number;
    items: Array<{
      id: string;
      title: string;
      training_year: string | null;
      status: string;
      complete: boolean;
    }>;
  };
  profile_stage?: { name: string } | null;
};

type RequirementsSummary = {
  procedures_complete: number;
  procedures_total: number;
  courses_complete: number;
  courses_total: number;
  exams_complete: number;
  exams_total: number;
  team_observations_complete: number;
  team_observations_total: number;
};

type MobileView = "list" | "detail";
type PriorityTone = "high" | "medium" | "low";

type PriorityRow =
  | {
      id: string;
      kind: "cip";
      tone: PriorityTone;
      badge: string;
      title: string;
      subtitle: string;
      cip: GapReportCip;
      missing: number;
    }
  | {
      id: string;
      kind: "procedure";
      tone: PriorityTone;
      badge: string;
      title: string;
      subtitle: string;
      procedure: RequirementProcedure;
    }
  | {
      id: string;
      kind: "course";
      tone: PriorityTone;
      badge: string;
      title: string;
      subtitle: string;
      course: RequirementCourse;
    }
  | {
      id: string;
      kind: "exam";
      tone: PriorityTone;
      badge: string;
      title: string;
      subtitle: string;
      exam: RequirementExam;
    }
  | {
      id: string;
      kind: "cip_assessment";
      tone: PriorityTone;
      badge: string;
      title: string;
      subtitle: string;
      cipNumber: number;
      cipTitle: string;
      assessment: ProgressCipAssessmentSummary;
    };

type PriorityKindFilter = "all" | PriorityRow["kind"];

const PRIORITY_KIND_FILTERS: Array<{ id: PriorityKindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "cip", label: "CiP evidence" },
  { id: "cip_assessment", label: "CiP assessments" },
  { id: "procedure", label: "OSATS" },
  { id: "course", label: "Courses" },
  { id: "exam", label: "Exams" },
];

async function fetchRequirements(): Promise<RequirementScopeData | null> {
  try {
    const res = await fetch("/api/requirements");
    const body = await res.json();
    if (!res.ok || !body || typeof body !== "object" || "error" in body) {
      return null;
    }
    if (
      !Array.isArray(body.procedures) ||
      !Array.isArray(body.courses) ||
      !Array.isArray(body.exams)
    ) {
      return null;
    }
    return body as RequirementScopeData;
  } catch {
    return null;
  }
}

async function fetchGapReport(stageScope: StageScope | null = null): Promise<GapReport> {
  const url = stageScope
    ? `/api/gap-report?stage_scope=${encodeURIComponent(stageScope)}`
    : "/api/gap-report";
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as GapReport;
}

function buildProgressScopeParams(
  selectedYear: StageName | null,
  selectedStageScope: StageScope | null,
): URLSearchParams {
  const params = new URLSearchParams();
  if (selectedYear) params.set("year", selectedYear);
  const stageScope =
    selectedStageScope ?? (selectedYear ? curriculumBandScopeForYear(selectedYear) : null);
  if (stageScope) params.set("stage_scope", stageScope);
  return params;
}

async function fetchProgressCips(
  selectedYear: StageName | null,
  selectedStageScope: StageScope | null,
): Promise<ProgressCipsResponse | null> {
  try {
    const params = buildProgressScopeParams(selectedYear, selectedStageScope);
    const url = new URL("/api/progress/cips", window.location.origin);
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }
    const res = await fetch(url.toString(), { headers: { "Content-Type": "application/json" } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) return null;
    return body as ProgressCipsResponse;
  } catch {
    return null;
  }
}

function assessmentPriorityTone(status: ProgressCipAssessmentStatus): PriorityTone | null {
  switch (status) {
    case "below_expectations":
    case "below_entrustment":
    case "missing":
      return "high";
    case "pending_entrustment":
      return "medium";
    case "on_track":
      return null;
  }
}

function assessmentBadge(status: ProgressCipAssessmentStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "below_expectations":
      return "Below expectations";
    case "below_entrustment":
      return "Below entrustment";
    case "pending_entrustment":
      return "Entrustment pending";
    case "on_track":
      return "Complete";
  }
}

function missingSkills(cip: GapReportCip): number {
  return Math.max(0, cip.total_skills - cip.confirmed_skills);
}

function getCipPriority(cip: GapReportCip): "at-risk" | "needs-work" | "on-track" {
  const missing = missingSkills(cip);
  if (missing === 0 || cip.coverage_pct >= 100) return "on-track";
  if (cip.coverage_pct === 0 || cip.coverage_pct < 45 || missing >= 4) return "at-risk";
  return "needs-work";
}

function nextActionHint(cip: GapReportCip): string {
  const missing = missingSkills(cip);
  if (missing === 0) return "Maintain with fresh evidence entries.";
  if (cip.coverage_pct === 0) return "Confirm one key skill to start progress.";
  if (cip.coverage_pct < 50) return "Prioritize missing high-impact skills.";
  return "Close remaining gaps before ARCP.";
}

function formatPct(value: number): string {
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

function toneWeight(tone: PriorityTone): number {
  if (tone === "high") return 0;
  if (tone === "medium") return 1;
  return 2;
}

function toneChipClasses(tone: PriorityTone, badge?: string): string {
  if (badge === "Complete") {
    return "bg-accent-green/12 text-accent-green border-accent-green/30";
  }
  if (tone === "high") return "bg-accent-red/12 text-accent-red border-accent-red/30";
  if (tone === "medium") return "bg-accent-amber/14 text-accent-amber border-accent-amber/35";
  return "bg-accent-blue/12 text-accent-blue border-accent-blue/30";
}

function OsatsEntryList({ entries }: { entries: RequirementOsatsEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted">
        No summative OSATS entries matched this procedure yet.
      </p>
    );
  }

  return (
    <ul className="mt-3 flex flex-col divide-y divide-subtle rounded-xl border border-subtle bg-surface-1">
      {entries.map((entry) => (
        <li key={entry.id || entry.title} className="px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {entry.source_url ? (
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium leading-5 text-primary hover:text-accent-blue"
                >
                  {entry.title}
                </a>
              ) : (
                <p className="text-sm font-medium leading-5 text-primary">{entry.title}</p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                {entry.kaizen_date || "Date not recorded"}
                {entry.assessor_role_label
                  ? ` · ${entry.assessor_role_label}`
                  : ""}
              </p>
            </div>
            {entry.is_consultant_signoff ? (
              <span className="shrink-0 rounded-full border border-accent-green/30 bg-accent-green/12 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                Consultant
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                Summative
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function scopeRequirements(
  data: RequirementScopeData | null,
  selectedYear: StageName | null,
): {
  summary: RequirementsSummary | null;
  procedures: RequirementProcedure[];
  courses: RequirementCourse[];
  exams: RequirementExam[];
  teamObservations: RequirementScopeData["team_observations"] | null;
} {
  if (!data) {
    return {
      summary: null,
      procedures: [],
      courses: [],
      exams: [],
      teamObservations: null,
    };
  }

  const proceduresSource = Array.isArray(data.procedures) ? data.procedures : [];
  const coursesSource = Array.isArray(data.courses) ? data.courses : [];
  const examsSource = Array.isArray(data.exams) ? data.exams : [];

  const matchesYear = (requiredByStage: string) =>
    selectedYear != null &&
    normalizeStageName(requiredByStage) === selectedYear;

  const procedures = selectedYear
    ? proceduresSource.filter((item) => matchesYear(item.required_by_stage))
    : proceduresSource;
  const courses = selectedYear
    ? coursesSource.filter((item) => matchesYear(item.required_by_stage))
    : coursesSource;
  const exams = selectedYear
    ? examsSource.filter((item) => matchesYear(item.required_by_stage))
    : examsSource;
  const teamObservations = data.team_observations
    ? scopeTeamObservationSummaryForYear(data.team_observations, selectedYear)
    : null;

  return {
    summary: {
      procedures_complete: procedures.filter((p) => p.complete).length,
      procedures_total: procedures.length,
      courses_complete: courses.filter((c) => c.complete).length,
      courses_total: courses.length,
      exams_complete: exams.filter((e) => e.complete).length,
      exams_total: exams.length,
      team_observations_complete: teamObservations?.complete ?? 0,
      team_observations_total: teamObservations?.target ?? 2,
    },
    procedures,
    courses,
    exams,
    teamObservations,
  };
}

export function ProgressPrioritiesView({
  selectedYear,
  selectedStageScope,
}: {
  selectedYear: StageName | null;
  selectedStageScope: StageScope | null;
}) {
  const [report, setReport] = useState<GapReport | null>(null);
  const [progressCips, setProgressCips] = useState<ProgressCipsResponse | null>(null);
  const [requirementsData, setRequirementsData] = useState<RequirementScopeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requirementsWarning, setRequirementsWarning] = useState<string | null>(null);
  const [expandedKeySkillIds, setExpandedKeySkillIds] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<PriorityKindFilter>("all");
  const [selectedPriorityId, setSelectedPriorityId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setRequirementsWarning(null);
    try {
      const [gapData, requirements, cipsData] = await Promise.all([
        fetchGapReport(selectedStageScope),
        fetchRequirements(),
        fetchProgressCips(selectedYear, selectedStageScope),
      ]);
      setReport(gapData);
      setRequirementsData(requirements);
      setProgressCips(cipsData);
      if (!requirements) {
        setRequirementsWarning(
          "Formal requirements (OSATS, courses, exams) could not be loaded. CiP priorities are still shown.",
        );
      }
      if (!cipsData) {
        setRequirementsWarning((prev) =>
          prev
            ? `${prev} CiP assessment data could not be loaded.`
            : "CiP assessment data could not be loaded.",
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load priorities");
    } finally {
      setIsLoading(false);
    }
  }, [selectedStageScope, selectedYear]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedPriorityId(null);
    setExpandedKeySkillIds(new Set());
    setMobileView("list");
    setKindFilter("all");
  }, [selectedStageScope, selectedYear]);

  const sortedCips = useMemo(() => {
    const cips = report?.cips ?? [];
    return [...cips].sort((a, b) => {
      const pa = getCipPriority(a);
      const pb = getCipPriority(b);
      const pDelta =
        (pa === "at-risk" ? 0 : pa === "needs-work" ? 1 : 2) -
        (pb === "at-risk" ? 0 : pb === "needs-work" ? 1 : 2);
      if (pDelta !== 0) return pDelta;

      const missingDelta = missingSkills(b) - missingSkills(a);
      if (missingDelta !== 0) return missingDelta;

      if (a.coverage_pct !== b.coverage_pct) return a.coverage_pct - b.coverage_pct;
      return Number(a.cip_number) - Number(b.cip_number);
    });
  }, [report]);

  const counts = useMemo(() => {
    const atRisk = sortedCips.filter((cip) => getCipPriority(cip) === "at-risk").length;
    const needsWork = sortedCips.filter((cip) => getCipPriority(cip) === "needs-work").length;
    const totalMissingSkills = sortedCips.reduce((sum, cip) => sum + missingSkills(cip), 0);
    return { atRisk, needsWork, totalMissingSkills };
  }, [sortedCips]);

  const scopedRequirements = useMemo(
    () => scopeRequirements(requirementsData, selectedYear),
    [requirementsData, selectedYear],
  );

  const assessmentCounts = useMemo(() => {
    const rows = progressCips?.cips ?? [];
    let missing = 0;
    let atRisk = 0;
    let onTrack = 0;
    for (const row of rows) {
      if (row.assessment.status === "on_track") onTrack += 1;
      else if (row.assessment.status === "pending_entrustment") atRisk += 1;
      else missing += 1;
    }
    return {
      missing,
      atRisk,
      onTrack,
      complete: rows.filter((row) => row.assessment.is_complete).length,
      total: rows.length || 14,
    };
  }, [progressCips]);

  const allPriorityRows = useMemo(() => {
    const rows: PriorityRow[] = [];

    for (const cipRow of progressCips?.cips ?? []) {
      const tone = assessmentPriorityTone(cipRow.assessment.status);
      if (tone == null) {
        if (!priorityOnly) {
          rows.push({
            id: `cip-assessment-${cipRow.cip_number}`,
            kind: "cip_assessment",
            tone: "low",
            badge: assessmentBadge(cipRow.assessment.status),
            title: `CiP ${cipRow.cip_number} assessment`,
            subtitle: cipRow.assessment.status_reason,
            cipNumber: cipRow.cip_number,
            cipTitle: cipRow.cip_title,
            assessment: cipRow.assessment,
          });
        }
        continue;
      }

      rows.push({
        id: `cip-assessment-${cipRow.cip_number}`,
        kind: "cip_assessment",
        tone,
        badge: assessmentBadge(cipRow.assessment.status),
        title: `CiP ${cipRow.cip_number} assessment`,
        subtitle: cipRow.assessment.status_reason,
        cipNumber: cipRow.cip_number,
        cipTitle: cipRow.cip_title,
        assessment: cipRow.assessment,
      });
    }

    for (const cip of sortedCips) {
      const missing = missingSkills(cip);
      if (missing === 0) continue;
      const priority = getCipPriority(cip);
      rows.push({
        id: `cip-${cip.cip_number}`,
        kind: "cip",
        tone: priority === "at-risk" ? "high" : "medium",
        badge: priority === "at-risk" ? "At risk" : "Needs work",
        title: `CiP ${cip.cip_number}`,
        subtitle: `${missing} key skill${missing === 1 ? "" : "s"} still missing in ${cip.cip_title}`,
        cip,
        missing,
      });
    }

    for (const procedure of scopedRequirements.procedures) {
      if (procedure.complete) {
        rows.push({
          id: `procedure-${procedure.id}`,
          kind: "procedure",
          tone: "low",
          badge: "Complete",
          title: procedure.name,
          subtitle: `${procedure.total_osats}/${procedure.osats_target} summative OSATS · consultant sign-off recorded`,
          procedure,
        });
        continue;
      }

      const consultantMissing = procedure.consultant_osats < 1;
      const targetGap = Math.max(0, procedure.osats_target - procedure.total_osats);
      rows.push({
        id: `procedure-${procedure.id}`,
        kind: "procedure",
        tone: consultantMissing || targetGap >= 2 ? "high" : "medium",
        badge: "OSATS",
        title: procedure.name,
        subtitle: consultantMissing
          ? `Consultant sign-off still needed · ${procedure.total_osats}/${procedure.osats_target} OSATS logged`
          : `${targetGap} OSATS still needed · ${procedure.total_osats}/${procedure.osats_target} logged`,
        procedure,
      });
    }

    for (const course of scopedRequirements.courses) {
      if (course.complete) continue;
      rows.push({
        id: `course-${course.id}`,
        kind: "course",
        tone: "medium",
        badge: "Course",
        title: course.name,
        subtitle: `Outstanding course requirement due by ${course.required_by_stage}`,
        course,
      });
    }

    for (const exam of scopedRequirements.exams) {
      if (exam.complete) continue;
      rows.push({
        id: `exam-${exam.evidence_type}`,
        kind: "exam",
        tone: "high",
        badge: "Exam",
        title: exam.name,
        subtitle: `Outstanding exam requirement due by ${exam.required_by_stage}`,
        exam,
      });
    }

    const teamObs = scopedRequirements.teamObservations;
    if (teamObs && teamObs.complete < teamObs.target) {
      const missing = Math.max(0, teamObs.target - teamObs.complete);
      rows.push({
        id: "team-observations-gap",
        kind: "course",
        tone: missing >= 2 ? "high" : "medium",
        badge: "TO2",
        title: "Team Observation 2",
        subtitle: `${teamObs.complete}/${teamObs.target} complete for ${selectedYear ?? teamObs.training_year ?? "training year"} · 2 required annually`,
        course: {
          id: "team-observations",
          name: "Team Observation 2",
          required_by_stage: selectedYear ?? teamObs.training_year ?? "Current year",
          complete: false,
        },
      });
    }

    const filtered = priorityOnly
      ? rows.filter((row) => row.tone === "high" || row.tone === "medium")
      : rows;

    return filtered.sort((a, b) => {
      const toneDelta = toneWeight(a.tone) - toneWeight(b.tone);
      if (toneDelta !== 0) return toneDelta;
      if (a.kind === "cip" && b.kind === "cip") return b.missing - a.missing;
      if (a.kind === "cip_assessment" && b.kind === "cip_assessment") {
        return a.cipNumber - b.cipNumber;
      }
      return a.title.localeCompare(b.title);
    });
  }, [
    priorityOnly,
    progressCips,
    scopedRequirements.courses,
    scopedRequirements.exams,
    scopedRequirements.procedures,
    scopedRequirements.teamObservations,
    selectedYear,
    sortedCips,
  ]);

  const kindCounts = useMemo(() => {
    const counts: Record<PriorityKindFilter, number> = {
      all: allPriorityRows.length,
      cip: 0,
      cip_assessment: 0,
      procedure: 0,
      course: 0,
      exam: 0,
    };
    for (const row of allPriorityRows) {
      counts[row.kind] += 1;
    }
    return counts;
  }, [allPriorityRows]);

  const priorityRows = useMemo(() => {
    if (kindFilter === "all") return allPriorityRows;
    return allPriorityRows.filter((row) => row.kind === kindFilter);
  }, [allPriorityRows, kindFilter]);

  const selectedPriority = useMemo(() => {
    if (priorityRows.length === 0) return null;
    return priorityRows.find((row) => row.id === selectedPriorityId) ?? priorityRows[0];
  }, [priorityRows, selectedPriorityId]);

  const selectedCip = selectedPriority?.kind === "cip" ? selectedPriority.cip : null;
  const sortedKeySkills = selectedCip
    ? [...(selectedCip.key_skills ?? [])].sort((a, b) => a.skill_number - b.skill_number)
    : [];
  const missingKeySkills = sortedKeySkills.filter((ks) => !ks.is_confirmed);

  const actionRows = allPriorityRows.slice(0, 3);
  const requirementTiles = scopedRequirements.summary
    ? [
        {
          label: "OSATS outstanding",
          value:
            scopedRequirements.summary.procedures_total -
            scopedRequirements.summary.procedures_complete,
          detail: `${scopedRequirements.summary.procedures_complete}/${scopedRequirements.summary.procedures_total} complete`,
        },
        {
          label: "Courses outstanding",
          value:
            scopedRequirements.summary.courses_total -
            scopedRequirements.summary.courses_complete,
          detail: `${scopedRequirements.summary.courses_complete}/${scopedRequirements.summary.courses_total} complete`,
        },
        {
          label: "Exams outstanding",
          value:
            scopedRequirements.summary.exams_total -
            scopedRequirements.summary.exams_complete,
          detail: `${scopedRequirements.summary.exams_complete}/${scopedRequirements.summary.exams_total} complete`,
        },
        {
          label: "TO2 outstanding",
          value:
            scopedRequirements.summary.team_observations_total -
            scopedRequirements.summary.team_observations_complete,
          detail: `${scopedRequirements.summary.team_observations_complete}/${scopedRequirements.summary.team_observations_total} complete`,
        },
      ]
    : [];

  function handleSelectPriority(row: PriorityRow) {
    setSelectedPriorityId(row.id);
    setExpandedKeySkillIds(new Set());
    setMobileView("detail");
  }

  return (
    <section className="mt-6 space-y-4">
      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-small font-semibold text-primary">Priorities</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-secondary">
              Ranked next actions across CiP evidence, CiP assessments, OSATS, courses, and exams,
              so you can see what matters most in the current scope.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-secondary">
                Requirements year:{" "}
                <span className="font-medium text-primary">
                  {selectedYear ?? "Not set"}
                </span>
              </span>
              <span className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-secondary">
                Curriculum band:{" "}
                <span className="font-medium text-primary">
                  {selectedStageScope
                    ? curriculumBandLabelForScope(selectedStageScope) ?? selectedStageScope
                    : selectedYear
                      ? curriculumBandLabelForYear(selectedYear) ?? "Not set"
                      : "Not set"}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPriorityOnly((prev) => !prev)}
              className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[11px] font-medium text-secondary hover:bg-surface-3 hover:text-primary"
            >
              {priorityOnly ? "Show all items" : "Show priorities only"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {requirementsWarning ? (
          <div
            className="mt-4 rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-3 text-micro text-accent-amber"
            role="status"
          >
            {requirementsWarning}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="mt-4 rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-micro text-accent-red"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-accent-purple/30 bg-accent-purple/10 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-purple">
              CiP assessments outstanding
            </p>
            <p className="mt-1 text-heading-3 font-semibold text-accent-purple">
              {assessmentCounts.missing + assessmentCounts.atRisk}
            </p>
            <p className="mt-1 text-[11px] text-secondary">
              {assessmentCounts.complete}/{assessmentCounts.total} complete ·{" "}
              {assessmentCounts.onTrack} on track
              {progressCips?.checkpoint.current_stage
                ? ` for ${progressCips.checkpoint.current_stage}`
                : ""}
            </p>
          </div>
          <div className="rounded-xl border border-accent-red/25 bg-accent-red/10 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-red">
              CiPs needing attention
            </p>
            <p className="mt-1 text-heading-3 font-semibold text-accent-red">
              {counts.atRisk + counts.needsWork}
            </p>
            <p className="mt-1 text-[11px] text-secondary">
              {counts.atRisk} at risk · {counts.needsWork} need work
            </p>
          </div>
          <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/12 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-amber">
              Missing key skills
            </p>
            <p className="mt-1 text-heading-3 font-semibold text-accent-amber">
              {counts.totalMissingSkills}
            </p>
            <p className="mt-1 text-[11px] text-secondary">
              Missing key skills across the curriculum band (includes earlier years in the band)
            </p>
          </div>
          {requirementTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-subtle bg-surface-1 px-3 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                {tile.label}
              </p>
              <p className="mt-1 text-heading-3 font-semibold text-primary">{tile.value}</p>
              <p className="mt-1 text-[11px] text-secondary">{tile.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-subtle bg-surface-1 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                Recommended next actions
              </h3>
              <p className="mt-1 text-[12px] text-secondary">
                Start with CiP assessments and coverage gaps, then close formal checklist blockers.
              </p>
            </div>
            <Link href="/dashboard/requirements" className="btn-secondary text-xs">
              Review requirements
            </Link>
          </div>
          {actionRows.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {actionRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handleSelectPriority(row)}
                  className="rounded-full border border-subtle bg-surface-2 px-3 py-1.5 text-xs text-secondary transition hover:bg-surface-3 hover:text-primary"
                >
                  {row.badge}: {row.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">
              No obvious priority items right now. Keep adding fresh evidence and maintaining requirements.
            </p>
          )}
        </div>
      </section>

      {isLoading && !report ? (
        <div className="flex justify-center py-10 text-small text-muted">Loading priorities…</div>
      ) : (
        <>
          <div className="flex gap-0.5 rounded-full bg-surface-3 p-0.5 md:hidden">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className={[
                "flex-1 rounded-full py-1.5 text-micro font-medium transition-all duration-150",
                mobileView === "list" ? "bg-surface-1 text-primary shadow-sm" : "text-muted",
              ].join(" ")}
            >
              Priority list
            </button>
            <button
              type="button"
              onClick={() => setMobileView("detail")}
              className={[
                "flex-1 rounded-full py-1.5 text-micro font-medium transition-all duration-150",
                mobileView === "detail" ? "bg-surface-1 text-primary shadow-sm" : "text-muted",
              ].join(" ")}
            >
              Details
            </button>
          </div>

          <div className="flex flex-col gap-4 md:h-[calc(100vh-16rem)] md:flex-row">
            <div
              className={[
                "rounded-2xl border border-subtle bg-surface-2 p-2 md:w-[24rem] md:shrink-0 md:overflow-y-auto",
                mobileView === "list" ? "block" : "hidden md:block",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                  Priority queue
                </h3>
                <span className="text-[11px] text-muted">
                  {priorityRows.length}
                  {kindFilter === "all" ? " shown" : ` of ${allPriorityRows.length}`}
                </span>
              </div>
              <div className="mb-3 flex flex-wrap gap-1 px-1">
                {PRIORITY_KIND_FILTERS.map((filter) => {
                  const count = kindCounts[filter.id];
                  const isActive = kindFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => {
                        setKindFilter(filter.id);
                        setSelectedPriorityId(null);
                      }}
                      className={[
                        "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                        isActive
                          ? "border-accent-primary/30 bg-accent-primary/10 text-primary"
                          : "border-subtle bg-surface-1 text-muted hover:bg-surface-3 hover:text-secondary",
                        count === 0 && filter.id !== "all"
                          ? "opacity-50"
                          : "",
                      ].join(" ")}
                    >
                      {filter.label}
                      <span className="ml-1 tabular-nums opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {priorityRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleSelectPriority(row)}
                    className={`card-interactive w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      selectedPriority?.id === row.id
                        ? "border-accent-blue/45 bg-surface-2 ring-1 ring-accent-blue/20"
                        : "border-subtle bg-surface-1 hover:bg-surface-3"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-primary">{row.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                          {row.subtitle}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneChipClasses(
                          row.tone,
                          row.badge,
                        )}`}
                      >
                        {row.badge}
                      </span>
                    </div>
                  </button>
                ))}
                {priorityRows.length === 0 && (
                  <div className="rounded-xl border border-subtle bg-surface-1 p-4 text-center text-xs text-muted">
                    {kindFilter === "all"
                      ? "No priority items right now."
                      : `No ${PRIORITY_KIND_FILTERS.find((f) => f.id === kindFilter)?.label.toLowerCase() ?? "items"} in the queue.`}
                  </div>
                )}
              </div>
            </div>

            <div
              className={[
                "card flex-1 p-4 md:overflow-y-auto md:p-5",
                mobileView === "detail" ? "block" : "hidden md:block",
              ].join(" ")}
            >
              {selectedPriority == null ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <p className="text-small text-muted">
                    Select a priority to see the missing work behind it.
                  </p>
                </div>
              ) : selectedPriority.kind === "cip" ? (
                <>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    CiP {selectedPriority.cip.cip_number}: {selectedPriority.cip.cip_title}
                  </h2>
                  <p className="mt-1 text-small text-secondary">
                    {selectedPriority.cip.confirmed_skills} of {selectedPriority.cip.total_skills} key skills confirmed (
                    {formatPct(selectedPriority.cip.coverage_pct)})
                  </p>

                  <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                      Next best actions
                    </h3>
                    {missingKeySkills.length > 0 ? (
                      <>
                        <ul className="mt-2 space-y-1.5">
                          {missingKeySkills.slice(0, 3).map((skill, idx) => (
                            <li key={skill.key_skill_id} className="text-xs text-secondary">
                              {idx + 1}. Capture evidence for {skill.title}
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={buildWriteEntryHref({
                            skillId: missingKeySkills[0]?.key_skill_id,
                            cip: selectedCip?.cip_number,
                          })}
                          className="btn-primary mt-3 text-xs"
                        >
                          Write an entry for this CiP
                        </Link>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-secondary">
                        This CiP is fully covered. Keep adding fresh examples to maintain confidence.
                      </p>
                    )}
                  </section>

                  {sortedKeySkills.length === 0 ? (
                    <p className="mt-4 text-small text-muted">No key skills found for this CiP.</p>
                  ) : (
                    <ul className="mt-4 flex flex-col divide-y divide-subtle">
                      {sortedKeySkills.map((ks) => (
                        <li key={ks.key_skill_id}>
                          <KeySkillRow
                            keySkill={ks}
                            isDescriptorPanelExpanded={expandedKeySkillIds.has(ks.key_skill_id)}
                            onToggleDescriptorPanel={() =>
                              setExpandedKeySkillIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(ks.key_skill_id)) next.delete(ks.key_skill_id);
                                else next.add(ks.key_skill_id);
                                return next;
                              })
                            }
                            writeEntryHref={
                              !ks.is_confirmed
                                ? buildWriteEntryHref({
                                    skillId: ks.key_skill_id,
                                    cip: selectedCip?.cip_number,
                                  })
                                : undefined
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : selectedPriority.kind === "cip_assessment" ? (
                <>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    CiP {selectedPriority.cipNumber}: {selectedPriority.cipTitle}
                  </h2>
                  <p className="mt-1 text-small text-secondary">
                    Supervisor CiP assessment for{" "}
                    {progressCips?.checkpoint.current_stage ?? selectedYear ?? "this ARCP cycle"}
                  </p>

                  <section className="mt-4 space-y-3">
                    <ProgressCipAssessmentBadge assessment={selectedPriority.assessment} />
                    <ProgressCipAssessmentFields assessment={selectedPriority.assessment} />
                    {selectedPriority.assessment.assessment_date ? (
                      <p className="text-[11px] text-muted">
                        Assessment date: {selectedPriority.assessment.assessment_date}
                      </p>
                    ) : null}
                  </section>

                  <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                      Next best actions
                    </h3>
                    {selectedPriority.assessment.status === "missing" ? (
                      <>
                        <p className="mt-2 text-xs text-secondary">
                          Request your Educational Supervisor to complete the CiP assessment in
                          Kaizen, then re-sync with the Atlas extension.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/dashboard/entries?q=CiP+${selectedPriority.cipNumber}`}
                            className="btn-secondary text-xs"
                          >
                            View assessment entries
                          </Link>
                          <Link
                            href={`/dashboard/progress?view=overview&tab=cips&focus_cip=${selectedPriority.cipNumber}${selectedYear ? `&year=${encodeURIComponent(selectedYear)}` : ""}`}
                            className="btn-primary text-xs"
                          >
                            Open CiP progress
                          </Link>
                        </div>
                      </>
                    ) : selectedPriority.assessment.status === "on_track" ? (
                      <p className="mt-2 text-xs text-secondary">
                        This CiP assessment meets stage expectations. Keep evidence fresh in your
                        portfolio.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-xs text-secondary">
                          {selectedPriority.assessment.status_reason} Discuss with your Educational
                          Supervisor and update your development plan if needed.
                        </p>
                        <Link
                          href={`/dashboard/progress?view=overview&tab=cips&focus_cip=${selectedPriority.cipNumber}${selectedYear ? `&year=${encodeURIComponent(selectedYear)}` : ""}`}
                          className="btn-secondary mt-3 text-xs"
                        >
                          Review in CiP progress
                        </Link>
                      </>
                    )}
                  </section>
                </>
              ) : selectedPriority.kind === "procedure" ? (
                <>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    {selectedPriority.procedure.name}
                  </h2>
                  <p className="mt-1 text-small text-secondary">
                    Summative OSATS requirement due by {selectedPriority.procedure.required_by_stage}
                  </p>
                  {selectedPriority.procedure.complete ? (
                    <section className="mt-4 rounded-xl border border-accent-green/25 bg-accent-green/8 p-3.5">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-green">
                        Complete
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-xs text-secondary">
                        <li>
                          {selectedPriority.procedure.total_osats}/
                          {selectedPriority.procedure.osats_target} summative OSATS logged
                        </li>
                        <li>Consultant sign-off recorded</li>
                      </ul>
                      <Link href="/dashboard/requirements" className="btn-secondary mt-3 text-xs">
                        Open Requirements
                      </Link>
                    </section>
                  ) : (
                    <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                        What is missing
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-xs text-secondary">
                        <li>
                          {Math.max(
                            0,
                            selectedPriority.procedure.osats_target -
                              selectedPriority.procedure.total_osats,
                          )}{" "}
                          additional OSATS sign-off
                          {Math.max(
                            0,
                            selectedPriority.procedure.osats_target -
                              selectedPriority.procedure.total_osats,
                          ) === 1
                            ? ""
                            : "s"}{" "}
                          needed
                        </li>
                        {selectedPriority.procedure.consultant_osats < 1 ? (
                          <li>Consultant sign-off still required</li>
                        ) : null}
                      </ul>
                      <Link href="/dashboard/requirements" className="btn-secondary mt-3 text-xs">
                        Open Requirements
                      </Link>
                    </section>
                  )}

                  <section className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                      Counting entries
                    </h3>
                    <p className="mt-1 text-[11px] text-secondary">
                      Summative OSATS synced from ePortfolio that match this procedure.
                    </p>
                    <OsatsEntryList
                      entries={selectedPriority.procedure.osats_entries ?? []}
                    />
                  </section>
                </>
              ) : selectedPriority.kind === "course" ? (
                <>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    {selectedPriority.course.name}
                  </h2>
                  <p className="mt-1 text-small text-secondary">
                    Course requirement due by {selectedPriority.course.required_by_stage}
                  </p>
                  <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                      What is missing
                    </h3>
                    <p className="mt-2 text-xs text-secondary">
                      This course has not yet been completed in the current requirements scope.
                    </p>
                    <Link href="/dashboard/requirements" className="btn-secondary mt-3 text-xs">
                      Open Requirements
                    </Link>
                  </section>
                </>
              ) : (
                <>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    {selectedPriority.exam.name}
                  </h2>
                  <p className="mt-1 text-small text-secondary">
                    Exam requirement due by {selectedPriority.exam.required_by_stage}
                  </p>
                  <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                      What is missing
                    </h3>
                    <p className="mt-2 text-xs text-secondary">
                      This exam is still outstanding and should be treated as a formal progression requirement.
                    </p>
                    <Link href="/dashboard/requirements" className="btn-secondary mt-3 text-xs">
                      Open Requirements
                    </Link>
                  </section>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
