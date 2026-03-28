"use client";

import { useEffect, useState } from "react";

type Procedure = {
  id: string;
  name: string;
  category: string;
  required_by_stage: string;
  osats_target: number;
  total_osats: number;
  consultant_osats: number;
  complete: boolean;
};

type Course = {
  id: string;
  name: string;
  required_by_stage: string;
  complete: boolean;
};

type Exam = {
  evidence_type: string;
  name: string;
  required_by_stage: string;
  complete: boolean;
};

type RequirementsData = {
  procedures: Procedure[];
  courses: Course[];
  exams: Exam[];
  summary: {
    procedures_complete: number;
    procedures_total: number;
    courses_complete: number;
    courses_total: number;
    exams_complete: number;
    exams_total: number;
  };
  profile_stage?: {
    id: string;
    name: string;
    stage_group: string | null;
    sort_order: number | null;
  } | null;
  profile_working_pattern?: {
    working_percent: number;
    is_ltft: boolean;
    days_to_arcp_calendar: number | null;
    days_to_arcp_wte: number | null;
  } | null;
};

type TabId = "procedures" | "courses" | "exams";
type PrototypeId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
type ViewMode = "YEAR" | "BAND";
type YearScopeId = "CURRENT_YEAR" | "ST1" | "ST2" | "ST3" | "ST4" | "ST5" | "ST6" | "ST7";
type BandScopeId = "CURRENT_BAND" | "BAND_ST1_2" | "BAND_ST3_5" | "BAND_ST6_7";

type RequirementItem =
  | (Procedure & { kind: "procedures"; key: string })
  | (Course & { kind: "courses"; key: string })
  | (Exam & { kind: "exams"; key: string });
type PriorityBucket = "Now" | "Next" | "Later";

const STAGE_ORDER = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7"] as const;
type StageName = (typeof STAGE_ORDER)[number];

const STAGE_BANDS = [
  { id: "BAND_ST1_2" as const, label: "ST1-2", stages: ["ST1", "ST2"] },
  { id: "BAND_ST3_5" as const, label: "ST3-5", stages: ["ST3", "ST4", "ST5"] },
  { id: "BAND_ST6_7" as const, label: "ST6-7", stages: ["ST6", "ST7"] },
];
const YEAR_SCOPE_OPTIONS: YearScopeId[] = ["CURRENT_YEAR", ...STAGE_ORDER];
const BAND_SCOPE_OPTIONS: BandScopeId[] = ["CURRENT_BAND", "BAND_ST1_2", "BAND_ST3_5", "BAND_ST6_7"];

function isStageName(value: string | null | undefined): value is StageName {
  return typeof value === "string" && (STAGE_ORDER as readonly string[]).includes(value);
}

function stageRank(stage: string) {
  if (!isStageName(stage)) return 99;
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? 99 : index;
}

function getBandForStage(stageName: string | null): (typeof STAGE_BANDS)[number] | null {
  if (!isStageName(stageName)) return null;
  return STAGE_BANDS.find((band) => band.stages.includes(stageName)) ?? null;
}

function getStagesForYearScope(scope: YearScopeId, currentStageName: string | null): readonly string[] {
  if (scope === "CURRENT_YEAR") {
    if (!currentStageName) return STAGE_ORDER;
    return isStageName(currentStageName) ? [currentStageName] : STAGE_ORDER;
  }
  return [scope];
}

function getStagesForBandScope(scope: BandScopeId, currentStageName: string | null): readonly string[] {
  if (scope === "CURRENT_BAND") {
    const band = getBandForStage(currentStageName);
    return band ? band.stages : STAGE_ORDER;
  }
  const fixedBand = STAGE_BANDS.find((band) => band.id === scope);
  return fixedBand ? fixedBand.stages : STAGE_ORDER;
}

function yearScopeLabel(scope: YearScopeId, currentStageName: string | null) {
  if (scope === "CURRENT_YEAR") return `Current year${currentStageName ? ` (${currentStageName})` : ""}`;
  return scope;
}

function bandScopeLabel(scope: BandScopeId, currentBandLabel: string | null) {
  if (scope === "CURRENT_BAND") return `Current stage${currentBandLabel ? ` (${currentBandLabel})` : ""}`;
  if (scope === "BAND_ST1_2") return "ST1-2";
  if (scope === "BAND_ST3_5") return "ST3-5";
  return "ST6-7";
}

function OsatsDots({
  total,
  target,
  consultant,
}: {
  total: number;
  target: number;
  consultant: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: target }).map((_, i) => {
        const filled = i < total;
        const isConsultant = i < consultant;
        return (
          <span
            key={i}
            className="inline-block w-2.5 h-2.5 rounded-full border"
            style={{
              background: filled
                ? isConsultant
                  ? "var(--accent-blue)"
                  : "var(--accent-green)"
                : "var(--surface-4)",
              borderColor: filled
                ? isConsultant
                  ? "var(--accent-blue)"
                  : "var(--accent-green)"
                : "var(--border-emphasis)",
            }}
            title={
              filled
                ? isConsultant
                  ? "Consultant sign-off"
                  : "Sign-off"
                : "Pending"
            }
          />
        );
      })}
      <span className="text-[11px] ml-1" style={{ color: "var(--text-secondary)" }}>
        {total}/{target}
        {consultant > 0 && (
          <span
            className="ml-1"
            style={{ color: "var(--accent-blue)" }}
            title="Consultant sign-offs"
          >
            · {consultant} consultant
          </span>
        )}
      </span>
    </div>
  );
}

function OsatsCompleteness({
  total,
  target,
  consultant,
  compact = false,
}: {
  total: number;
  target: number;
  consultant: number;
  compact?: boolean;
}) {
  const clampedTotal = Math.min(total, target);
  const pct = target > 0 ? Math.round((clampedTotal / target) * 100) : 0;
  const consultantDone = consultant > 0;
  const osatsDone = clampedTotal >= target;
  const complete = osatsDone && consultantDone;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          OSATS {clampedTotal}/{target}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: consultantDone ? "rgba(22,163,74,0.12)" : "rgba(245,158,11,0.14)",
            color: consultantDone ? "var(--accent-green)" : "var(--accent-amber)",
            border: consultantDone
              ? "1px solid rgba(22,163,74,0.22)"
              : "1px solid rgba(245,158,11,0.24)",
          }}
        >
          {consultantDone ? "Consultant sign-off ✓" : "Consultant needed"}
        </span>
        {complete && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(22,163,74,0.12)",
              color: "var(--accent-green)",
              border: "1px solid rgba(22,163,74,0.22)",
            }}
          >
            Complete
          </span>
        )}
      </div>
      <div className={compact ? "h-1.5 rounded-full overflow-hidden" : "h-2 rounded-full overflow-hidden"} style={{ background: "var(--surface-4)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: complete
              ? "var(--accent-green)"
              : pct >= 66
                ? "var(--accent-blue)"
                : "var(--accent-amber)",
          }}
        />
      </div>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center justify-between text-[12px]"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>
          {value}/{total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-4)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: pct === 100 ? "var(--accent-green)" : "var(--accent-blue)",
          }}
        />
      </div>
    </div>
  );
}

