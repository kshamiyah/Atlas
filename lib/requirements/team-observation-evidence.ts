export const TO2_TARGET_PER_TRAINING_YEAR = 2;

export type TeamObservationKind = "self_to1" | "assessor_to1" | "to2";

export type TeamObservationEntryLike = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
  assessment_type?: string | null;
  assessmentType?: string | null;
  category?: string | null;
  status?: string | null;
  training_year?: string | null;
  trainingYear?: string | null;
  year?: string | null;
  kaizen_date?: string | null;
  lastUpdated?: string | null;
  url?: string | null;
  sourceEntryId?: string | null;
  assessorName?: string | null;
};

export type PostWindowLike = {
  grade?: string | null;
  post_start?: string | null;
  post_end?: string | null;
};

export type TeamObservationItem = {
  id: string;
  title: string;
  kind: TeamObservationKind;
  training_year: string | null;
  status: string;
  complete: boolean;
  date: string | null;
};

export type TeamObservationSummary = {
  target: number;
  complete: number;
  total: number;
  pct: number;
  complete_requirement: boolean;
  training_year: string | null;
  items: TeamObservationItem[];
  complete_to2: number;
  complete_self_to1: number;
  listed_to1: number;
  listed_to2: number;
  listed_self_to1: number;
  listed_assessor_to1: number;
  complete_source: "to2" | "self_to1" | "none";
};

export function entryHaystack(entry: TeamObservationEntryLike): string {
  return [
    entry.title,
    entry.name,
    entry.assessment_type,
    entry.assessmentType,
    entry.category,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyTeamObservationEntry(
  entry: TeamObservationEntryLike,
): TeamObservationKind | null {
  const haystack = entryHaystack(entry);

  if (
    /to2 for to1|team observation form 2|\(to2\)|\(t02\)/i.test(haystack) ||
    /\bto2\b|\bt02\b|team\s+observation\s*(?:form\s*)?2\b|team observation to2|observation summary/i.test(
      haystack,
    )
  ) {
    return "to2";
  }

  if (/self[\s-]*(?:observation|to\s*1|to1)|self observation form/i.test(haystack)) {
    return "self_to1";
  }

  if (/\bto1\b|team\s+observation\s*1\b|team\s+observation\s*form\s*1\b/i.test(haystack)) {
    return "assessor_to1";
  }

  if (/team\s+observation/i.test(haystack)) {
    if (String(entry.assessorName ?? "").trim()) return "assessor_to1";
    return "to2";
  }

  return null;
}

/** @deprecated Use classifyTeamObservationEntry */
export function isTo1Entry(entry: TeamObservationEntryLike): boolean {
  const kind = classifyTeamObservationEntry(entry);
  return kind === "assessor_to1" || kind === "self_to1";
}

/** @deprecated Use classifyTeamObservationEntry */
export function isTo2Entry(entry: TeamObservationEntryLike): boolean {
  return classifyTeamObservationEntry(entry) === "to2";
}

export function isTeamObservationComplete(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("complete") ||
    normalized.includes("completed") ||
    normalized.includes("signed")
  );
}

export function normalizeTrainingYear(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/\bST[1-7]\b/);
  return match ? match[0] : null;
}

export function inferTrainingYearFromHaystack(entry: TeamObservationEntryLike): string | null {
  const haystack = entryHaystack(entry);
  const match = haystack.match(/\bst\s*([1-7])\b/i);
  return match ? `ST${match[1]}` : null;
}

function trainingYearFromFields(entry: TeamObservationEntryLike): string | null {
  return (
    normalizeTrainingYear(entry.training_year) ||
    normalizeTrainingYear(entry.trainingYear) ||
    normalizeTrainingYear(entry.year)
  );
}

export function entryTrainingYear(entry: TeamObservationEntryLike): string | null {
  return trainingYearFromFields(entry) || inferTrainingYearFromHaystack(entry);
}

