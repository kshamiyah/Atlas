import {
  formatCipJudgmentSummary,
  isCipAssessmentComplete,
  isClinicalCip,
  parseEntrustmentLevel,
  parseMeetsExpectations,
  resolveAssessmentJudgments,
} from "@/lib/kaizen/cip-supervision";

type JsonLike = Record<string, unknown> | null | undefined;

export const TOTAL_CIP_COUNT = 14;

export type ParsedCipAssessment = {
  cip_number: number | null;
  cip_kaizen_id: number | null;
  cip_name: string | null;
  date: string | null;
  trainee_entrustment: number | null;
  trainee_comments: string | null;
  es_agrees: boolean | null;
  es_entrustment: number | null;
  es_meets_expectations: boolean | null;
  es_comments: string | null;
  status: "draft" | "pending" | "complete";
  /** @deprecated Legacy mirror of trainee_entrustment for clinical CiPs. */
  trainee_level: number | null;
  /** @deprecated Legacy mirror; prefer es_entrustment / es_meets_expectations. */
  es_level: number | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFieldPairs(fields: JsonLike): Array<{ key: string; value: string }> {
  if (!fields || typeof fields !== "object") return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const [rawKey, rawValue] of Object.entries(fields)) {
    const key = normalizeKey(rawKey);
    const value = normalizeText(rawValue);
    if (!key || !value) continue;
    out.push({ key, value });
  }
  return out;
}

function readFieldByHint(fields: JsonLike, hints: string[]): string {
  for (const pair of getFieldPairs(fields)) {
    if (hints.some((hint) => pair.key.includes(hint))) return pair.value;
  }
  return "";
}

function readTraineeEntrustment(fields: JsonLike): number | null {
  for (const pair of getFieldPairs(fields)) {
    const { key, value } = pair;
    if (!key.includes("clinical cip")) continue;
    if (key.includes("trainee") && key.includes("performance")) continue;
    if (key.includes("my performance") || key.includes("consider my performance")) {
      const level = parseEntrustmentLevel(value);
      if (level != null) return level;
    }
  }

  return parseEntrustmentLevel(
    readFieldByHint(fields, [
      "consider my performance for this clinical cip",
      "my performance for this clinical cip",
      "trainee performance for this clinical cip",
    ]),
  );
}

function readEsEntrustment(fields: JsonLike): number | null {
  for (const pair of getFieldPairs(fields)) {
    const { key, value } = pair;
    if (key.includes("trainee") && key.includes("performance") && key.includes("clinical cip")) {
      const level = parseEntrustmentLevel(value);
      if (level != null) return level;
    }
  }

  return parseEntrustmentLevel(
    readFieldByHint(fields, [
      "consider the trainee s performance for this clinical cip",
      "trainee s performance for this clinical cip",
      "trainee performance for this clinical cip",
    ]),
  );
}

function readEsMeetsExpectations(fields: JsonLike): boolean | null {
  const fromField = parseMeetsExpectations(
    readFieldByHint(fields, [
      "cip global judgment",
      "global judgment",
      "supervisor judgment",
      "es judgment",
      "meeting expectations",
    ]),
  );
  if (fromField != null) return fromField;
  return null;
}

function legacyEsLevel(params: {
  cip_number: number | null;
  es_entrustment: number | null;
  es_meets_expectations: boolean | null;
}): number | null {
  if (isClinicalCip(params.cip_number)) {
    return params.es_entrustment;
  }
  if (params.es_meets_expectations === true) return 1;
  if (params.es_meets_expectations === false) return 0;
  return null;
}

export function parseCipNumbers(value: unknown): number[] {
  const text = normalizeText(value);
  if (!text) return [];

  const numbers: number[] = [];
  for (const match of text.matchAll(/cip\s*(\d{1,2})/gi)) {
    const n = Number.parseInt(match[1], 10);
    if (Number.isInteger(n) && n >= 1 && n <= TOTAL_CIP_COUNT) numbers.push(n);
  }
  return numbers;
}

export function parseCipNumber(value: unknown): number | null {
  const [first] = parseCipNumbers(value);
  return typeof first === "number" ? first : null;
}

export function isCipAssessmentEntry(params: {
  assessment_type?: string | null;
  title?: string | null;
  detected_entry_type?: string | null;
}): boolean {
  if (params.detected_entry_type === "cip_assessment") return true;

  const haystack = normalizeText(
    `${params.assessment_type ?? ""} ${params.title ?? ""}`,
  ).toLowerCase();

  return (
    /cip assessment/.test(haystack) ||
    /assessment for cip/.test(haystack) ||
    /cip \d{1,2} assessment/.test(haystack)
  );
}

