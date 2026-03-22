import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

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

// Stage rank for comparison (higher = later in training)
const STAGE_RANK: Record<string, number> = {
  ST1: 1, ST2: 2, ST3: 3, ST4: 4, ST5: 5, ST6: 6, ST7: 7,
};

const CONSULTANT_ROLE_ID = 597;

const EXAM_EVIDENCE_TYPES: Record<string, { name: string; required_by_stage: string }> = {
  "474": { name: "MRCOG Part 1", required_by_stage: "ST2" },
  "473": { name: "MRCOG Part 2", required_by_stage: "ST5" },
  "472": { name: "MRCOG Part 3", required_by_stage: "ST5" },
};

// Waypoint hard gate requirements
const WAYPOINT_STAGES = new Set(["ST2", "ST5"]);

function stageRank(stage: string): number {
  return STAGE_RANK[stage] ?? 0;
}

function stagesUpTo(currentStage: string): Set<string> {
  const rank = stageRank(currentStage);
  return new Set(Object.keys(STAGE_RANK).filter((s) => stageRank(s) <= rank));
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
    .select("current_grade, arcp_date")
    .eq("id", userId)
    .maybeSingle();

  const currentStage = profile?.current_grade ?? null;   // e.g. "ST1"
  const arcpDate = profile?.arcp_date ?? null;

  const daysToArcp = arcpDate
    ? Math.ceil((new Date(arcpDate).getTime() - Date.now()) / 86_400_000)
    : null;

  const relevantStages = currentStage ? stagesUpTo(currentStage) : null;
  const isWaypoint = currentStage ? WAYPOINT_STAGES.has(currentStage) : false;
  const expectedLevel = currentStage ? (EXPECTED_LEVEL_BY_STAGE[currentStage] ?? null) : null;

  // ── Key skills ─────────────────────────────────────────────────────────────
  const { data: keySkillRows } = await supabase
    .from("key_skill_review_entries")
    .select("id")
    .eq("user_id", userId);

  const reviewEntryIds = (keySkillRows ?? []).map((r: { id: string }) => r.id);

  let confirmedSkills = 0;
  let totalSkills = 0;

  if (reviewEntryIds.length > 0) {
    const { data: suggestions } = await supabase
      .from("key_skill_review_suggestions")
      .select("status")
      .in("review_entry_id", reviewEntryIds);

    const allSuggestions = suggestions ?? [];
    confirmedSkills = allSuggestions.filter((s: { status: string }) => s.status === "confirmed").length;
    totalSkills = allSuggestions.filter((s: { status: string }) => s.status !== "rejected").length;
  }

  const keySkillsPct = totalSkills > 0 ? Math.round((confirmedSkills / totalSkills) * 100) : 0;

  // ── OSATS ──────────────────────────────────────────────────────────────────
  const { data: proceduresCatalog } = await supabase
    .from("procedures_catalog")
    .select("id, kaizen_id, required_by_stage, osats_target")
    .not("kaizen_id", "is", null);

  const { data: osatsEntries } = await supabase
    .from("kaizen_entries")
    .select("kaizen_procedure_id, assessor_role_id")
    .eq("user_id", userId)
    .eq("detected_entry_type", "osats_summative")
    .not("kaizen_procedure_id", "is", null);

  const osatsByProcedure: Record<number, { total: number; consultant: number }> = {};
  for (const e of osatsEntries ?? []) {
    const pid = e.kaizen_procedure_id as number;
    if (!osatsByProcedure[pid]) osatsByProcedure[pid] = { total: 0, consultant: 0 };
    osatsByProcedure[pid].total += 1;
    if (e.assessor_role_id === CONSULTANT_ROLE_ID) osatsByProcedure[pid].consultant += 1;
  }

  const relevantProcedures = (proceduresCatalog ?? []).filter(
    (p: { required_by_stage: string }) => !relevantStages || relevantStages.has(p.required_by_stage)
  );
  const osatsComplete = relevantProcedures.filter((p: { kaizen_id: number; osats_target: number | null }) => {
    const counts = osatsByProcedure[p.kaizen_id] ?? { total: 0, consultant: 0 };
    const target = p.osats_target ?? 3;
    return counts.total >= target && counts.consultant >= 1;
  }).length;
  const osatsTotal = relevantProcedures.length;
  const osatsPct = osatsTotal > 0 ? Math.round((osatsComplete / osatsTotal) * 100) : 0;

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
  const coursesPct = coursesTotal > 0 ? Math.round((coursesComplete / coursesTotal) * 100) : 0;

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
  const examsPct = examsTotal > 0 ? Math.round((examsComplete / examsTotal) * 100) : 0;

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
  let predictedOutcome: 1 | 2 | 3 | 5;
  const mode: "on_track" | "predicted_outcome" = hasEsLevels ? "predicted_outcome" : "on_track";

  if (mode === "predicted_outcome" && currentStage) {
    // Mode 2: use actual ES levels
    const cipsBelowExpected: number[] = [];
    for (const a of cipAssessments ?? []) {
      if (a.es_level !== null && expectedLevel !== null && a.es_level < expectedLevel) {
        cipsBelowExpected.push(a.cip_number as number);
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
      predictedOutcome = cipsBelowExpected.length >= 3 ? 3 : 2;
      blockers.push(
        `${cipsBelowExpected.length} CiP${cipsBelowExpected.length > 1 ? "s" : ""} below expected Level ${expectedLevel} for ${currentStage}: CiP ${cipsBelowExpected.join(", ")}`
      );
    } else if (osatsComplete < osatsTotal) {
      predictedOutcome = 2;
      blockers.push(`${osatsTotal - osatsComplete} summative OSATS incomplete`);
    } else if (coursesComplete < coursesTotal) {
      predictedOutcome = 2;
      blockers.push(`${coursesTotal - coursesComplete} mandatory course${coursesTotal - coursesComplete > 1 ? "s" : ""} not recorded`);
    } else {
      predictedOutcome = 1;
    }
  } else {
    // Mode 1: evidence-based signals
    const evidenceThin = keySkillsPct < 15 && osatsPct === 0 && coursesComplete === 0;

    if (evidenceThin) {
      predictedOutcome = 5;
      blockers.push("Very little portfolio evidence — sync more entries from Kaizen");
    } else if (isWaypoint && currentStage === "ST2" && !completedExamTypes.has("474")) {
      predictedOutcome = 3;
      blockers.push("MRCOG Part 1 not recorded — hard requirement at ST2 waypoint");
    } else if (isWaypoint && currentStage === "ST5" && (!completedExamTypes.has("473") || !completedExamTypes.has("472"))) {
      predictedOutcome = 3;
      if (!completedExamTypes.has("473")) blockers.push("MRCOG Part 2 not recorded — required at ST5 waypoint");
      if (!completedExamTypes.has("472")) blockers.push("MRCOG Part 3 not recorded — required at ST5 waypoint");
    } else if (osatsComplete < osatsTotal || coursesComplete < coursesTotal || examsComplete < examsTotal) {
      predictedOutcome = 2;
      if (osatsComplete < osatsTotal)
        blockers.push(`${osatsTotal - osatsComplete} summative OSATS incomplete`);
      if (coursesComplete < coursesTotal)
        blockers.push(`${coursesTotal - coursesComplete} mandatory course${coursesTotal - coursesComplete > 1 ? "s" : ""} not recorded`);
      if (examsComplete < examsTotal)
        blockers.push(`${examsTotal - examsComplete} exam${examsTotal - examsComplete > 1 ? "s" : ""} not recorded`);
    } else {
      predictedOutcome = 1;
    }
  }

  return NextResponse.json({
    mode,
    current_stage: currentStage,
    days_to_arcp: daysToArcp,
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
