import { toIsoDateOrNull } from "@/lib/kaizen/kaizen-date";
import { normalizeStageName, STAGE_ORDER, type StageName } from "@/lib/profile/stage";

export type ProfilePost = {
  grade: string;
  post_start: string | null;
  post_end: string | null;
  hospital?: string | null;
  trust?: string | null;
};

export type PostWindow = {
  grade: StageName;
  post_start: string;
  post_end: string;
  hospital: string | null;
  trust: string | null;
};

export type KaizenEntryLite = {
  id: string;
  kaizen_date: string | null;
  training_year: string | null;
  detected_entry_type?: string | null;
  assessment_type?: string | null;
};

export type ReviewEntryLite = {
  id: string;
  stage_id: string | null;
  event_date: string | null;
};

export type RequirementsSummary = {
  procedures_complete: number;
  procedures_total: number;
  courses_complete: number;
  courses_total: number;
  exams_complete: number;
  exams_total: number;
};

export type EvidenceScopeMethod = "post_window" | "training_year";

export type YearEvidenceCounts = {
  primary: number;
  by_post_window: number | null;
  by_training_year: number;
  scope_method: EvidenceScopeMethod;
};

export type MonthActivity = {
  month: string;
  label: string;
  count: number;
};

export type ReviewStatusSummary = {
  entries_in_scope: number;
  entries_with_confirmed_skills: number;
  entries_awaiting_review: number;
  pending_suggestions: number;
  review_completion_pct: number;
};

export function parseProfilePosts(value: unknown): ProfilePost[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): ProfilePost | null => {
      if (!row || typeof row !== "object") return null;
      const obj = row as Record<string, unknown>;
      const grade = String(obj.grade ?? "").trim();
      if (!grade) return null;
      return {
        grade,
        post_start: obj.post_start == null ? null : String(obj.post_start),
        post_end: obj.post_end == null ? null : String(obj.post_end),
        hospital: obj.hospital == null ? null : String(obj.hospital),
        trust: obj.trust == null ? null : String(obj.trust),
      };
    })
    .filter((row): row is ProfilePost => row !== null);
}

export function buildEntriesYearHref(year: StageName | null): string {
  if (!year) return "/dashboard/entries";
  return `/dashboard/entries?year=${encodeURIComponent(year)}`;
}

export function resolveYearScopeContext(posts: ProfilePost[], year: StageName) {
  const postWindow = findPostForYear(posts, year);
  return {
    postWindow,
    scopeMethod: resolveEvidenceScopeMethod(postWindow),
    postWindowLabel: formatPostWindowLabel(postWindow),
  };
}

export function filterKaizenEntriesByTrainingYear(
  entries: KaizenEntryLite[],
  year: StageName,
): KaizenEntryLite[] {
  return entries.filter((entry) => entryMatchesTrainingYear(entry.training_year, year));
}

export function filterKaizenEntriesByPostWindow(
  entries: KaizenEntryLite[],
  post: PostWindow | null,
): KaizenEntryLite[] {
  if (!post) return [];
  return entries.filter((entry) => entryInPostWindow(entry.kaizen_date, post));
}

export function buildYearEvidenceCounts(
  entries: KaizenEntryLite[],
  year: StageName,
  post: PostWindow | null,
): YearEvidenceCounts {
  const byTrainingYear = filterKaizenEntriesByTrainingYear(entries, year).length;
  const byPostWindow = post ? filterKaizenEntriesByPostWindow(entries, post).length : null;
  const scopeMethod = resolveEvidenceScopeMethod(post);
  const primary =
    scopeMethod === "post_window" ? (byPostWindow ?? 0) : byTrainingYear;
  return {
    primary,
    by_post_window: byPostWindow,
    by_training_year: byTrainingYear,
    scope_method: scopeMethod,
  };
}

export function summarizeActivityByMonth(entries: KaizenEntryLite[]): MonthActivity[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const iso = toIsoDateOrNull(entry.kaizen_date);
    if (!iso) continue;
    const month = iso.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .slice(0, 12)
    .map(([month, count]) => ({
      month,
      label: formatMonthLabel(month),
      count,
    }));
}