export function inferDetectedEntryType(
  assessmentType: string,
  title: string,
): string | null {
  const haystack = normalizeText(`${assessmentType} ${title}`).toLowerCase();

  if (isCipAssessmentEntry({ assessment_type: assessmentType, title })) {
    return "cip_assessment";
  }
  if (/mini[-\s]?cex|minicex/.test(haystack)) return "minicex";
  if (/cbd|case[-\s]?based/.test(haystack)) return "cbd";
  if (/notss|non[-\s]?technical/.test(haystack)) return "notss";
  if (/osats.*summative|summative.*osats/.test(haystack)) return "osats_summative";
  if (/osats|formative/.test(haystack)) return "osats_formative";
  if (/reflect|reflective/.test(haystack)) return "reflection";
  if (/procedure|logbook/.test(haystack)) return "procedure";
  if (/team observation|to2|to1/.test(haystack)) return "other_evidence";
  if (/course|conference|evidence/.test(haystack)) return "other_evidence";

  return null;
}

export function parseCipNameFromAssessmentTitle(
  title: string,
  cipNumber?: number | null,
): string | null {
  const normalized = normalizeText(title);
  if (!normalized) return null;

  const assessmentMatch = normalized.match(
    /assessment for cip\s*(\d{1,2})\s*:\s*(.+?)(?:\s+for\s*:\s*|$)/i,
  );
  if (assessmentMatch) {
    const parsedNumber = Number.parseInt(assessmentMatch[1], 10);
    if (cipNumber == null || parsedNumber === cipNumber) {
      return assessmentMatch[2].trim();
    }
  }

  const cipMatch = normalized.match(/^CiP\s*\d+\s*:\s*(.+?)(?:\s*\(\d+\))?\s*$/i);
  return cipMatch ? cipMatch[1].trim() : null;
}

function parseCipIdentity(fields: JsonLike, title: string) {
  const cipDefinition = readFieldByHint(fields, [
    "cip definition",
    "field cip assessment cip",
    "cip assessment cip",
    "cip id",
  ]);

  const cipText = cipDefinition || title;
  const cip_number = parseCipNumber(cipText) ?? parseCipNumber(title);
  const cipKaizenMatch = cipText.match(/\((\d+)\)\s*$/);
  const cip_kaizen_id = cipKaizenMatch ? Number.parseInt(cipKaizenMatch[1], 10) : null;
  const nameMatch = cipText.match(/^CiP\s*\d+\s*:\s*(.+?)(?:\s*\(\d+\))?\s*$/i);
  const cip_name =
    (nameMatch ? nameMatch[1].trim() : null) ||
    parseCipNameFromAssessmentTitle(title, cip_number);

  return { cip_number, cip_kaizen_id, cip_name };
}

function inferMeetsExpectationsFromComments(value: string): boolean | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (/above expectations|well above|exceed|meeting expectations|meeting the expected/.test(text)) {
    return true;
  }
  if (/below expectations|not meeting|does not meet|concern/.test(text)) {
    return false;
  }
  return null;
}

function resolveAssessmentStatus(
  explicitStatus: string,
  fields: JsonLike,
): "draft" | "pending" | "complete" {
  const statusText = normalizeText(
    explicitStatus ||
      readFieldByHint(fields, [
        "current status of this assessment request",
        "assessment request status",
        "status",
      ]),
  ).toLowerCase();

  if (/complete|submitted|signed off|signed-off/.test(statusText)) return "complete";
  if (/pending|awaiting|requested|in progress|progress/.test(statusText)) return "pending";
  if (/draft/.test(statusText)) return "draft";

  const confirmation = readFieldByHint(fields, [
    "confirmation by assessor",
    "assessor willing to complete",
  ]).toLowerCase();
  if (
    confirmation.includes("completed this assessment") ||
    (confirmation.includes("willing") && confirmation.includes("yes"))
  ) {
    return "complete";
  }

  return "pending";
}

export function resolveCipAssessmentDisplayStatus(
  record: CipAssessmentRecord,
): "draft" | "pending" | "complete" {
  const normalized = normalizeText(record.status).toLowerCase();
  if (normalized === "complete") return "complete";
  if (normalized === "draft") return "draft";
  if (isCipAssessmentComplete(record)) return "complete";
  return "pending";
}