export function findPostForStage(
  posts: PostWindowLike[] | null | undefined,
  stage: string | null,
): PostWindowLike | null {
  if (!stage || !Array.isArray(posts)) return null;
  const normalizedStage = normalizeTrainingYear(stage);
  if (!normalizedStage) return posts[0] ?? null;
  for (const post of posts) {
    if (normalizeTrainingYear(post.grade) === normalizedStage) return post;
  }
  return posts[0] ?? null;
}

function toIsoDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function entryInPostWindow(
  dateValue: string | null | undefined,
  post: Pick<PostWindowLike, "post_start" | "post_end"> | null,
): boolean {
  if (!post?.post_start || !post?.post_end) return false;
  const iso = toIsoDate(dateValue);
  if (!iso) return false;
  return iso >= post.post_start && iso <= post.post_end;
}

export function entryInTrainingYearScope(
  entry: TeamObservationEntryLike,
  trainingYear: string | null,
  post: PostWindowLike | null,
): boolean {
  if (!trainingYear) return true;

  const haystackYear = inferTrainingYearFromHaystack(entry);
  if (haystackYear && haystackYear !== trainingYear) return false;

  const entryYear = trainingYearFromFields(entry) || haystackYear;
  if (entryYear) return entryYear === trainingYear;
  if (post) {
    const dateValue = entry.kaizen_date || entry.lastUpdated || null;
    if (dateValue) return entryInPostWindow(dateValue, post);
    const postStage = normalizeTrainingYear(post.grade);
    return !postStage || postStage === trainingYear;
  }
  return true;
}

function entryKey(entry: TeamObservationEntryLike, index: number, kind: TeamObservationKind): string {
  return (
    String(entry.id ?? "").trim() ||
    String(entry.url ?? "").trim() ||
    String(entry.sourceEntryId ?? "").trim() ||
    `${kind}|${entryHaystack(entry)}|${entryTrainingYear(entry) ?? "unknown"}|${index}`
  );
}

function defaultTitle(kind: TeamObservationKind): string {
  if (kind === "self_to1") return "Self observation form (Self TO1)";
  if (kind === "to2") return "Team Observation 2 (TO2)";
  return "Team Observation 1 (TO1)";
}

