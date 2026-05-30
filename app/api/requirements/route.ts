import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateArcpCountdown,
  isLtftWorkingPattern,
  sanitizeWorkingPercent,
} from "@/lib/profile/ltft";
import { normalizeStageName } from "@/lib/profile/stage";
import {
  buildOsatsCountsByProcedure,
  groupOsatsEntriesByProcedure,
  KAIZEN_CONSULTANT_ROLE_ID,
} from "@/lib/requirements/osats-evidence";
import {
  buildTeamObservationSummary,
  TO2_TARGET_PER_TRAINING_YEAR,
} from "@/lib/requirements/team-observation-evidence";
import { parseProfilePosts } from "@/lib/progress/year-portfolio";

// Assessor role ID that counts as a consultant sign-off
const CONSULTANT_ROLE_ID = KAIZEN_CONSULTANT_ROLE_ID;

// Kaizen evidence_type values for exams
const EXAM_EVIDENCE_TYPES: Record<string, { name: string; required_by_stage: string }> = {
  "474": { name: "MRCOG Part 1", required_by_stage: "ST2" },
  "473": { name: "MRCOG Part 2", required_by_stage: "ST5" },
  "472": { name: "MRCOG Part 3", required_by_stage: "ST5" },
};

function emptyRequirementsResponse() {
  return NextResponse.json({
    procedures: [],
    courses: [],
    exams: [],
    team_observations: {
      target: TO2_TARGET_PER_TRAINING_YEAR,
      complete: 0,
      total: TO2_TARGET_PER_TRAINING_YEAR,
      pct: 0,
      complete_requirement: false,
      training_year: null,
      items: [],
      listed_to1: 0,
      listed_to2: 0,
    },
    summary: {
      procedures_complete: 0,
      procedures_total: 0,
      courses_complete: 0,
      courses_total: 0,
      exams_complete: 0,
      exams_total: 0,
      team_observations_complete: 0,
      team_observations_total: TO2_TARGET_PER_TRAINING_YEAR,
    },
    profile_stage: null,
    profile_working_pattern: null,
  });
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");

  let supabase;
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    supabase = await getServerSupabaseClient();
    const token = authHeader.slice("Bearer ".length);
    try {
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const auth = await resolveRequestAuth();
    supabase = auth.supabase;
    userId = auth.userId;
    if (!userId && !auth.bypassAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userId) {
      return emptyRequirementsResponse();
    }
  }

  // Resolve user's current training stage for scoped progress views
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_stage_id, current_grade, working_percent, arcp_date, post_history")
    .eq("id", userId)
    .maybeSingle();

  let profileStage: {
    id: string;
    name: string;
    stage_group: string | null;
    sort_order: number | null;
  } | null = null;

  const normalizedStageFromGrade = normalizeStageName(profile?.current_grade ?? null);
  const workingPercent = sanitizeWorkingPercent(profile?.working_percent ?? 100);
  const isLtft = isLtftWorkingPattern(workingPercent);
  const arcpCountdown = calculateArcpCountdown(
    profile?.arcp_date ?? null,
    workingPercent,
  );

  if (profile?.current_stage_id) {
    const { data: stage } = await supabase
      .from("stages")
      .select("id, name, stage_group, sort_order")
      .eq("id", profile.current_stage_id)
      .maybeSingle();

    if (stage) {
      profileStage = stage;
    }
  } else if (normalizedStageFromGrade) {
    const { data: stage } = await supabase
      .from("stages")
      .select("id, name, stage_group, sort_order")
      .eq("name", normalizedStageFromGrade)
      .maybeSingle();

    if (stage) profileStage = stage;
  }

  // ── 1. Summative OSATS sign-offs ─────────────────────────────────────────────
  const { data: proceduresCatalog } = await supabase
    .from("procedures_catalog")
    .select("id, name, category, kaizen_id, required_by_stage, osats_target")
    .not("kaizen_id", "is", null)
    .order("required_by_stage")
    .order("name");

  const { data: osatsEntries } = await supabase
    .from("kaizen_entries")
    .select(
      "id, title, kaizen_date, source_url, detected_entry_type, extracted_fields, kaizen_procedure_id, assessor_role_id",
    )
    .eq("user_id", userId)
    .eq("detected_entry_type", "osats_summative");

  const catalogLite = (proceduresCatalog ?? []).map((p: { kaizen_id: number; name: string }) => ({
    kaizen_id: p.kaizen_id,
    name: p.name,
  }));

  const osatsEntryRows = (osatsEntries ?? []) as Array<{
    id: string;
    title: string | null;
    kaizen_date: string | null;
    source_url: string | null;
    detected_entry_type: string | null;
    extracted_fields: Record<string, unknown> | null;
    kaizen_procedure_id: number | null;
    assessor_role_id: number | null;
  }>;

  const osatsByProcedure = buildOsatsCountsByProcedure(
    osatsEntryRows,
    catalogLite,
    CONSULTANT_ROLE_ID,
  );

  const osatsEntriesByProcedure = groupOsatsEntriesByProcedure(
    osatsEntryRows,
    catalogLite,
    CONSULTANT_ROLE_ID,
  );

  const procedures = (proceduresCatalog ?? []).map((p: {
    id: string;
    name: string;
    category: string | null;
    kaizen_id: number;
    required_by_stage: string;
    osats_target: number | null;
  }) => {
    const counts = osatsByProcedure[p.kaizen_id] ?? { total: 0, consultant: 0 };
    const target = p.osats_target ?? 3;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      required_by_stage: p.required_by_stage,
      osats_target: target,
      total_osats: counts.total,
      consultant_osats: counts.consultant,
      complete: counts.total >= target && counts.consultant >= 1,
      osats_entries: osatsEntriesByProcedure[p.kaizen_id] ?? [],
    };
  });

  // ── 2. Mandatory courses ──────────────────────────────────────────────────────
  const { data: coursesCatalog } = await supabase
    .from("courses_catalog")
    .select("id, name, required_by_stage")
    .order("required_by_stage")
    .order("name");

  // Pull title + extracted_fields so we can match on evidence type and keywords
  const { data: courseEntries } = await supabase
    .from("kaizen_entries")
    .select("title, extracted_fields")
    .eq("user_id", userId)
    .eq("detected_entry_type", "other_evidence");

  // Build two signal sets: entry titles and evidence type values (both lowercased)
  const entryTitlesLower = new Set<string>();
  const evidenceTypesLower = new Set<string>();
  for (const e of courseEntries ?? []) {
    entryTitlesLower.add(String(e.title ?? "").toLowerCase().trim());
    const ef = e.extracted_fields as Record<string, unknown> | null;
    const evType = String(ef?.["evidence type"] ?? ef?.["evidence_type"] ?? "").toLowerCase().trim();
    if (evType) evidenceTypesLower.add(evType);
  }

  // Keyword aliases: catalog name fragment → keywords that appear in entry title/evidence type
  const COURSE_KEYWORDS: Record<string, string[]> = {
    "ctg":             ["ctg"],
    "robust":          ["robust"],
    "prompt":          ["prompt", "also"],
    "basic practical": ["basic practical", "basic skills"],
    "basic ultrasound":["basic ultrasound"],
    "3rd degree":      ["3rd degree", "third degree", "perineal tear course"],
    "resilience":      ["resilience", "step-up", "stepup"],
    "sitm":            ["sitm"],
    "leadership":      ["leadership"],
  };

  function courseMatched(catalogName: string): boolean {
    const nameLower = catalogName.toLowerCase().trim();
    // 1. Exact title match
    if (entryTitlesLower.has(nameLower)) return true;
    // 2. Evidence type field matches catalog name
    if (evidenceTypesLower.has(nameLower)) return true;
    // 3. Evidence type field is a substring of catalog name (e.g. "ctg training")
    for (const evType of evidenceTypesLower) {
      if (nameLower.includes(evType) || evType.includes(nameLower.split("(")[0].trim())) return true;
    }
    // 4. Keyword aliases against both titles and evidence types
    for (const [fragment, keywords] of Object.entries(COURSE_KEYWORDS)) {
      if (!nameLower.includes(fragment)) continue;
      for (const kw of keywords) {
        for (const title of entryTitlesLower) {
          if (title.includes(kw)) return true;
        }
        for (const evType of evidenceTypesLower) {
          if (evType.includes(kw)) return true;
        }
      }
    }
    return false;
  }

  const courses = (coursesCatalog ?? []).map((c: {
    id: string;
    name: string;
    required_by_stage: string;
  }) => ({
    id: c.id,
    name: c.name,
    required_by_stage: c.required_by_stage,
    complete: courseMatched(c.name),
  }));

  // ── 3. Exams ──────────────────────────────────────────────────────────────────
  // Exams logged as other_evidence with specific evidence_type values
  // extracted_fields may contain evidence_type; fall back to title matching
  const { data: examEntries } = await supabase
    .from("kaizen_entries")
    .select("title, extracted_fields")
    .eq("user_id", userId)
    .eq("detected_entry_type", "other_evidence");

  const completedExamTypes = new Set<string>();
  for (const entry of examEntries ?? []) {
    const ef = entry.extracted_fields as Record<string, unknown> | null;
    // Check extracted evidence_type value
    const evType = String(ef?.["evidence type"] ?? ef?.["evidence_type"] ?? "").trim();
    if (evType && EXAM_EVIDENCE_TYPES[evType]) {
      completedExamTypes.add(evType);
    }
    // Also match on title
    const titleLower = String(entry.title ?? "").toLowerCase();
    if (titleLower.includes("mrcog part 1") || titleLower.includes("mrcog 1")) completedExamTypes.add("474");
    if (titleLower.includes("mrcog part 2") || titleLower.includes("mrcog 2")) completedExamTypes.add("473");
    if (titleLower.includes("mrcog part 3") || titleLower.includes("mrcog 3")) completedExamTypes.add("472");
  }

  const exams = Object.entries(EXAM_EVIDENCE_TYPES).map(([evType, meta]) => ({
    evidence_type: evType,
    name: meta.name,
    required_by_stage: meta.required_by_stage,
    complete: completedExamTypes.has(evType),
  }));

  // ── 4. Team observations (TO2) ─────────────────────────────────────────────
  const { data: observationEntries } = await supabase
    .from("kaizen_entries")
    .select("id, title, assessment_type, training_year, status, kaizen_date")
    .eq("user_id", userId)
    .or(
      "title.ilike.%team observation%,title.ilike.%to1%,title.ilike.%to2%,assessment_type.ilike.%team observation%,assessment_type.ilike.%to1%,assessment_type.ilike.%to2%",
    );

  const profilePosts = parseProfilePosts(profile?.post_history);
  const teamObservations = buildTeamObservationSummary(observationEntries ?? [], {
    trainingYear: profileStage?.name ?? normalizedStageFromGrade,
    posts: profilePosts,
    target: TO2_TARGET_PER_TRAINING_YEAR,
  });

  // ── Summary counts ────────────────────────────────────────────────────────────
  const summary = {
    procedures_complete: procedures.filter((p) => p.complete).length,
    procedures_total: procedures.length,
    courses_complete: courses.filter((c) => c.complete).length,
    courses_total: courses.length,
    exams_complete: exams.filter((e) => e.complete).length,
    exams_total: exams.length,
    team_observations_complete: teamObservations.complete,
    team_observations_total: teamObservations.target,
  };

  return NextResponse.json({
    procedures,
    courses,
    exams,
    team_observations: teamObservations,
    summary,
    profile_stage: profileStage,
    profile_working_pattern: {
      working_percent: workingPercent,
      is_ltft: isLtft,
      days_to_arcp_calendar: arcpCountdown.calendarDaysToArcp,
      days_to_arcp_wte: arcpCountdown.wteDaysToArcp,
    },
  });
}