export function resolveCipDisplayName(
  record: Pick<CipAssessmentRecord, "cip_number" | "cip_name">,
  catalog?: Map<number, string> | Array<{ number: number; title: string }>,
): string | null {
  const explicit = normalizeText(record.cip_name);
  if (explicit) return explicit;

  if (record.cip_number == null || !catalog) return null;

  const catalogMap =
    catalog instanceof Map
      ? catalog
      : new Map(catalog.map((entry) => [entry.number, entry.title]));

  return catalogMap.get(record.cip_number) ?? null;
}

function pickNonEmptyString(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const next = normalizeText(incoming);
  if (next) return next;
  const prev = normalizeText(existing);
  return prev || null;
}

function pickNumber(
  incoming: number | null | undefined,
  existing: number | null | undefined,
): number | null {
  return incoming != null ? incoming : existing ?? null;
}

function pickBoolean(
  incoming: boolean | null | undefined,
  existing: boolean | null | undefined,
): boolean | null {
  return typeof incoming === "boolean" ? incoming : existing ?? null;
}

function mergeAssessmentStatus(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): "draft" | "pending" | "complete" {
  const rank: Record<"draft" | "pending" | "complete", number> = {
    draft: 1,
    pending: 2,
    complete: 3,
  };

  const incomingStatus = normalizeText(incoming).toLowerCase();
  const existingStatus = normalizeText(existing).toLowerCase();

  const incomingRank =
    incomingStatus === "complete" || incomingStatus === "pending" || incomingStatus === "draft"
      ? rank[incomingStatus]
      : 0;
  const existingRank =
    existingStatus === "complete" || existingStatus === "pending" || existingStatus === "draft"
      ? rank[existingStatus]
      : 0;

  const winner =
    incomingRank >= existingRank
      ? (incomingStatus as "draft" | "pending" | "complete")
      : (existingStatus as "draft" | "pending" | "complete");

  if (winner === "complete" || winner === "pending" || winner === "draft") return winner;
  return "pending";
}

export type CipAssessmentUpsertRow = ReturnType<typeof toCipAssessmentUpsertRow>;

export function mergeCipAssessmentUpsertRow(
  existing: Partial<CipAssessmentRecord> | null | undefined,
  incoming: CipAssessmentUpsertRow,
): CipAssessmentUpsertRow {
  if (!existing) return incoming;

  const merged = {
    ...incoming,
    kaizen_entry_id: pickNonEmptyString(incoming.kaizen_entry_id, existing.kaizen_entry_id),
    cip_number: pickNumber(incoming.cip_number, existing.cip_number),
    cip_kaizen_id: pickNumber(incoming.cip_kaizen_id, existing.cip_kaizen_id),
    cip_name: pickNonEmptyString(incoming.cip_name, existing.cip_name),
    date: pickNonEmptyString(incoming.date, existing.date),
    trainee_entrustment: pickNumber(incoming.trainee_entrustment, existing.trainee_entrustment),
    trainee_level: pickNumber(incoming.trainee_level, existing.trainee_level),
    trainee_comments: pickNonEmptyString(incoming.trainee_comments, existing.trainee_comments),
    es_agrees: pickBoolean(incoming.es_agrees, existing.es_agrees),
    es_entrustment: pickNumber(incoming.es_entrustment, existing.es_entrustment),
    es_meets_expectations: pickBoolean(
      incoming.es_meets_expectations,
      existing.es_meets_expectations,
    ),
    es_level: pickNumber(incoming.es_level, existing.es_level),
    es_comments: pickNonEmptyString(incoming.es_comments, existing.es_comments),
    status: mergeAssessmentStatus(incoming.status, existing.status),
  };

  return {
    ...merged,
    status: resolveCipAssessmentDisplayStatus(merged as CipAssessmentRecord),
  };
}

