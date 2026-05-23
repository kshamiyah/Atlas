import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { calculateArcpCountdown } from "@/lib/profile/ltft";
import {
  getStageGroupForStage,
  normalizeStageName,
  resolveStageContext,
  stageRank,
  stagesUpTo,
} from "@/lib/profile/stage";
import {
  calculateKeySkillsProRataCheckpoint,
  calculateProRataProgress,
} from "@/lib/profile/ltft-pro-rata";
import { buildOsatsCountsByProcedure } from "@/lib/requirements/osats-evidence";

// Expected CiP entrustability level by stage (from RCOG Table 4)
const EXPECTED_LEVEL_BY_STAGE: Record<string, number> = {
  ST1: 1,
  ST2: 2,
  ST3: 3,
  ST4: 3,
  ST5: 4,
  ST6: 5,
  ST7: 5,
};

const CONSULTANT_ROLE_ID = 597;

const EXAM_EVIDENCE_TYPES: Record<string, { name: string; required_by_stage: string }> = {
  "474": { name: "MRCOG Part 1", required_by_stage: "ST2" },
  "473": { name: "MRCOG Part 2", required_by_stage: "ST5" },
  "472": { name: "MRCOG Part 3", required_by_stage: "ST5" },
};

// Waypoint hard gate requirements
const WAYPOINT_STAGES = new Set(["ST2", "ST5"]);

type ProjectionStatus = "done" | "on_track" | "watch" | "at_risk";
type ProjectionPillarKey = "key_skills" | "osats" | "courses" | "exams";
type PredictedOutcome = 1 | 2 | 3 | 4 | 5;

const BASE_CAPACITY_PER_MONTH: Record<ProjectionPillarKey, number> = {
  key_skills: 8,
  osats: 2.5,
  courses: 1,
  exams: 0.35,
};

function buildPillarProjection(params: {
  key: ProjectionPillarKey;
  label: string;
  complete: number;
  total: number;
  monthsLeftWte: number | null;
}) {
  const { key, label, complete, total, monthsLeftWte } = params;
  const remaining = Math.max(total - complete, 0);
  // monthsLeftWte already accounts for LTFT percentage. Keep capacity at FTE
  // to avoid applying LTFT scaling twice.
  const capacityPerMonth = Number(BASE_CAPACITY_PER_MONTH[key].toFixed(2));

  if (remaining === 0) {
    return {
      key,
      label,
      status: "done" as ProjectionStatus,
      complete,
      total,
      remaining: 0,
      required_per_month: 0,
      capacity_per_month: capacityPerMonth,
      eta_wte_days: 0,
      on_track: true,
    };
  }

  if (monthsLeftWte === null || monthsLeftWte <= 0 || capacityPerMonth <= 0) {
    return {
      key,
      label,
      status: "at_risk" as ProjectionStatus,
      complete,
      total,
      remaining,
      required_per_month: null,
      capacity_per_month: capacityPerMonth,
      eta_wte_days: null,
      on_track: false,
    };
  }

  const requiredPerMonth = remaining / monthsLeftWte;
  const ratio = requiredPerMonth / capacityPerMonth;
  const etaWteDays = Math.ceil((remaining / capacityPerMonth) * 30);

  let status: ProjectionStatus = "on_track";
  if (ratio > 1.15) status = "at_risk";
  else if (ratio > 0.8) status = "watch";

  return {
    key,
    label,
    status,
    complete,
    total,
    remaining,
    required_per_month: Number(requiredPerMonth.toFixed(2)),
    capacity_per_month: capacityPerMonth,
    eta_wte_days: etaWteDays,
    on_track: status === "on_track",
  };
}

function mapSeverityScoreToOutcome(score: number): Exclude<PredictedOutcome, 5> {
  if (score >= 7) return 4;
  if (score >= 4) return 3;
  if (score >= 1) return 2;
  return 1;
}