function normalizeTitleForDedupe(title: string): string {
  return String(title || "")
    .replace(/\(\d+\)\s*$/, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function itemQualityScore(item: TeamObservationItem): number {
  let score = 0;
  if (item.complete) score += 100;
  if (item.date) score += 20;
  if (item.status && item.status !== "Unknown") score += 10;
  return score;
}

function shouldMergeDuplicateItems(a: TeamObservationItem, b: TeamObservationItem): boolean {
  if (a.kind !== b.kind) return false;
  if (normalizeTitleForDedupe(a.title) !== normalizeTitleForDedupe(b.title)) return false;
  if (a.date && b.date && a.date !== b.date) return false;
  return true;
}

function dedupeTeamObservationItems(items: TeamObservationItem[]): TeamObservationItem[] {
  const result: TeamObservationItem[] = [];
  for (const item of items) {
    const mergeIndex = result.findIndex((existing) => shouldMergeDuplicateItems(existing, item));
    if (mergeIndex === -1) {
      result.push(item);
    } else if (itemQualityScore(item) > itemQualityScore(result[mergeIndex]!)) {
      result[mergeIndex] = item;
    }
  }
  return result;
}

function assessmentRoundLabel(title: string): string | null {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("second assessment")) return "second";
  if (normalized.includes("first assessment")) return "first";
  return null;
}

function filterDisplayTeamObservationItems(items: TeamObservationItem[]): TeamObservationItem[] {
  const deduped = dedupeTeamObservationItems(items);
  return deduped.filter((item) => {
    if (item.kind !== "self_to1" || item.complete) return true;

    const round = assessmentRoundLabel(item.title);
    const hasMatchingCompleteTo2 = deduped.some(
      (other) =>
        other.kind === "to2" &&
        other.complete &&
        ((item.date && other.date === item.date) ||
          (round && assessmentRoundLabel(other.title) === round)),
    );
    return !hasMatchingCompleteTo2;
  });
}

function summarizeScopedItems(
  items: TeamObservationItem[],
  target: number,
): Pick<
  TeamObservationSummary,
  "complete" | "pct" | "complete_requirement" | "complete_to2" | "complete_self_to1" | "complete_source"
> {
  const completeTo2 = items.filter((item) => item.kind === "to2" && item.complete).length;
  const completeSelfTo1 = items.filter(
    (item) => item.kind === "self_to1" && item.complete,
  ).length;
  const complete =
    completeTo2 >= target
      ? completeTo2
      : completeSelfTo1 >= target
        ? completeSelfTo1
        : Math.max(completeTo2, completeSelfTo1);
  const pct = target > 0 ? Math.min(100, Math.round((complete / target) * 100)) : 100;
  const completeSource =
    completeTo2 >= completeSelfTo1 && completeTo2 > 0
      ? "to2"
      : completeSelfTo1 > 0
        ? "self_to1"
        : "none";

  return {
    complete,
    complete_to2: completeTo2,
    complete_self_to1: completeSelfTo1,
    pct,
    complete_requirement: complete >= target,
    complete_source: completeSource,
  };
}

export function buildTeamObservationSummary(
  entries: TeamObservationEntryLike[],
  params: {
    trainingYear?: string | null;
    posts?: PostWindowLike[] | null;
    target?: number;
  } = {},
): TeamObservationSummary {
  const target = params.target ?? TO2_TARGET_PER_TRAINING_YEAR;
  const trainingYear = normalizeTrainingYear(params.trainingYear ?? null);
  const post = findPostForStage(params.posts ?? null, trainingYear);

  let listedSelfTo1 = 0;
  let listedAssessorTo1 = 0;
  let listedTo2 = 0;
  const items: TeamObservationItem[] = [];

  entries.forEach((entry, index) => {
    const kind = classifyTeamObservationEntry(entry);
    if (!kind) return;

    if (kind === "self_to1") listedSelfTo1 += 1;
    else if (kind === "assessor_to1") listedAssessorTo1 += 1;
    else listedTo2 += 1;

    if (kind === "assessor_to1") return;
    if (!entryInTrainingYearScope(entry, trainingYear, post)) return;

    const status = String(entry.status ?? "").trim() || "Unknown";
    items.push({
      id: entryKey(entry, index, kind),
      title: String(entry.title || entry.name || defaultTitle(kind)).trim(),
      kind,
      training_year: entryTrainingYear(entry),
      status,
      complete: isTeamObservationComplete(status),
      date: toIsoDate(entry.kaizen_date || entry.lastUpdated || null),
    });
  });

  const dedupedItems = dedupeTeamObservationItems(items);
  const displayItems = filterDisplayTeamObservationItems(items);
  const totals = summarizeScopedItems(dedupedItems, target);

  return {
    target,
    total: target,
    training_year: trainingYear,
    items: displayItems.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.title.localeCompare(b.title);
    }),
    listed_self_to1: listedSelfTo1,
    listed_assessor_to1: listedAssessorTo1,
    listed_to1: listedSelfTo1 + listedAssessorTo1,
    listed_to2: listedTo2,
    ...totals,
  };
}

export function scopeTeamObservationSummaryForYear(
  summary: TeamObservationSummary,
  year: string | null,
): TeamObservationSummary {
  const normalizedYear = normalizeTrainingYear(year);
  if (!normalizedYear) return summary;

  const items = dedupeTeamObservationItems(
    summary.items.filter(
      (item) => !item.training_year || item.training_year === normalizedYear,
    ),
  );
  const totals = summarizeScopedItems(items, summary.target);

  return {
    ...summary,
    training_year: normalizedYear,
    items: filterDisplayTeamObservationItems(items),
    total: summary.target,
    ...totals,
  };
}
