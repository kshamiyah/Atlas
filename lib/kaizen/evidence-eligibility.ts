function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function entryHaystack(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
  title?: string | null | undefined,
): string {
  return normalizeText(
    `${detectedEntryType ?? ""} ${assessmentType ?? ""} ${title ?? ""}`,
  ).toLowerCase();
}

/** CBD, mini-CEX, NOTSS, OSATS — withheld from import until assessor sign-off. */
export function requiresAssessorSignoff(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
): boolean {
  const haystack = entryHaystack(detectedEntryType, assessmentType);

  return (
    /\bcbd\b|case[-\s]?based/.test(haystack) ||
    /mini[-\s]?cex|minicex/.test(haystack) ||
    /notss|non[-\s]?technical/.test(haystack) ||
    /osats/.test(haystack)
  );
}

/** TO2 only — not TO1 / Self TO1. */
export function isTo2Evidence(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
  title?: string | null | undefined,
): boolean {
  const haystack = entryHaystack(detectedEntryType, assessmentType, title);
  return (
    /to2 for to1|team observation form 2|\(to2\)|\(t02\)/i.test(haystack) ||
    /\bto2\b|\bt02\b|team\s+observation\s*(?:form\s*)?2\b|team observation to2|observation summary/i.test(
      haystack,
    )
  );
}

/** TO1 forms — never scraped during quick sync. */
export function isTo1TeamObservationEvidence(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
  title?: string | null | undefined,
): boolean {
  if (isTo2Evidence(detectedEntryType, assessmentType, title)) return false;

  const haystack = entryHaystack(detectedEntryType, assessmentType, title);
  return (
    /self[\s-]*(?:observation|to\s*1|to1)|self observation form/i.test(haystack) ||
    /\bto1\b|team\s+observation\s*1\b|team\s+observation\s*form\s*1\b/i.test(haystack)
  );
}

/** @deprecated Use isTo2Evidence */
export function isTeamObservationEvidence(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
  title?: string | null | undefined,
): boolean {
  return isTo2Evidence(detectedEntryType, assessmentType, title);
}

export function extractAssessmentRequestSignal(
  extractedFields: Record<string, unknown> | null | undefined,
): string {
  if (!extractedFields || typeof extractedFields !== "object") return "";

  const parts: string[] = [];
  for (const [key, value] of Object.entries(extractedFields)) {
    const normalized = normalizeKey(key);
    if (
      normalized.includes("assessment request") ||
      normalized === "assessor" ||
      normalized.includes("assessor status") ||
      normalized.includes("trainer")
    ) {
      const text = normalizeText(value);
      if (text) parts.push(text);
    }
  }
  return parts.join(" ").toLowerCase();
}

export type AssessorSignoffState =
  | "signed_or_complete"
  | "expired"
  | "pending_or_requested"
  | "unknown";

export function classifyAssessorSignoffState(params: {
  status?: string | null;
  extracted_fields?: Record<string, unknown> | null;
}): AssessorSignoffState {
  const rowStatus = normalizeText(params.status).toLowerCase();
  const requestSignal = extractAssessmentRequestSignal(params.extracted_fields);
  const combined = `${rowStatus} ${requestSignal}`.trim();

  const hasCompleteSignal =
    combined.includes("completed") ||
    combined.includes("complete") ||
    combined.includes("signed");
  const hasExpiredSignal = combined.includes("expired");
  const hasPendingSignal =
    combined.includes("pending") ||
    combined.includes("awaiting") ||
    combined.includes("requested") ||
    combined.includes("ready for assessment");

  if (hasCompleteSignal) return "signed_or_complete";
  if (hasExpiredSignal) return "expired";
  if (hasPendingSignal) return "pending_or_requested";
  return "unknown";
}

export function isUnsignedAssessorEvidence(params: {
  detected_entry_type?: string | null;
  assessment_type?: string | null;
  title?: string | null;
  status?: string | null;
  extracted_fields?: Record<string, unknown> | null;
}): boolean {
  if (
    isTo2Evidence(
      params.detected_entry_type ?? null,
      params.assessment_type ?? null,
      params.title ?? null,
    )
  ) {
    return false;
  }

  if (
    !requiresAssessorSignoff(
      params.detected_entry_type ?? null,
      params.assessment_type ?? null,
    )
  ) {
    return false;
  }

  return (
    classifyAssessorSignoffState({
      status: params.status,
      extracted_fields: params.extracted_fields,
    }) !== "signed_or_complete"
  );
}

export function needsLightweightStatusRefresh(params: {
  detected_entry_type?: string | null;
  assessment_type?: string | null;
  title?: string | null;
  status?: string | null;
  extracted_fields?: Record<string, unknown> | null;
}): boolean {
  const status = normalizeText(params.status);
  const requestSignal = extractAssessmentRequestSignal(params.extracted_fields);
  const combined = `${status} ${requestSignal}`.trim().toLowerCase();

  if (
    combined.includes("completed") ||
    combined.includes("complete") ||
    combined.includes("signed")
  ) {
    return false;
  }

  if (
    isTo1TeamObservationEvidence(
      params.detected_entry_type ?? null,
      params.assessment_type ?? null,
      params.title ?? null,
    )
  ) {
    return false;
  }

  if (
    isTo2Evidence(
      params.detected_entry_type ?? null,
      params.assessment_type ?? null,
      params.title ?? null,
    )
  ) {
    return combined.length === 0 || combined.includes("pending") || combined.includes("in progress");
  }

  if (
    !requiresAssessorSignoff(
      params.detected_entry_type ?? null,
      params.assessment_type ?? null,
    )
  ) {
    return false;
  }

  return (
    combined.includes("expired") ||
    combined.includes("pending") ||
    combined.includes("awaiting") ||
    combined.includes("requested") ||
    combined.includes("ready for assessment") ||
    combined.length === 0
  );
}