export async function GET(request: Request) {
  const supabase = await getServerSupabaseClient();
  const authHeader = request.headers.get("Authorization");

  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Profile ────────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_stage_id, current_grade, arcp_date, working_percent")
    .eq("id", userId)
    .maybeSingle();

  let stageFromProfileId: string | null = null;
  let stageRows:
    | Array<{ id: string; name: string; stage_group: string | null }>
    | null = null;
  if (profile?.current_stage_id) {
    const [{ data: stage }, { data: allStages }] = await Promise.all([
      supabase
      .from("stages")
      .select("name")
      .eq("id", profile.current_stage_id)
      .maybeSingle(),
      supabase.from("stages").select("id, name, stage_group"),
    ]);
    stageFromProfileId = stage?.name ?? null;
    stageRows = (allStages ?? []) as Array<{
      id: string;
      name: string;
      stage_group: string | null;
    }>;
  }

  const currentStage = normalizeStageName(stageFromProfileId ?? profile?.current_grade ?? null);
  if (!stageRows && currentStage) {
    const { data: allStages } = await supabase
      .from("stages")
      .select("id, name, stage_group");
    stageRows = (allStages ?? []) as Array<{
      id: string;
      name: string;
      stage_group: string | null;
    }>;
  }
  const stageContext = resolveStageContext({
    selectedStageId: profile?.current_stage_id ?? null,
    selectedStageName: currentStage,
    stageRows: stageRows ?? undefined,
  });
  const arcpDate = profile?.arcp_date ?? null;
  const arcp = calculateArcpCountdown(arcpDate, profile?.working_percent ?? 100);

  const relevantStages = currentStage ? stagesUpTo(currentStage) : null;
  const isWaypoint = currentStage ? WAYPOINT_STAGES.has(currentStage) : false;
  const expectedLevel = currentStage ? (EXPECTED_LEVEL_BY_STAGE[currentStage] ?? null) : null;

  // ── Key skills ─────────────────────────────────────────────────────────────
  const [{ data: keySkillsCatalog }, { data: confirmedSkillRows }] =
    await Promise.all([
      supabase.from("key_skills").select("id"),
      (async () => {
        let scopedEntryIds: string[] | null = null;
        if (stageContext.curriculumStageIds.length > 0) {
          const { data: scopedEntries } = await supabase
            .from("key_skill_review_entries")
            .select("id")
            .eq("user_id", userId)
            .in("stage_id", stageContext.curriculumStageIds);
          scopedEntryIds = (scopedEntries ?? []).map((row: { id: string }) => row.id);
        }

        let query = supabase
          .from("key_skill_review_suggestions")
          .select("key_skill_id, review_entry_id")
          .eq("user_id", userId)
          .eq("status", "confirmed");

        if (scopedEntryIds !== null) {
          if (scopedEntryIds.length === 0) return { data: [] as Array<{ key_skill_id: string }> };
          query = query.in("review_entry_id", scopedEntryIds);
        }

        const { data } = await query;
        return { data: data ?? [] };
      })(),
    ]);

  const curriculumSkillIds = new Set(
    (keySkillsCatalog ?? []).map((row: { id: string }) => String(row.id)),
  );
  const confirmedSkillIds = new Set<string>();
  for (const row of confirmedSkillRows ?? []) {
    const keySkillId = row.key_skill_id ? String(row.key_skill_id) : null;
    if (!keySkillId) continue;
    if (!curriculumSkillIds.has(keySkillId)) continue;
    confirmedSkillIds.add(keySkillId);
  }

  const totalSkills = curriculumSkillIds.size;
  const confirmedSkills = confirmedSkillIds.size;

  const keySkillsPct = totalSkills > 0 ? Math.round((confirmedSkills / totalSkills) * 100) : 100;

  // ── LTFT pro-rata expectation by annual ARCP checkpoint ───────────────────
  const keySkillsCheckpoint = calculateKeySkillsProRataCheckpoint({
    totalSkills,
    confirmedSkills,
    currentStage,
    daysToArcpCalendar: arcp.calendarDaysToArcp,
    workingPercentInput: arcp.workingPercent,
  });

  // ── OSATS ──────────────────────────────────────────────────────────────────
  const { data: proceduresCatalog } = await supabase
    .from("procedures_catalog")
    .select("id, name, kaizen_id, required_by_stage, osats_target")
    .not("kaizen_id", "is", null);

  const { data: osatsEntries } = await supabase
    .from("kaizen_entries")
    .select("detected_entry_type, title, extracted_fields, kaizen_procedure_id, assessor_role_id")
    .eq("user_id", userId)
    .eq("detected_entry_type", "osats_summative");

  const osatsByProcedure = buildOsatsCountsByProcedure(
    (osatsEntries ?? []) as Array<{
      detected_entry_type: string | null;
      title: string | null;
      extracted_fields: Record<string, unknown> | null;
      kaizen_procedure_id: number | null;
      assessor_role_id: number | null;
    }>,
    (proceduresCatalog ?? []).map((p: { kaizen_id: number; name: string }) => ({
      kaizen_id: p.kaizen_id,
      name: p.name,
    })),
    CONSULTANT_ROLE_ID,
  );

  const relevantProcedures = (proceduresCatalog ?? []).filter(
    (p: { required_by_stage: string }) => !relevantStages || relevantStages.has(p.required_by_stage)
  );
  const osatsComplete = relevantProcedures.filter((p: { kaizen_id: number; osats_target: number | null }) => {
    const counts = osatsByProcedure[p.kaizen_id] ?? { total: 0, consultant: 0 };
    const target = p.osats_target ?? 3;
    return counts.total >= target && counts.consultant >= 1;
  }).length;
  const osatsTotal = relevantProcedures.length;
  const osatsPct = osatsTotal > 0 ? Math.round((osatsComplete / osatsTotal) * 100) : 100;

  // ── Courses ────────────────────────────────────────────────────────────────
  const { data: coursesCatalog } = await supabase
    .from("courses_catalog")
    .select("id, name, required_by_stage");

  const { data: courseEntries } = await supabase
    .from("kaizen_entries")
    .select("title, extracted_fields")
    .eq("user_id", userId)
    .eq("detected_entry_type", "other_evidence");

  const entryTitlesLower = new Set<string>();
  const evidenceTypesLower = new Set<string>();
  for (const e of courseEntries ?? []) {
    entryTitlesLower.add(String(e.title ?? "").toLowerCase().trim());
    const ef = e.extracted_fields as Record<string, unknown> | null;
    const evType = String(ef?.["evidence type"] ?? "").toLowerCase().trim();
    if (evType) evidenceTypesLower.add(evType);
  }

  const COURSE_KEYWORDS: Record<string, string[]> = {
    "ctg":             ["ctg"],
    "robust":          ["robust"],
    "prompt":          ["prompt", "also"],
    "basic practical": ["basic practical", "basic skills"],
    "basic ultrasound":["basic ultrasound"],
    "3rd degree":      ["3rd degree", "third degree"],
    "resilience":      ["resilience", "step-up", "stepup"],
    "sitm":            ["sitm"],
    "leadership":      ["leadership"],
  };

  function courseMatched(name: string): boolean {
    const n = name.toLowerCase().trim();
    if (entryTitlesLower.has(n)) return true;
    if (evidenceTypesLower.has(n)) return true;
    for (const evType of evidenceTypesLower) {
      if (n.includes(evType) || evType.includes(n.split("(")[0].trim())) return true;
    }
    for (const [fragment, keywords] of Object.entries(COURSE_KEYWORDS)) {
      if (!n.includes(fragment)) continue;
      for (const kw of keywords) {
        for (const title of entryTitlesLower) { if (title.includes(kw)) return true; }
        for (const evType of evidenceTypesLower) { if (evType.includes(kw)) return true; }
      }
    }
    return false;
  }

  const relevantCourses = (coursesCatalog ?? []).filter(
    (c: { required_by_stage: string }) => !relevantStages || relevantStages.has(c.required_by_stage)
  );
  const coursesComplete = relevantCourses.filter((c: { name: string }) => courseMatched(c.name)).length;
  const coursesTotal = relevantCourses.length;
  const coursesPct = coursesTotal > 0 ? Math.round((coursesComplete / coursesTotal) * 100) : 100;

  // ── Exams ──────────────────────────────────────────────────────────────────
  const completedExamTypes = new Set<string>();
  for (const e of courseEntries ?? []) {
    const ef = e.extracted_fields as Record<string, unknown> | null;
    const evType = String(ef?.["evidence type"] ?? "").trim();
    if (evType && EXAM_EVIDENCE_TYPES[evType]) completedExamTypes.add(evType);
    const titleLower = String(e.title ?? "").toLowerCase();
    if (titleLower.includes("mrcog part 1") || titleLower.includes("mrcog 1")) completedExamTypes.add("474");
    if (titleLower.includes("mrcog part 2") || titleLower.includes("mrcog 2")) completedExamTypes.add("473");
    if (titleLower.includes("mrcog part 3") || titleLower.includes("mrcog 3")) completedExamTypes.add("472");
  }

  const relevantExamTypes = Object.entries(EXAM_EVIDENCE_TYPES).filter(
    ([, meta]) => !relevantStages || relevantStages.has(meta.required_by_stage)
  );
  const examsComplete = relevantExamTypes.filter(([evType]) => completedExamTypes.has(evType)).length;
  const examsTotal = relevantExamTypes.length;
  const examsPct = examsTotal > 0 ? Math.round((examsComplete / examsTotal) * 100) : 100;

  const osatsProRata = calculateProRataProgress({
    total: osatsTotal,
    actual: osatsComplete,
    stageElapsedFraction: keySkillsCheckpoint.stageElapsedFraction,
    workingPercentInput: arcp.workingPercent,
  });
  const coursesProRata = calculateProRataProgress({
    total: coursesTotal,
    actual: coursesComplete,
    stageElapsedFraction: keySkillsCheckpoint.stageElapsedFraction,
    workingPercentInput: arcp.workingPercent,
  });
  const examsProRata = calculateProRataProgress({
    total: examsTotal,
    actual: examsComplete,
    stageElapsedFraction: keySkillsCheckpoint.stageElapsedFraction,
    workingPercentInput: arcp.workingPercent,
  });

  // ── CiP assessments ────────────────────────────────────────────────────────
  const { data: cipAssessments } = await supabase
    .from("cip_assessments")
    .select("cip_number, trainee_level, es_agrees, es_level, status")
    .eq("user_id", userId);

  const hasEsLevels = (cipAssessments ?? []).some(
    (a: { es_level: number | null }) => a.es_level !== null
  );

  // ── Portfolio % (weighted blend) ───────────────────────────────────────────
  const portfolioPct = Math.round(
    keySkillsPct * 0.5 +
    osatsPct * 0.3 +
    coursesPct * 0.15 +
    examsPct * 0.05
  );

  // ── Predicted outcome ──────────────────────────────────────────────────────
  const blockers: string[] = [];
  let predictedOutcome: PredictedOutcome;
  const mode: "on_track" | "predicted_outcome" = hasEsLevels ? "predicted_outcome" : "on_track";
  const selectedStageRank = currentStage ? stageRank(currentStage) : 0;
  const isSeniorSimulation = selectedStageRank >= 6;
  const isMiddleGradeSimulation = selectedStageRank >= 3 && selectedStageRank <= 5;
  const incompleteEvidence =
    confirmedSkills < 3 &&
    osatsComplete === 0 &&
    coursesComplete === 0 &&
    examsComplete === 0 &&
    portfolioPct < 10;

  if (mode === "predicted_outcome" && currentStage) {
    // Mode 2: use actual ES levels
    const cipsBelowExpected: number[] = [];
    let cipLevelGap = 0;
    for (const a of cipAssessments ?? []) {
      if (a.es_level !== null && expectedLevel !== null && a.es_level < expectedLevel) {
        cipsBelowExpected.push(a.cip_number as number);
        cipLevelGap += expectedLevel - a.es_level;
      }
    }

    if (isWaypoint && currentStage === "ST2" && !completedExamTypes.has("474")) {
      predictedOutcome = 3;
      blockers.push("MRCOG Part 1 not recorded — required at ST2 waypoint");
    } else if (isWaypoint && currentStage === "ST5" && (!completedExamTypes.has("473") || !completedExamTypes.has("472"))) {
      predictedOutcome = 3;
      if (!completedExamTypes.has("473")) blockers.push("MRCOG Part 2 not recorded — required at ST5 waypoint");
      if (!completedExamTypes.has("472")) blockers.push("MRCOG Part 3 not recorded — required at ST5 waypoint");
    } else if (cipsBelowExpected.length > 0) {
      let severityScore = 0;
      severityScore += cipsBelowExpected.length >= 4 ? 5 : cipsBelowExpected.length >= 2 ? 3 : 1;
      severityScore += cipLevelGap >= 5 ? 3 : cipLevelGap >= 3 ? 2 : cipLevelGap >= 1 ? 1 : 0;
      if (osatsComplete < osatsTotal) severityScore += 1;
      if (coursesComplete < coursesTotal) severityScore += 1;
      if (examsComplete < examsTotal) severityScore += 1;
      if (isSeniorSimulation && portfolioPct < 65) severityScore += 1;
      if (isSeniorSimulation && keySkillsPct < 50) severityScore += 1;
      predictedOutcome = mapSeverityScoreToOutcome(severityScore);
      blockers.push(
        `${cipsBelowExpected.length} CiP${cipsBelowExpected.length > 1 ? "s" : ""} below expected Level ${expectedLevel} for ${currentStage}: CiP ${cipsBelowExpected.join(", ")}`
      );
      if (predictedOutcome === 4) {
        blockers.push(`The gap between your current CiP levels and ${currentStage} expectations is substantial`);
      }
    } else if (osatsComplete < osatsTotal) {
      predictedOutcome = isSeniorSimulation && osatsPct < 50 ? 3 : 2;
      blockers.push(`${osatsTotal - osatsComplete} summative OSATS incomplete`);
    } else if (coursesComplete < coursesTotal) {
      predictedOutcome = isSeniorSimulation && coursesPct < 50 ? 3 : 2;
      blockers.push(`${coursesTotal - coursesComplete} mandatory course${coursesTotal - coursesComplete > 1 ? "s" : ""} not recorded`);
    } else if (examsComplete < examsTotal) {
      predictedOutcome = isSeniorSimulation ? 3 : 2;
      blockers.push(`${examsTotal - examsComplete} exam${examsTotal - examsComplete > 1 ? "s" : ""} not recorded`);
    } else {
      predictedOutcome = 1;
    }
  } else {
    // Mode 1: evidence-based signals
    if (incompleteEvidence) {
      predictedOutcome = 5;
      blockers.push("Too little evidence is synced to make a reliable ARCP judgement");
    } else if (isWaypoint && currentStage === "ST2" && !completedExamTypes.has("474")) {
      predictedOutcome = 3;
      blockers.push("MRCOG Part 1 not recorded — hard requirement at ST2 waypoint");
    } else if (isWaypoint && currentStage === "ST5" && (!completedExamTypes.has("473") || !completedExamTypes.has("472"))) {
      predictedOutcome = isSeniorSimulation ? 4 : 3;
      if (!completedExamTypes.has("473")) blockers.push("MRCOG Part 2 not recorded — required at ST5 waypoint");
      if (!completedExamTypes.has("472")) blockers.push("MRCOG Part 3 not recorded — required at ST5 waypoint");
    } else if (osatsComplete < osatsTotal || coursesComplete < coursesTotal || examsComplete < examsTotal) {
      let severityScore = 0;
      if (keySkillsPct < 70) severityScore += 1;
      if (keySkillsPct < 45) severityScore += 2;
      if (keySkillsCheckpoint.onTrack === false) severityScore += 1;
      if (osatsComplete < osatsTotal) severityScore += osatsPct < 50 ? 2 : 1;
      if (coursesComplete < coursesTotal) severityScore += coursesPct < 50 ? 2 : 1;
      if (examsComplete < examsTotal) severityScore += examsPct < 50 ? 2 : 1;
      if (isMiddleGradeSimulation) severityScore += 1;
      if (isSeniorSimulation) severityScore += 2;
      if (portfolioPct < 60) severityScore += 1;
      if (portfolioPct < 40) severityScore += 1;

      predictedOutcome = mapSeverityScoreToOutcome(severityScore);
      if (osatsComplete < osatsTotal)
        blockers.push(`${osatsTotal - osatsComplete} summative OSATS incomplete`);
      if (coursesComplete < coursesTotal)
        blockers.push(`${coursesTotal - coursesComplete} mandatory course${coursesTotal - coursesComplete > 1 ? "s" : ""} not recorded`);
      if (examsComplete < examsTotal)
        blockers.push(`${examsTotal - examsComplete} exam${examsTotal - examsComplete > 1 ? "s" : ""} not recorded`);
      if (predictedOutcome >= 3) {
        blockers.push(`Your current portfolio would be judged as below ${currentStage} expectations across multiple pillars`);
      }
    } else {
      predictedOutcome = 1;
    }
  }

  // ── LTFT-aware projection by ARCP (phase 3) ───────────────────────────────
  const monthsLeftWte =
    arcp.wteDaysToArcp !== null ? Math.max(arcp.wteDaysToArcp / 30, 0) : null;

  const projectionPillars = {
    key_skills: buildPillarProjection({
      key: "key_skills",
      label: "Key Skills",
      complete: confirmedSkills,
      total: totalSkills,
      monthsLeftWte,
    }),
    osats: buildPillarProjection({
      key: "osats",
      label: "Summative OSATS",
      complete: osatsComplete,
      total: osatsTotal,
      monthsLeftWte,
    }),
    courses: buildPillarProjection({
      key: "courses",
      label: "Courses",
      complete: coursesComplete,
      total: coursesTotal,
      monthsLeftWte,
    }),
    exams: buildPillarProjection({
      key: "exams",
      label: "Exams",
      complete: examsComplete,
      total: examsTotal,
      monthsLeftWte,
    }),
  };

  const severity: Record<ProjectionStatus, number> = {
    done: 0,
    on_track: 1,
    watch: 2,
    at_risk: 3,
  };

  const projectionList = Object.values(projectionPillars);
  const worstProjection = projectionList.reduce(
    (worst, current) =>
      severity[current.status] > severity[worst.status] ? current : worst,
    projectionList[0],
  );
  const overallProjectionStatus = worstProjection?.status ?? "done";

  const focusCandidates = projectionList
    .filter(
      (pillar) => pillar.remaining > 0 && pillar.required_per_month !== null,
    )
    .sort((a, b) => {
      const sev = severity[b.status] - severity[a.status];
      if (sev !== 0) return sev;
      return (b.required_per_month ?? 0) - (a.required_per_month ?? 0);
    });

  const topFocus = focusCandidates[0] ?? null;
  const focusTarget = topFocus
    ? {
        key: topFocus.key,
        label: topFocus.label,
        units_per_month: Math.max(
          1,
          Math.ceil(topFocus.required_per_month ?? 1),
        ),
        remaining: topFocus.remaining,
        status: topFocus.status,
      }
    : null;

  return NextResponse.json({
    mode,
    current_stage: currentStage,
    current_stage_group: getStageGroupForStage(currentStage),
    curriculum_scope: stageContext.curriculumBandId,
    days_to_arcp: arcp.calendarDaysToArcp,
    days_to_arcp_calendar: arcp.calendarDaysToArcp,
    days_to_arcp_wte: arcp.wteDaysToArcp,
    working_percent: arcp.workingPercent,
    is_ltft: arcp.isLtft,
    portfolio_pct: portfolioPct,
    pillars: {
      key_skills: { pct: keySkillsPct, confirmed: confirmedSkills, total: totalSkills, weight: 0.5 },
      osats:      { pct: osatsPct, complete: osatsComplete, total: osatsTotal, weight: 0.3 },
      courses:    { pct: coursesPct, complete: coursesComplete, total: coursesTotal, weight: 0.15 },
      exams:      { pct: examsPct, complete: examsComplete, total: examsTotal, weight: 0.05 },
    },
    predicted_outcome: predictedOutcome,
    blockers,
    is_waypoint: isWaypoint,
    expected_cip_level: expectedLevel,
    has_es_levels: hasEsLevels,
    projection: {
      months_left_wte: monthsLeftWte === null ? null : Number(monthsLeftWte.toFixed(2)),
      days_left_wte: arcp.wteDaysToArcp,
      overall_status: overallProjectionStatus,
      pillars: projectionPillars,
      focus_target: focusTarget,
    },
    ltft_pro_rata: {
      stage_window: keySkillsCheckpoint.stageWindowLabel,
      stage_elapsed_fraction: keySkillsCheckpoint.stageElapsedFraction,
      working_percent: keySkillsCheckpoint.workingPercent,
      expected_key_skills_by_now: keySkillsCheckpoint.expectedByNowRounded,
      expected_key_skills_threshold: keySkillsCheckpoint.expectedByNowThreshold,
      expected_key_skills_pct_by_now: keySkillsCheckpoint.expectedPctByNow,
      actual_key_skills_confirmed: keySkillsCheckpoint.actualConfirmed,
      delta_to_expected: keySkillsCheckpoint.deltaToExpected,
      on_track: keySkillsCheckpoint.onTrack,
      pillars: {
        osats: {
          expected_by_now: osatsProRata.expectedRounded,
          expected_threshold: osatsProRata.expectedThreshold,
          expected_pct_by_now: osatsProRata.expectedPct,
          actual_complete: osatsComplete,
          total: osatsTotal,
          delta_to_expected: osatsProRata.deltaToExpected,
          on_track: osatsProRata.onTrack,
        },
        courses: {
          expected_by_now: coursesProRata.expectedRounded,
          expected_threshold: coursesProRata.expectedThreshold,
          expected_pct_by_now: coursesProRata.expectedPct,
          actual_complete: coursesComplete,
          total: coursesTotal,
          delta_to_expected: coursesProRata.deltaToExpected,
          on_track: coursesProRata.onTrack,
        },
        exams: {
          expected_by_now: examsProRata.expectedRounded,
          expected_threshold: examsProRata.expectedThreshold,
          expected_pct_by_now: examsProRata.expectedPct,
          actual_complete: examsComplete,
          total: examsTotal,
          delta_to_expected: examsProRata.deltaToExpected,
          on_track: examsProRata.onTrack,
        },
      },
    },
    cip_assessments: (cipAssessments ?? []).map((a: {
      cip_number: number | null;
      trainee_level: number | null;
      es_level: number | null;
      es_agrees: boolean | null;
      status: string;
    }) => ({
      cip_number: a.cip_number,
      trainee_level: a.trainee_level,
      es_level: a.es_level,
      es_agrees: a.es_agrees,
      status: a.status,
    })),
  });
}