export function parseCipAssessmentFromEntry(entry: {
  title?: string | null;
  kaizen_date?: string | null;
  status?: string | null;
  linked_cip_number?: number | null;
  extracted_fields?: JsonLike;
  trainee_entrustment?: number | null;
  es_entrustment?: number | null;
  es_meets_expectations?: boolean | null;
  trainee_level?: number | null;
  es_level?: number | null;
  es_agrees?: boolean | null;
  trainee_comments?: string | null;
  es_comments?: string | null;
  cip_number?: number | null;
}): ParsedCipAssessment {
  const fields = entry.extracted_fields ?? {};
  const title = normalizeText(entry.title);
  const identity = parseCipIdentity(fields, title);

  const cip_number =
    entry.cip_number ??
    entry.linked_cip_number ??
    identity.cip_number ??
    parseCipNumber(title);

  const traineeComments =
    entry.trainee_comments ||
    readFieldByHint(fields, ["trainee comments", "cip trainee comments"]) ||
    null;

  const esComments =
    entry.es_comments ||
    readFieldByHint(fields, ["further comments", "supervisor comments", "es comments"]) ||
    null;

  const clinical = isClinicalCip(cip_number);

  let trainee_entrustment =
    typeof entry.trainee_entrustment === "number"
      ? entry.trainee_entrustment
      : typeof entry.trainee_level === "number" && clinical
        ? entry.trainee_level
        : readTraineeEntrustment(fields);

  let es_entrustment =
    typeof entry.es_entrustment === "number"
      ? entry.es_entrustment
      : typeof entry.es_level === "number" && clinical && entry.es_level >= 1 && entry.es_level <= 5
        ? entry.es_level
        : readEsEntrustment(fields);

  let es_meets_expectations =
    typeof entry.es_meets_expectations === "boolean"
      ? entry.es_meets_expectations
      : readEsMeetsExpectations(fields);

  if (es_meets_expectations == null) {
    es_meets_expectations = inferMeetsExpectationsFromComments(esComments || "");
  }

  if (!clinical && es_meets_expectations == null && typeof entry.es_level === "number") {
    es_meets_expectations = entry.es_level >= 1;
  }

  let es_agrees = typeof entry.es_agrees === "boolean" ? entry.es_agrees : null;
  if (es_agrees == null) {
    const reviewText = readFieldByHint(fields, [
      "cip supervisor review",
      "supervisor review",
      "es agrees",
    ]).toLowerCase();
    if (/agree|yes|accept/.test(reviewText)) es_agrees = true;
    else if (/disagree|no|reject/.test(reviewText)) es_agrees = false;
  }

  let status = resolveAssessmentStatus(entry.status || "", fields);
  if (status === "pending" && (traineeComments || esComments || es_agrees === true)) {
    status = "complete";
  }
  if (status === "pending" && (es_entrustment != null || es_meets_expectations != null)) {
    status = "complete";
  }

  const date =
    normalizeText(entry.kaizen_date) ||
    readFieldByHint(fields, ["date", "event date"]) ||
    null;

  const normalizedTraineeEntrustment =
    trainee_entrustment != null && trainee_entrustment >= 1 && trainee_entrustment <= 5
      ? trainee_entrustment
      : null;
  const normalizedEsEntrustment =
    es_entrustment != null && es_entrustment >= 1 && es_entrustment <= 5 ? es_entrustment : null;

  return {
    cip_number,
    cip_kaizen_id: identity.cip_kaizen_id,
    cip_name: identity.cip_name,
    date,
    trainee_entrustment: clinical ? normalizedTraineeEntrustment : null,
    trainee_comments: traineeComments,
    es_agrees,
    es_entrustment: clinical ? normalizedEsEntrustment : null,
    es_meets_expectations,
    es_comments: esComments,
    status,
    trainee_level: clinical ? normalizedTraineeEntrustment : null,
    es_level: legacyEsLevel({
      cip_number,
      es_entrustment: normalizedEsEntrustment,
      es_meets_expectations,
    }),
  };
}

export function toCipAssessmentUpsertRow(
  userId: string,
  sourceEntryId: string | null,
  entry: Parameters<typeof parseCipAssessmentFromEntry>[0],
) {
  const parsed = parseCipAssessmentFromEntry(entry);

  return {
    user_id: userId,
    kaizen_entry_id: sourceEntryId,
    cip_number: parsed.cip_number,
    cip_kaizen_id: parsed.cip_kaizen_id,
    cip_name: parsed.cip_name,
    date: parsed.date,
    trainee_entrustment: parsed.trainee_entrustment,
    trainee_level: parsed.trainee_level,
    trainee_comments: parsed.trainee_comments,
    es_agrees: parsed.es_agrees,
    es_entrustment: parsed.es_entrustment,
    es_meets_expectations: parsed.es_meets_expectations,
    es_level: parsed.es_level,
    es_comments: parsed.es_comments,
    status: parsed.status,
    updated_at: new Date().toISOString(),
  };
}

export type CipAssessmentRecord = {
  id: string;
  kaizen_entry_id: string | null;
  cip_number: number | null;
  cip_kaizen_id: number | null;
  cip_name: string | null;
  date: string | null;
  trainee_entrustment: number | null;
  trainee_level: number | null;
  trainee_comments: string | null;
  es_agrees: boolean | null;
  es_entrustment: number | null;
  es_meets_expectations: boolean | null;
  es_level: number | null;
  es_comments: string | null;
  status: string | null;
  updated_at: string | null;
};

