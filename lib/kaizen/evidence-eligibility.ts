function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export function requiresAssessorSignoff(
  detectedEntryType: string | null | undefined,
  assessmentType: string | null | undefined,
): boolean {
  const haystack = normalizeText(
    `${detectedEntryType ?? ""} ${assessmentType ?? ""}`,
  ).toLowerCase();

  return (
    /\bcbd\b|case[-\s]?based/.test(haystack) ||
    /mini[-\s]?cex|minicex/.test(haystack) ||
    /notss|non[-\s]?technical/.test(haystack) ||
    /osats/.test(haystack)
  );
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
  status?: string | null;
  extracted_fields?: Record<string, unknown> | null;
}): boolean {
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