function formatMonthLabel(monthKey: string): string {
  const parsed = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function buildReviewStatusSummary(params: {
  scopedReviewEntryIds: Set<string>;
  entriesWithConfirmed: Set<string>;
  pendingSuggestions: number;
}): ReviewStatusSummary {
  const entriesInScope = params.scopedReviewEntryIds.size;
  const entriesWithConfirmed = params.entriesWithConfirmed.size;
  const entriesAwaitingReview = Math.max(0, entriesInScope - entriesWithConfirmed);
  const reviewCompletionPct =
    entriesInScope > 0 ? Math.round((entriesWithConfirmed / entriesInScope) * 100) : 0;

  return {
    entries_in_scope: entriesInScope,
    entries_with_confirmed_skills: entriesWithConfirmed,
    entries_awaiting_review: entriesAwaitingReview,
    pending_suggestions: params.pendingSuggestions,
    review_completion_pct: reviewCompletionPct,
  };
}

export function listAvailableTrainingYears(
  posts: ProfilePost[],
  entries: KaizenEntryLite[],
): StageName[] {
  const fromPosts = posts
    .map((post) => normalizeStageName(post.grade))
    .filter((year): year is StageName => year !== null);
  const fromEntries = entries
    .map((entry) => normalizeStageName(entry.training_year))
    .filter((year): year is StageName => year !== null);
  const ordered = new Set<StageName>();
  for (const year of STAGE_ORDER) {
    if (fromPosts.includes(year) || fromEntries.includes(year)) ordered.add(year);
  }
  return [...ordered];
}

export function findPostForYear(
  posts: ProfilePost[],
  year: StageName,
): PostWindow | null {
  for (const post of posts) {
    const grade = normalizeStageName(post.grade);
    if (grade !== year) continue;
    const postStart = toIsoDateOrNull(post.post_start);
    const postEnd = toIsoDateOrNull(post.post_end);
    if (!postStart || !postEnd) continue;
    return {
      grade,
      post_start: postStart,
      post_end: postEnd,
      hospital: post.hospital?.trim() ? post.hospital.trim() : null,
      trust: post.trust?.trim() ? post.trust.trim() : null,
    };
  }
  return null;
}

export function entryInPostWindow(
  kaizenDate: string | null | undefined,
  post: Pick<PostWindow, "post_start" | "post_end"> | null,
): boolean {
  if (!post) return false;
  const iso = toIsoDateOrNull(kaizenDate);
  if (!iso) return false;
  return iso >= post.post_start && iso <= post.post_end;
}

export function entryMatchesTrainingYear(
  trainingYear: string | null | undefined,
  year: StageName,
): boolean {
  return normalizeStageName(trainingYear) === year;
}

export function resolveEvidenceScopeMethod(
  post: PostWindow | null,
): EvidenceScopeMethod {
  return post ? "post_window" : "training_year";
}

export function filterKaizenEntriesForYear(
  entries: KaizenEntryLite[],
  year: StageName,
  post: PostWindow | null,
): KaizenEntryLite[] {
  const method = resolveEvidenceScopeMethod(post);
  if (method === "post_window") {
    return entries.filter((entry) => entryInPostWindow(entry.kaizen_date, post));
  }
  return entries.filter((entry) => entryMatchesTrainingYear(entry.training_year, year));
}

export function filterReviewEntriesForYear(
  entries: ReviewEntryLite[],
  year: StageName,
  yearStageId: string | null,
  post: PostWindow | null,
): ReviewEntryLite[] {
  const method = resolveEvidenceScopeMethod(post);
  if (method === "post_window") {
    return entries.filter((entry) => entryInPostWindow(entry.event_date, post));
  }
  if (yearStageId) {
    return entries.filter((entry) => entry.stage_id === yearStageId);
  }
  return entries;
}

export function summarizeEntryTypes(entries: KaizenEntryLite[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const type =
      String(entry.detected_entry_type ?? entry.assessment_type ?? "other").trim() ||
      "other";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

export function scopeRequirementsByYear<T extends { required_by_stage: string; complete: boolean }>(
  items: T[],
  year: StageName,
): T[] {
  return items.filter((item) => normalizeStageName(item.required_by_stage) === year);
}

export function summarizeRequirements(items: Array<{ complete: boolean }>): {
  complete: number;
  total: number;
} {
  return {
    complete: items.filter((item) => item.complete).length,
    total: items.length,
  };
}

export function buildRequirementsSummary(
  procedures: Array<{ complete: boolean }>,
  courses: Array<{ complete: boolean }>,
  exams: Array<{ complete: boolean }>,
): RequirementsSummary {
  const procedureSummary = summarizeRequirements(procedures);
  const courseSummary = summarizeRequirements(courses);
  const examSummary = summarizeRequirements(exams);
  return {
    procedures_complete: procedureSummary.complete,
    procedures_total: procedureSummary.total,
    courses_complete: courseSummary.complete,
    courses_total: courseSummary.total,
    exams_complete: examSummary.complete,
    exams_total: examSummary.total,
  };
}

export function isRetrospectiveYear(
  selectedYear: StageName | null,
  currentYear: StageName | null,
): boolean {
  if (!selectedYear || !currentYear) return false;
  return selectedYear !== currentYear;
}

export function defaultViewForYear(
  selectedYear: StageName | null,
  currentYear: StageName | null,
): "snapshot" | "priorities" {
  return isRetrospectiveYear(selectedYear, currentYear) ? "snapshot" : "priorities";
}

export function formatPostWindowLabel(post: PostWindow | null): string | null {
  if (!post) return null;
  const start = new Date(`${post.post_start}T00:00:00`);
  const end = new Date(`${post.post_end}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${post.post_start} – ${post.post_end}`;
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}