export type BrowsableEntryRow = {
  id: string;
  title: string | null;
  kaizen_date: string | null;
  assessment_type: string | null;
  status: string | null;
  synced_at: string | null;
  source_entry_id: string | null;
  source_url: string | null;
  detected_entry_type: string | null;
  category: string | null;
  training_year: string | null;
  linked_cip_number: number | null;
  entry_text: string | null;
  extracted_fields: Record<string, unknown> | null;
  extraction_status: string | null;
  key_skills_count: number | null;
  kaizen_procedure_id: number | null;
  assessor_role_id: number | null;
};

function formatCipAssessmentStatus(status: string | null | undefined): string {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "complete") return "Complete";
  if (normalized === "pending") return "Pending";
  if (normalized === "draft") return "Draft";
  return normalizeText(status) || "Pending";
}

function buildCipAssessmentTitle(
  record: CipAssessmentRecord,
  displayName: string | null,
): string {
  if (record.cip_number != null && displayName) {
    return `Assessment for CiP ${record.cip_number}: ${displayName}`;
  }
  if (record.cip_number != null) {
    return `Assessment for CiP ${record.cip_number}`;
  }
  return "CiP assessment";
}

export function cipAssessmentToBrowsableEntry(
  record: CipAssessmentRecord,
  kaizenBaseUrl = "https://training.rcog.org.uk",
  catalog?: Map<number, string> | Array<{ number: number; title: string }>,
): BrowsableEntryRow {
  const base = kaizenBaseUrl.replace(/\/$/, "");
  const sourceUrl = record.kaizen_entry_id
    ? `${base}/assessment-type/${record.kaizen_entry_id}`
    : null;
  const displayName = resolveCipDisplayName(record, catalog);
  const displayStatus = resolveCipAssessmentDisplayStatus(record);
  const judgmentSummary = formatCipJudgmentSummary(record);

  const traineeComments = normalizeText(record.trainee_comments);
  const esComments = normalizeText(record.es_comments);
  const entryText = [traineeComments, esComments].filter(Boolean).join("\n\n");

  return {
    id: `cip-assessment:${record.id}`,
    title: buildCipAssessmentTitle(record, displayName),
    kaizen_date: record.date,
    assessment_type: "CiP assessment",
    status: formatCipAssessmentStatus(displayStatus),
    synced_at: record.updated_at,
    source_entry_id: record.kaizen_entry_id,
    source_url: sourceUrl,
    detected_entry_type: "cip_assessment",
    category: displayName,
    training_year: null,
    linked_cip_number: record.cip_number,
    entry_text: entryText || null,
    extracted_fields: {
      "cip definition":
        record.cip_number != null
          ? `CiP ${record.cip_number}: ${displayName ?? "Unknown"}${record.cip_kaizen_id ? ` (${record.cip_kaizen_id})` : ""}`
          : null,
      "trainee entrustment": judgmentSummary.trainee_entrustment,
      "es entrustment": judgmentSummary.es_entrustment,
      "meeting expectations": judgmentSummary.es_meets_expectations,
      "es agrees": record.es_agrees,
      "assessment status": formatCipAssessmentStatus(displayStatus),
    },
    extraction_status: entryText.length >= 260 ? "full" : entryText.length > 0 ? "partial" : "none",
    key_skills_count: null,
    kaizen_procedure_id: null,
    assessor_role_id: null,
  };
}

export function mergeBrowsableEntries(
  portfolioEntries: BrowsableEntryRow[],
  cipAssessments: CipAssessmentRecord[],
  kaizenBaseUrl?: string,
  catalog?: Map<number, string> | Array<{ number: number; title: string }>,
): BrowsableEntryRow[] {
  const cipRows = cipAssessments.map((record) =>
    cipAssessmentToBrowsableEntry(record, kaizenBaseUrl, catalog),
  );

  return [...portfolioEntries, ...cipRows].sort((a, b) => {
    const aSync = a.synced_at ? new Date(a.synced_at).getTime() : 0;
    const bSync = b.synced_at ? new Date(b.synced_at).getTime() : 0;
    if (bSync !== aSync) return bSync - aSync;
    return String(b.kaizen_date ?? "").localeCompare(String(a.kaizen_date ?? ""));
  });
}