function getTabItems(tab: TabId, data: RequirementsData): RequirementItem[] {
  if (tab === "procedures") {
    return data.procedures
      .map((p) => ({ ...p, kind: "procedures" as const, key: `proc-${p.id}` }))
      .sort((a, b) => {
        if (a.complete !== b.complete) return a.complete ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }

  if (tab === "courses") {
    return data.courses
      .map((c) => ({ ...c, kind: "courses" as const, key: `course-${c.id}` }))
      .sort((a, b) => {
        if (a.complete !== b.complete) return a.complete ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }

  return data.exams
    .map((e) => ({ ...e, kind: "exams" as const, key: `exam-${e.evidence_type}` }))
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

function getStatus(item: RequirementItem): { label: string; tone: "done" | "warn" | "pending" } {
  if (item.complete) return { label: "Done", tone: "done" };

  if (item.kind === "procedures") {
    const remainingOsats = Math.max(item.osats_target - item.total_osats, 0);
    const needsConsultant = item.consultant_osats < 1;

    if (remainingOsats === 0 && needsConsultant) {
      return { label: "Consultant sign-off needed", tone: "warn" };
    }

    if (remainingOsats > 0 && needsConsultant) {
      return { label: `${remainingOsats} OSATS + consultant needed`, tone: "warn" };
    }

    return { label: `${remainingOsats} OSATS remaining`, tone: "pending" };
  }

  return { label: "Pending in Kaizen", tone: "pending" };
}

function statusPillStyles(tone: "done" | "warn" | "pending") {
  if (tone === "done") {
    return {
      background: "rgba(22, 163, 74, 0.12)",
      color: "var(--accent-green)",
      border: "1px solid rgba(22, 163, 74, 0.24)",
    };
  }
  if (tone === "warn") {
    return {
      background: "rgba(245, 158, 11, 0.14)",
      color: "var(--accent-amber)",
      border: "1px solid rgba(245, 158, 11, 0.24)",
    };
  }
  return {
    background: "rgba(0, 113, 227, 0.11)",
    color: "var(--accent-blue)",
    border: "1px solid rgba(0, 113, 227, 0.20)",
  };
}

function proRataStatus(expectedByNowRaw: number | null, actualComplete: number): {
  tone: "done" | "warn" | "pending";
  label: string;
} | null {
  if (expectedByNowRaw === null) return null;
  if (expectedByNowRaw <= 0) {
    if (actualComplete > 0) return { tone: "done", label: "Ahead" };
    return { tone: "pending", label: "Not due yet" };
  }
  return actualComplete >= expectedByNowRaw
    ? { tone: "done", label: "On track" }
    : { tone: "warn", label: "Below expected" };
}

function tabGuidanceLabel(kind: RequirementItem["kind"]) {
  if (kind === "procedures") return "How to log OSATS";
  if (kind === "courses") return "How to log course";
  return "How to log exam";
}

function getAllItems(data: RequirementsData): RequirementItem[] {
  return [
    ...getTabItems("procedures", data),
    ...getTabItems("courses", data),
    ...getTabItems("exams", data),
  ];
}

function getHelpText(item: RequirementItem): string {
  if (item.kind === "procedures") {
    return `${item.name}: add or complete Summative OSATS in Kaizen. Requirement is ${item.osats_target} sign-offs including at least 1 consultant.`;
  }

  if (item.kind === "courses") {
    return `${item.name}: in Kaizen add this as Other Evidence and ensure the title/evidence type clearly matches the course name.`;
  }

  return `${item.name}: in Kaizen add MRCOG result as Other Evidence using the correct MRCOG evidence type.`;
}

function getDeadlineHint(requiredByStage: string, currentStageName: string | null): string {
  const requiredRank = stageRank(requiredByStage);
  const currentRank = currentStageName ? stageRank(currentStageName) : null;

  if (currentRank === null || requiredRank === 99) {
    return `Due by end of ${requiredByStage} year`;
  }

  if (requiredRank <= currentRank) {
    return `Due by current ARCP (${requiredByStage})`;
  }

  return `Due by end of ${requiredByStage} year`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function getDueByArcpLabel(requiredByStage: string): string {
  if (isStageName(requiredByStage)) return `Due by ${requiredByStage} ARCP`;
  return `Due by ${requiredByStage}`;
}

function priorityToneFromBucket(bucket: PriorityBucket): "done" | "warn" | "pending" {
  if (bucket === "Now") return "warn";
  if (bucket === "Next") return "pending";
  return "done";
}

function priorityWindowLabel(bucket: PriorityBucket): string {
  if (bucket === "Now") return "Current ARCP window";
  if (bucket === "Next") return "Upcoming ARCP window";
  return "Later ARCP window";
}

function requirementEffortUnits(item: RequirementItem): number {
  if (item.kind !== "procedures") return item.complete ? 0 : 1;
  const remainingOsats = Math.max(item.osats_target - item.total_osats, 0);
  const consultantGap = item.consultant_osats < 1 ? 1 : 0;
  return remainingOsats + consultantGap;
}

function priorityBucketRank(bucket: PriorityBucket): number {
  if (bucket === "Now") return 0;
  if (bucket === "Next") return 1;
  return 2;
}

function estimateWteDaysToStageDeadline(params: {
  item: RequirementItem;
  currentStageRank: number;
  wteDaysToArcp: number | null;
}): number | null {
  const { item, currentStageRank, wteDaysToArcp } = params;
  if (wteDaysToArcp === null) return null;
  const stageGap = Math.max(stageRank(item.required_by_stage) - currentStageRank, 0);
  // Approximate one stage-year as 365 WTE days.
  return wteDaysToArcp + stageGap * 365;
}

function resolvePriorityBucket(params: {
  item: RequirementItem;
  currentStageRank: number;
  daysToStageDeadlineWte: number | null;
}): PriorityBucket {
  const { item, currentStageRank, daysToStageDeadlineWte } = params;
  const stageGap = Math.max(stageRank(item.required_by_stage) - currentStageRank, 0);

  if (daysToStageDeadlineWte === null) {
    if (stageGap <= 0) return "Now";
    if (stageGap <= 2) return "Next";
    return "Later";
  }

  if (stageGap === 0) {
    if (daysToStageDeadlineWte <= 120) return "Now";
    if (daysToStageDeadlineWte <= 270) return "Next";
    return "Later";
  }

  if (stageGap === 1) {
    if (daysToStageDeadlineWte <= 90) return "Now";
    if (daysToStageDeadlineWte <= 540) return "Next";
    return "Later";
  }

  if (daysToStageDeadlineWte <= 540) return "Next";
  return "Later";
}

export default function RequirementsPage() {
  const [data, setData] = useState<RequirementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [prototypeId] = useState<PrototypeId>("P6");
  const [timelineStage, setTimelineStage] = useState<string | null>(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(true);
  const [showDueThisWindowOnly, setShowDueThisWindowOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [helpText, setHelpText] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("YEAR");
  const [yearScopeId, setYearScopeId] = useState<YearScopeId>("CURRENT_YEAR");
  const [bandScopeId, setBandScopeId] = useState<BandScopeId>("CURRENT_BAND");

  useEffect(() => {
    fetch("/api/requirements")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const currentStageName = data?.profile_stage?.name ?? null;
  const currentBand = getBandForStage(currentStageName);
  const workingPercent = data?.profile_working_pattern?.working_percent ?? 100;
  const isLtft = data?.profile_working_pattern?.is_ltft ?? workingPercent < 100;
  const calendarDaysToArcp = data?.profile_working_pattern?.days_to_arcp_calendar ?? null;
  const wteDaysToArcp = data?.profile_working_pattern?.days_to_arcp_wte ?? null;
  const currentStageRank = currentStageName ? stageRank(currentStageName) : 2;
  const stageAwarePriorityActive = wteDaysToArcp !== null && wteDaysToArcp > 0;
  const reviewYearElapsedFraction =
    calendarDaysToArcp === null ? null : clamp((365 - calendarDaysToArcp) / 365, 0, 1);
  const wteYearElapsedFraction =
    reviewYearElapsedFraction === null
      ? null
      : clamp(reviewYearElapsedFraction * (workingPercent / 100), 0, 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent"
          style={{
            borderColor: "var(--border-emphasis)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p style={{ color: "var(--accent-red)" }}>{error ?? "Failed to load requirements."}</p>
      </div>
    );
  }

  const scopeStages =
    viewMode === "YEAR"
      ? getStagesForYearScope(yearScopeId, currentStageName)
      : getStagesForBandScope(bandScopeId, currentStageName);
  const scopeSet = new Set(scopeStages);

  const scopedProcedures = data.procedures.filter((item) => scopeSet.has(item.required_by_stage));
  const scopedCourses = data.courses.filter((item) => scopeSet.has(item.required_by_stage));
  const scopedExams = data.exams.filter((item) => scopeSet.has(item.required_by_stage));

  const scopedSummary = {
    procedures_complete: scopedProcedures.filter((p) => p.complete).length,
    procedures_total: scopedProcedures.length,
    courses_complete: scopedCourses.filter((c) => c.complete).length,
    courses_total: scopedCourses.length,
    exams_complete: scopedExams.filter((e) => e.complete).length,
    exams_total: scopedExams.length,
  };

  function expectedRequirementContributionByNow(item: RequirementItem): number | null {
    if (wteYearElapsedFraction === null) return null;
    const requiredRank = stageRank(item.required_by_stage);
    if (requiredRank === 99) return null;
    if (requiredRank < currentStageRank) return 1;
    if (requiredRank === currentStageRank) return wteYearElapsedFraction;
    return 0;
  }

  const tabs = [
    {
      id: "procedures" as const,
      label: "Summative OSATS",
      complete: scopedSummary.procedures_complete,
      total: scopedSummary.procedures_total,
    },
    {
      id: "courses" as const,
      label: "Courses",
      complete: scopedSummary.courses_complete,
      total: scopedSummary.courses_total,
    },
    {
      id: "exams" as const,
      label: "Exams",
      complete: scopedSummary.exams_complete,
      total: scopedSummary.exams_total,
    },
  ];

  const activeTabSummary = activeTab ? tabs.find((t) => t.id === activeTab) ?? tabs[0] : null;
  const totalComplete =
    scopedSummary.procedures_complete + scopedSummary.courses_complete + scopedSummary.exams_complete;
  const totalCount =
    scopedSummary.procedures_total + scopedSummary.courses_total + scopedSummary.exams_total;
  const scopedAllItems = [
    ...scopedProcedures.map((p) => ({ ...p, kind: "procedures" as const, key: `scope-proc-${p.id}` })),
    ...scopedCourses.map((c) => ({ ...c, kind: "courses" as const, key: `scope-course-${c.id}` })),
    ...scopedExams.map((e) => ({ ...e, kind: "exams" as const, key: `scope-exam-${e.evidence_type}` })),
  ] satisfies RequirementItem[];

  const overallExpectedByNowRaw =
    wteYearElapsedFraction === null
      ? null
      : scopedAllItems.reduce((sum, item) => {
          const expected = expectedRequirementContributionByNow(item);
          return sum + (expected ?? 0);
        }, 0);
  const overallExpectedByNowThreshold =
    overallExpectedByNowRaw === null ? null : Math.ceil(overallExpectedByNowRaw);
  const overallOnTrack =
    overallExpectedByNowRaw === null ? null : totalComplete >= overallExpectedByNowRaw;
  const overallProRataStatus = proRataStatus(overallExpectedByNowRaw, totalComplete);

  const scopedActiveItems = activeTab
    ? scopedAllItems.filter((item) => item.kind === activeTab)
    : scopedAllItems;
  const activeCompleteCount = activeTabSummary ? activeTabSummary.complete : totalComplete;
  const activeExpectedByNowRaw =
    wteYearElapsedFraction === null
      ? null
      : scopedActiveItems.reduce((sum, item) => {
          const expected = expectedRequirementContributionByNow(item);
          return sum + (expected ?? 0);
        }, 0);
  const activeExpectedByNowThreshold =
    activeExpectedByNowRaw === null ? null : Math.ceil(activeExpectedByNowRaw);
  const activeOnTrack =
    activeExpectedByNowRaw === null ? null : activeCompleteCount >= activeExpectedByNowRaw;
  const activeProRataStatus = proRataStatus(activeExpectedByNowRaw, activeCompleteCount);

  const nextThree = [
    ...scopedProcedures
      .filter((p) => !p.complete)
      .map((p) => ({
        item: { ...p, kind: "procedures" as const, key: `next-proc-${p.id}` },
        stage: p.required_by_stage,
        label: p.name,
        type: "OSATS",
      })),
    ...scopedCourses
      .filter((c) => !c.complete)
      .map((c) => ({
        item: { ...c, kind: "courses" as const, key: `next-course-${c.id}` },
        stage: c.required_by_stage,
        label: c.name,
        type: "Course",
      })),
    ...scopedExams
      .filter((e) => !e.complete)
      .map((e) => ({
        item: { ...e, kind: "exams" as const, key: `next-exam-${e.evidence_type}` },
        stage: e.required_by_stage,
        label: e.name,
        type: "Exam",
      })),
  ]
    .map((entry) => {
      const status = getStatus(entry.item);
      const daysToStageDeadlineWte = stageAwarePriorityActive
        ? estimateWteDaysToStageDeadline({
            item: entry.item,
            currentStageRank,
            wteDaysToArcp,
          })
        : null;
      const bucket = resolvePriorityBucket({
        item: entry.item,
        currentStageRank,
        daysToStageDeadlineWte,
      });
      return {
        ...entry,
        status,
        bucket,
        effort: requirementEffortUnits(entry.item),
        daysToStageDeadlineWte,
        dueByLabel: getDueByArcpLabel(entry.stage),
        deadlineHint: getDeadlineHint(entry.stage, currentStageName),
      };
    })
    .filter((entry) => !showDueThisWindowOnly || entry.bucket === "Now")
    .sort((a, b) => {
      const bucketDiff = priorityBucketRank(a.bucket) - priorityBucketRank(b.bucket);
      if (bucketDiff !== 0) return bucketDiff;
      if (a.daysToStageDeadlineWte !== null && b.daysToStageDeadlineWte !== null) {
        const deadlineDiff = a.daysToStageDeadlineWte - b.daysToStageDeadlineWte;
        if (deadlineDiff !== 0) return deadlineDiff;
      }
      if (a.status.tone !== b.status.tone) return a.status.tone === "warn" ? -1 : 1;
      const effortDiff = a.effort - b.effort;
      if (effortDiff !== 0) return effortDiff;
      const stageDiff = stageRank(a.stage) - stageRank(b.stage);
      if (stageDiff !== 0) return stageDiff;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 3);

  const allTabItems = activeTab ? getTabItems(activeTab, data) : getAllItems(data);
  const scopedTabItems = allTabItems.filter((item) => scopeSet.has(item.required_by_stage));

  const q = query.trim().toLowerCase();
  const filteredItems = scopedTabItems.filter((item) => {
    const daysToStageDeadlineWte = stageAwarePriorityActive
      ? estimateWteDaysToStageDeadline({
          item,
          currentStageRank,
          wteDaysToArcp,
        })
      : null;
    const bucket = resolvePriorityBucket({
      item,
      currentStageRank,
      daysToStageDeadlineWte,
    });

    if (showDueThisWindowOnly && bucket !== "Now") return false;
    if (showIncompleteOnly && item.complete) return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const grouped = STAGE_ORDER.filter((stage) => scopeSet.has(stage))
    .map((stage) => {
      const stageItems = filteredItems.filter((item) => item.required_by_stage === stage);
      const pending = stageItems.filter((item) => !item.complete);
      const done = stageItems.filter((item) => item.complete);
      return { stage, pending, done, total: stageItems.length };
    })
    .filter((x) => x.total > 0);

  const boardItems = filteredItems.map((item) => {
    const status = getStatus(item);
    const daysToStageDeadlineWte = stageAwarePriorityActive
      ? estimateWteDaysToStageDeadline({
          item,
          currentStageRank,
          wteDaysToArcp,
        })
      : null;
    const bucket = item.complete
      ? null
      : resolvePriorityBucket({
          item,
          currentStageRank,
          daysToStageDeadlineWte,
        });
    return {
      item,
      status,
      bucket,
      effort: requirementEffortUnits(item),
      daysToStageDeadlineWte,
    };
  });
  const pendingRows = boardItems.filter((row) => !row.item.complete && row.bucket !== null);
  const boardNeedAction = pendingRows.filter((row) => row.bucket === "Now");
  const boardAlmostThere = pendingRows.filter((row) => row.bucket === "Next");
  const boardDone = boardItems.filter((row) => row.item.complete);

  const missionNow = pendingRows.filter((row) => row.bucket === "Now");
  const missionQuickWins = pendingRows.filter((row) => row.bucket === "Next" && row.effort <= 1);
  const missionCanWait = pendingRows.filter(
    (row) =>
      row.bucket === "Later" ||
      (row.bucket === "Next" && row.effort > 1),
  );

  const timelineFeed = pendingRows
    .map((row) => ({
      ...row,
      bucket: row.bucket as PriorityBucket,
      bucketRank: priorityBucketRank(row.bucket as PriorityBucket),
    }))
    .sort((a, b) => {
      if (a.bucketRank !== b.bucketRank) return a.bucketRank - b.bucketRank;
      if (a.daysToStageDeadlineWte !== null && b.daysToStageDeadlineWte !== null) {
        const deadlineDiff = a.daysToStageDeadlineWte - b.daysToStageDeadlineWte;
        if (deadlineDiff !== 0) return deadlineDiff;
      }
      if (a.status.tone !== b.status.tone) return a.status.tone === "warn" ? -1 : 1;
      const stageDiff = stageRank(a.item.required_by_stage) - stageRank(b.item.required_by_stage);
      if (stageDiff !== 0) return stageDiff;
      const effortDiff = a.effort - b.effort;
      if (effortDiff !== 0) return effortDiff;
      return a.item.name.localeCompare(b.item.name);
    });

  const tableRows = [...filteredItems].sort((a, b) => {
    if (!a.complete && !b.complete) {
      const statusA = getStatus(a);
      const statusB = getStatus(b);
      const daysToStageDeadlineA = stageAwarePriorityActive
        ? estimateWteDaysToStageDeadline({
            item: a,
            currentStageRank,
            wteDaysToArcp,
          })
        : null;
      const daysToStageDeadlineB = stageAwarePriorityActive
        ? estimateWteDaysToStageDeadline({
            item: b,
            currentStageRank,
            wteDaysToArcp,
          })
        : null;
      const bucketA = resolvePriorityBucket({
        item: a,
        currentStageRank,
        daysToStageDeadlineWte: daysToStageDeadlineA,
      });
      const bucketB = resolvePriorityBucket({
        item: b,
        currentStageRank,
        daysToStageDeadlineWte: daysToStageDeadlineB,
      });
      const bucketDiff = priorityBucketRank(bucketA) - priorityBucketRank(bucketB);
      if (bucketDiff !== 0) return bucketDiff;
      if (daysToStageDeadlineA !== null && daysToStageDeadlineB !== null) {
        const deadlineDiff = daysToStageDeadlineA - daysToStageDeadlineB;
        if (deadlineDiff !== 0) return deadlineDiff;
      }
      if (statusA.tone !== statusB.tone) return statusA.tone === "warn" ? -1 : 1;
      const effortDiff = requirementEffortUnits(a) - requirementEffortUnits(b);
      if (effortDiff !== 0) return effortDiff;
    }
    const stageDiff = stageRank(a.required_by_stage) - stageRank(b.required_by_stage);
    if (stageDiff !== 0) return stageDiff;
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const previewItem = tableRows.find((item) => item.key === previewKey) ?? tableRows[0] ?? null;
  const previewStatus = previewItem ? getStatus(previewItem) : null;
  const previewPriorityBucket =
    previewItem && !previewItem.complete
      ? resolvePriorityBucket({
          item: previewItem,
          currentStageRank,
          daysToStageDeadlineWte: stageAwarePriorityActive
            ? estimateWteDaysToStageDeadline({
                item: previewItem,
                currentStageRank,
                wteDaysToArcp,
              })
            : null,
        })
      : null;

  const timelineStages = STAGE_ORDER.filter((stage) => scopeSet.has(stage));
  const effectiveTimelineStage =
    timelineStage && timelineStages.includes(timelineStage as (typeof STAGE_ORDER)[number])
      ? timelineStage
      : timelineStages[0] ?? null;
  const timelineItems = effectiveTimelineStage
    ? filteredItems.filter((item) => item.required_by_stage === effectiveTimelineStage)
    : [];
  const timelinePending = timelineItems.filter((item) => !item.complete);
  const timelineDone = timelineItems.filter((item) => item.complete);

  const bandScopeCounts: Record<BandScopeId, number> = {
    CURRENT_BAND: allTabItems.filter((item) =>
      new Set(getStagesForBandScope("CURRENT_BAND", currentStageName)).has(item.required_by_stage),
    ).length,
    BAND_ST1_2: allTabItems.filter((item) =>
      new Set(getStagesForBandScope("BAND_ST1_2", currentStageName)).has(item.required_by_stage),
    ).length,
    BAND_ST3_5: allTabItems.filter((item) =>
      new Set(getStagesForBandScope("BAND_ST3_5", currentStageName)).has(item.required_by_stage),
    ).length,
    BAND_ST6_7: allTabItems.filter((item) =>
      new Set(getStagesForBandScope("BAND_ST6_7", currentStageName)).has(item.required_by_stage),
    ).length,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5 animate-fade-up">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Requirements
        </h1>
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          Progress is scoped to your selected stage view, not all ST1-ST7.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span
            className="px-2 py-1 rounded-full"
            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
          >
            Current year: {currentStageName ?? "Not set"}
          </span>
          <span
            className="px-2 py-1 rounded-full"
            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
          >
            Current stage band: {currentBand?.label ?? "Not set"}
          </span>
          <span
            className="px-2 py-1 rounded-full"
            style={{ background: "rgba(0,113,227,0.12)", color: "var(--accent-blue)" }}
          >
            Viewing:{" "}
            {viewMode === "YEAR"
              ? yearScopeLabel(yearScopeId, currentStageName)
              : bandScopeLabel(bandScopeId, currentBand?.label ?? null)}
          </span>
          <span
            className="px-2 py-1 rounded-full"
            style={{
              background: isLtft ? "rgba(245,158,11,0.15)" : "var(--surface-3)",
              color: isLtft ? "var(--accent-amber)" : "var(--text-secondary)",
            }}
          >
            {isLtft ? `LTFT: ${workingPercent}% WTE` : "Working pattern: 100%"}
          </span>
          {isLtft && stageAwarePriorityActive && (
            <span
              className="px-2 py-1 rounded-full"
              style={{ background: "rgba(0,113,227,0.12)", color: "var(--accent-blue)" }}
            >
              Priority mode: LTFT + ARCP ({wteDaysToArcp} WTE days)
            </span>
          )}
          <span
            className="px-2 py-1 rounded-full"
            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
          >
            Deadlines are ARCP-based (e.g. ST2 items due by ST2 ARCP)
          </span>
          {isLtft && !stageAwarePriorityActive && (
            <span
              className="px-2 py-1 rounded-full"
              style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
            >
              Add ARCP date to enable LTFT priority mode
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="card p-4 space-y-2">
          <p className="text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Overall progress
          </p>
          <ProgressBar value={totalComplete} total={totalCount} />
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {overallExpectedByNowThreshold === null ? (
              <span style={{ color: "var(--text-muted)" }}>
                Add ARCP date to calculate pro-rata expected completion.
              </span>
            ) : (
              <span>
                Pro-rata expected by now:{" "}
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {overallExpectedByNowThreshold}
                </span>{" "}
                · Actual:{" "}
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {totalComplete}
                </span>{" "}
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={statusPillStyles(
                    overallProRataStatus ? overallProRataStatus.tone : overallOnTrack ? "done" : "warn",
                  )}
                >
                  {overallProRataStatus ? overallProRataStatus.label : overallOnTrack ? "On track" : "Below expected"}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <p className="text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Current focus
          </p>
          <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
            {activeTabSummary ? activeTabSummary.label : "All requirement types"}
          </p>
          <ProgressBar
            value={activeTabSummary ? activeTabSummary.complete : totalComplete}
            total={activeTabSummary ? activeTabSummary.total : totalCount}
          />
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {activeExpectedByNowThreshold === null ? (
              <span style={{ color: "var(--text-muted)" }}>
                Pro-rata checkpoint unavailable without ARCP date.
              </span>
            ) : (
              <span>
                Pro-rata expected by now:{" "}
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {activeExpectedByNowThreshold}
                </span>{" "}
                · Actual:{" "}
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {activeCompleteCount}
                </span>{" "}
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={statusPillStyles(
                    activeProRataStatus ? activeProRataStatus.tone : activeOnTrack ? "done" : "warn",
                  )}
                >
                  {activeProRataStatus ? activeProRataStatus.label : activeOnTrack ? "On track" : "Below expected"}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <p className="text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Next 3 actions
          </p>
          {nextThree.length > 0 ? (
            <div className="space-y-2">
              {nextThree.map((item) => (
                <div
                  key={`${item.stage}-${item.type}-${item.label}`}
                  className="rounded-lg border px-2.5 py-2"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={statusPillStyles(priorityToneFromBucket(item.bucket))}
                    >
                      {item.dueByLabel}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
                    >
                      {item.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] font-medium leading-5" style={{ color: "var(--text-primary)" }}>
                    {item.label}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {item.status.label}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--accent-green)" }}>
              All requirements in this scope are complete.
            </p>
          )}
        </div>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setActiveTab(null);
              setHelpText(null);
            }}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition"
            style={
              activeTab === null
                ? {
                    background: "var(--surface-2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-emphasis)",
                  }
                : {
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid transparent",
                  }
            }
          >
            All
          </button>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab((prev) => (prev === tab.id ? null : tab.id));
                  setHelpText(null);
                }}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition"
                style={
                  isActive
                    ? {
                        background: "var(--surface-2)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-emphasis)",
                      }
                    : {
                        background: "transparent",
                        color: "var(--text-secondary)",
                        border: "1px solid transparent",
                      }
                }
              >
                {tab.label}
                <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                  {tab.complete}/{tab.total}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowIncompleteOnly((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition"
            style={
              showIncompleteOnly
                ? {
                    background: "rgba(0, 113, 227, 0.12)",
                    color: "var(--accent-blue)",
                    border: "1px solid rgba(0, 113, 227, 0.22)",
                  }
                : {
                    background: "var(--surface-2)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-subtle)",
                  }
            }
          >
            Incomplete only
          </button>

          <button
            onClick={() => setShowDueThisWindowOnly((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition"
            style={
              showDueThisWindowOnly
                ? {
                    background: "rgba(245, 158, 11, 0.14)",
                    color: "var(--accent-amber)",
                    border: "1px solid rgba(245, 158, 11, 0.24)",
                  }
                : {
                    background: "var(--surface-2)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-subtle)",
                  }
            }
          >
            Due this ARCP window
          </button>

          <div className="grid gap-2 md:grid-cols-2 flex-1">
            <div
              className="rounded-lg p-2 space-y-1.5"
              style={{
                border:
                  viewMode === "YEAR"
                    ? "1px solid rgba(0,113,227,0.24)"
                    : "1px solid var(--border-subtle)",
                background:
                  viewMode === "YEAR" ? "rgba(0,113,227,0.06)" : "var(--surface-2)",
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Year picker
                </p>
                <button
                  onClick={() => setViewMode("YEAR")}
                  className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: viewMode === "YEAR" ? "rgba(0,113,227,0.14)" : "var(--surface-3)",
                    color: viewMode === "YEAR" ? "var(--accent-blue)" : "var(--text-muted)",
                  }}
                >
                  {viewMode === "YEAR" ? "Active" : "Use"}
                </button>
              </div>
              <select
                value={yearScopeId}
                onChange={(e) => {
                  setYearScopeId(e.target.value as YearScopeId);
                  setViewMode("YEAR");
                }}
                className="w-full rounded-md px-2 py-1 text-[12px]"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {YEAR_SCOPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {yearScopeLabel(option, currentStageName)}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="rounded-lg p-2 space-y-1.5"
              style={{
                border:
                  viewMode === "BAND"
                    ? "1px solid rgba(0,113,227,0.24)"
                    : "1px solid var(--border-subtle)",
                background:
                  viewMode === "BAND" ? "rgba(0,113,227,0.06)" : "var(--surface-2)",
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Stage band picker
                </p>
                <button
                  onClick={() => setViewMode("BAND")}
                  className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: viewMode === "BAND" ? "rgba(0,113,227,0.14)" : "var(--surface-3)",
                    color: viewMode === "BAND" ? "var(--accent-blue)" : "var(--text-muted)",
                  }}
                >
                  {viewMode === "BAND" ? "Active" : "Use"}
                </button>
              </div>
              <select
                value={bandScopeId}
                onChange={(e) => {
                  setBandScopeId(e.target.value as BandScopeId);
                  setViewMode("BAND");
                }}
                className="w-full rounded-md px-2 py-1 text-[12px]"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {BAND_SCOPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {bandScopeLabel(option, currentBand?.label ?? null)} · {bandScopeCounts[option]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ml-auto min-w-[220px] flex-1 sm:flex-none">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search requirement"
              className="w-full rounded-lg px-3 py-1.5 text-[13px]"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>
        </div>
      </div>

      {helpText && (
        <div
          className="card p-3 flex items-start justify-between gap-3"
          style={{ borderColor: "rgba(0, 113, 227, 0.25)" }}
        >
          <p className="text-[13px] leading-5" style={{ color: "var(--text-secondary)" }}>
            {helpText}
          </p>
          <button
            onClick={() => setHelpText(null)}
            className="px-2 py-1 rounded text-[11px]"
            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
          >
            Close
          </button>
        </div>
      )}

      {prototypeId === "P1" && (
        <div className="space-y-4">
          {grouped.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No requirements match this filter.
              </p>
            </div>
          )}

          {grouped.map(({ stage, pending, done }) => (
            <section key={stage} className="card overflow-hidden">
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <h2 className="text-[13px] font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
                  {stage}
                </h2>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span>{pending.length} pending</span>
                  {!showIncompleteOnly && <span>{done.length} done</span>}
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {pending.map((item) => {
                  const status = getStatus(item);
                  return (
                    <div key={item.key} className="px-4 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                            {item.name}
                          </p>
                          <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles(status.tone)}>
                            {status.label}
                          </span>
                        </div>
                        {item.kind === "procedures" && (
                          <div className="mt-1">
                            <OsatsDots
                              total={item.total_osats}
                              target={item.osats_target}
                              consultant={item.consultant_osats}
                            />
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setHelpText(getHelpText(item))}
                        className="btn-secondary !px-3 !py-1.5 !text-[12px]"
                      >
                        {tabGuidanceLabel(item.kind)}
                      </button>
                    </div>
                  );
                })}

                {!showIncompleteOnly && done.length > 0 && (
                  <details>
                    <summary
                      className="px-4 py-3 text-[12px] cursor-pointer"
                      style={{ color: "var(--text-secondary)", background: "var(--surface-1)" }}
                    >
                      Done ({done.length})
                    </summary>
                    <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                      {done.map((item) => (
                        <div key={item.key} className="px-4 py-3 flex items-center gap-3">
                          <p className="text-[13px] flex-1" style={{ color: "var(--text-secondary)" }}>
                            {item.name}
                          </p>
                          <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles("done")}>
                            Done
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {prototypeId === "P2" && (
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              title: "Needs action",
              rows: boardNeedAction,
              tone: "pending" as const,
              empty: "No urgent items in this scope.",
            },
            {
              title: "Almost there",
              rows: boardAlmostThere,
              tone: "warn" as const,
              empty: "Nothing in almost-there state.",
            },
            {
              title: "Done",
              rows: boardDone,
              tone: "done" as const,
              empty: showIncompleteOnly ? "Hidden by Incomplete only filter." : "No completed items yet.",
            },
          ].map((column) => (
            <section key={column.title} className="card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {column.title}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={statusPillStyles(column.tone)}>
                  {column.rows.length}
                </span>
              </div>

              {column.rows.length === 0 && (
                <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}>
                  {column.empty}
                </div>
              )}

              {column.rows.map(({ item, status }) => (
                <article
                  key={item.key}
                  className="rounded-lg border p-3 space-y-2"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                        {item.name}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {item.required_by_stage}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap" style={statusPillStyles(status.tone)}>
                      {status.label}
                    </span>
                  </div>

                  {item.kind === "procedures" && (
                    <OsatsDots
                      total={item.total_osats}
                      target={item.osats_target}
                      consultant={item.consultant_osats}
                    />
                  )}

                  {!item.complete && (
                    <button
                      onClick={() => setHelpText(getHelpText(item))}
                      className="btn-secondary !px-3 !py-1.5 !text-[11px]"
                    >
                      {tabGuidanceLabel(item.kind)}
                    </button>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {prototypeId === "P3" && (
        <div className="space-y-3">
          <div className="card p-3">
            <div className="flex flex-wrap gap-1.5">
              {timelineStages.map((stage) => {
                const active = effectiveTimelineStage === stage;
                const stageCount = filteredItems.filter((item) => item.required_by_stage === stage).length;
                return (
                  <button
                    key={stage}
                    onClick={() => setTimelineStage(stage)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                    style={{
                      border: active ? "1px solid rgba(0,113,227,0.28)" : "1px solid var(--border-subtle)",
                      background: active ? "rgba(0,113,227,0.10)" : "var(--surface-2)",
                      color: active ? "var(--accent-blue)" : "var(--text-secondary)",
                    }}
                  >
                    {stage} · {stageCount}
                  </button>
                );
              })}
            </div>
          </div>

          {!effectiveTimelineStage && (
            <div className="card p-6 text-center">
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No stages available for the selected scope.
              </p>
            </div>
          )}

          {effectiveTimelineStage && (
            <section className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {effectiveTimelineStage}
                </h3>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {timelinePending.length} pending · {!showIncompleteOnly ? `${timelineDone.length} done` : "done hidden"}
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {timelinePending.length === 0 && (
                  <div className="px-4 py-4 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    No pending requirements in this stage.
                  </div>
                )}

                {timelinePending.map((item) => {
                  const status = getStatus(item);
                  return (
                    <div key={item.key} className="px-4 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                            {item.name}
                          </p>
                          <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles(status.tone)}>
                            {status.label}
                          </span>
                        </div>
                        {item.kind === "procedures" && (
                          <div className="mt-1">
                            <OsatsDots
                              total={item.total_osats}
                              target={item.osats_target}
                              consultant={item.consultant_osats}
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setHelpText(getHelpText(item))}
                        className="btn-secondary !px-3 !py-1.5 !text-[12px]"
                      >
                        {tabGuidanceLabel(item.kind)}
                      </button>
                    </div>
                  );
                })}

                {!showIncompleteOnly && timelineDone.length > 0 && (
                  <details>
                    <summary
                      className="px-4 py-3 text-[12px] cursor-pointer"
                      style={{ color: "var(--text-secondary)", background: "var(--surface-1)" }}
                    >
                      Done ({timelineDone.length})
                    </summary>
                    <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                      {timelineDone.map((item) => (
                        <div key={item.key} className="px-4 py-3 flex items-center gap-3">
                          <p className="text-[13px] flex-1" style={{ color: "var(--text-secondary)" }}>
                            {item.name}
                          </p>
                          <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles("done")}>
                            Done
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {prototypeId === "P4" && (
        <div className="space-y-4">
          <section
            className="rounded-2xl border p-5"
            style={{
              borderColor: "rgba(0,113,227,0.25)",
              background:
                "linear-gradient(145deg, rgba(0,113,227,0.16), rgba(0,113,227,0.05) 48%, rgba(245,158,11,0.07) 100%)",
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-secondary)" }}>
              Mission Control
            </p>
            <h3 className="mt-1 text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Prioritize by impact, not by list order
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { label: "Do now", value: missionNow.length, tone: "warn" as const },
                { label: "Quick wins", value: missionQuickWins.length, tone: "pending" as const },
                { label: "Can wait", value: missionCanWait.length, tone: "done" as const },
              ].map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-xl border px-3 py-2"
                  style={{
                    borderColor: "rgba(255,255,255,0.35)",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {tile.label}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      {tile.value}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={statusPillStyles(tile.tone)}>
                      active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            {[
              {
                title: "Do now",
                subtitle: "Critical for your current progression",
                rows: missionNow,
                empty: "No immediate actions.",
                tone: "warn" as const,
              },
              {
                title: "Quick wins",
                subtitle: "Fast to close and boost confidence",
                rows: missionQuickWins,
                empty: "No quick wins right now.",
                tone: "pending" as const,
              },
              {
                title: "Can wait",
                subtitle: "Later-stage tasks",
                rows: missionCanWait,
                empty: "No deferred items.",
                tone: "done" as const,
              },
            ].map((column) => (
              <section key={column.title} className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      {column.title}
                    </h3>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {column.subtitle}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={statusPillStyles(column.tone)}>
                    {column.rows.length}
                  </span>
                </div>

                {column.rows.length === 0 && (
                  <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}>
                    {column.empty}
                  </div>
                )}

                {column.rows.map(({ item, status }) => (
                  <article
                    key={item.key}
                    className="rounded-lg border p-3 space-y-2"
                    style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {item.name}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {item.required_by_stage}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {getDeadlineHint(item.required_by_stage, currentStageName)}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap" style={statusPillStyles(status.tone)}>
                        {status.label}
                      </span>
                    </div>
                    {item.kind === "procedures" && (
                      <OsatsDots
                        total={item.total_osats}
                        target={item.osats_target}
                        consultant={item.consultant_osats}
                      />
                    )}
                    <button
                      onClick={() => setHelpText(getHelpText(item))}
                      className="btn-secondary !px-3 !py-1.5 !text-[11px]"
                    >
                      {tabGuidanceLabel(item.kind)}
                    </button>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}

      {prototypeId === "P5" && (
        <div className="space-y-3">
          <section className="card p-4">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Action Timeline
            </h3>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              One continuous feed from immediate priorities to later-stage planning.
            </p>
            <div className="mt-4 relative">
              <div
                aria-hidden
                className="absolute left-[11px] top-0 bottom-0 w-px"
                style={{ background: "var(--border-subtle)" }}
              />

              {timelineFeed.length === 0 && (
                <div className="pl-8 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  No pending items in this scope.
                </div>
              )}

              {timelineFeed.map(({ item, status, bucket }, index) => {
                const prevBucket = index > 0 ? timelineFeed[index - 1]?.bucket : null;
                const showBucketHeader = bucket !== prevBucket;
                const bucketTone = priorityToneFromBucket(bucket);
                return (
                  <div key={item.key} className="relative pl-8 pb-4">
                    {showBucketHeader && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles(bucketTone)}>
                          {priorityWindowLabel(bucket)}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Stage-based urgency
                        </span>
                      </div>
                    )}

                    <span
                      className="absolute left-[7px] top-1 block h-[9px] w-[9px] rounded-full border-2"
                      style={{
                        background:
                          status.tone === "warn"
                            ? "var(--accent-amber)"
                            : status.tone === "pending"
                              ? "var(--accent-blue)"
                              : "var(--accent-green)",
                        borderColor: "var(--surface-2)",
                      }}
                    />

                    <article
                      className="rounded-xl border p-3 space-y-2"
                      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                          {item.name}
                        </p>
                        <span className="px-2 py-0.5 text-[10px] rounded-full" style={statusPillStyles(status.tone)}>
                          {status.label}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {item.required_by_stage}
                        </span>
                      </div>
                      {item.kind === "procedures" && (
                        <OsatsDots
                          total={item.total_osats}
                          target={item.osats_target}
                          consultant={item.consultant_osats}
                        />
                      )}
                      <button
                        onClick={() => setHelpText(getHelpText(item))}
                        className="btn-secondary !px-3 !py-1.5 !text-[11px]"
                      >
                        {tabGuidanceLabel(item.kind)}
                      </button>
                    </article>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {prototypeId === "P6" && (
        <section className="grid gap-3 xl:grid-cols-[1.35fr,1fr]">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Queue
                </h3>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Click any row to inspect and act
                </p>
              </div>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {tableRows.length} items
              </span>
            </div>
            <div className="max-h-[520px] overflow-auto divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {tableRows.length === 0 && (
                <div className="px-4 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  No requirements match this filter.
                </div>
              )}
              {tableRows.map((item) => {
                const status = getStatus(item);
                const active = previewItem?.key === item.key;
                const genericPct = item.complete ? 100 : 0;
                const itemDaysToStageDeadlineWte = stageAwarePriorityActive
                  ? estimateWteDaysToStageDeadline({
                      item,
                      currentStageRank,
                      wteDaysToArcp,
                    })
                  : null;
                const itemPriorityBucket = resolvePriorityBucket({
                  item,
                  currentStageRank,
                  daysToStageDeadlineWte: itemDaysToStageDeadlineWte,
                });
                return (
                  <button
                    key={item.key}
                    onClick={() => setPreviewKey(item.key)}
                    className="w-full text-left px-4 py-3 transition"
                    style={{
                      background: active ? "rgba(0,113,227,0.08)" : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {item.name}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
                          >
                            {getDueByArcpLabel(item.required_by_stage)}
                          </span>
                          {!item.complete && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={statusPillStyles(priorityToneFromBucket(itemPriorityBucket))}
                            >
                              {priorityWindowLabel(itemPriorityBucket)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-[150px] shrink-0 sm:w-[180px]">
                        {item.kind === "procedures" ? (
                          <OsatsCompleteness
                            total={item.total_osats}
                            target={item.osats_target}
                            consultant={item.consultant_osats}
                            compact
                          />
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-secondary)" }}>
                              <span>{status.label}</span>
                              <span>{genericPct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-4)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${genericPct}%`,
                                  background: item.complete ? "var(--accent-green)" : "var(--accent-amber)",
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="card p-4 space-y-3 xl:sticky xl:top-20 h-fit">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Detail Preview
            </h3>
            {!previewItem && (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Select a requirement from the queue.
              </p>
            )}
            {previewItem && previewStatus && (
              <>
                <div className="space-y-1">
                  <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {previewItem.name}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}>
                      {getDueByArcpLabel(previewItem.required_by_stage)}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={statusPillStyles(previewStatus.tone)}>
                      {previewStatus.label}
                    </span>
                    {previewPriorityBucket && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={statusPillStyles(priorityToneFromBucket(previewPriorityBucket))}>
                        {priorityWindowLabel(previewPriorityBucket)}
                      </span>
                    )}
                  </div>
                </div>
                {previewItem.kind === "procedures" && (
                  <div className="rounded-lg p-3" style={{ background: "var(--surface-1)" }}>
                    <p className="text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>
                      Completion status
                    </p>
                    <OsatsCompleteness
                      total={previewItem.total_osats}
                      target={previewItem.osats_target}
                      consultant={previewItem.consultant_osats}
                    />
                    <div className="mt-2">
                      <OsatsDots
                        total={previewItem.total_osats}
                        target={previewItem.osats_target}
                        consultant={previewItem.consultant_osats}
                      />
                    </div>
                  </div>
                )}
                <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--surface-1)", color: "var(--text-secondary)" }}>
                  {getHelpText(previewItem)}
                </div>
                {!previewItem.complete && (
                  <button
                    onClick={() => setHelpText(getHelpText(previewItem))}
                    className="btn-secondary !px-3 !py-1.5 !text-[11px]"
                  >
                    {tabGuidanceLabel(previewItem.kind)}
                  </button>
                )}
              </>
            )}
          </aside>
        </section>
      )}

      <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Data source: synced Kaizen entries. Percentages and task list follow the selected stage scope
        {isLtft
          ? ` with LTFT profile setting (${workingPercent}% WTE${calendarDaysToArcp != null && wteDaysToArcp != null ? `, ${wteDaysToArcp} WTE days / ${calendarDaysToArcp} calendar days to ARCP` : ""}).`
          : "."}
      </div>
    </div>
  );
}
