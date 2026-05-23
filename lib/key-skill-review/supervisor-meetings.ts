function normaliseText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function looksLikeSupervisorMeetingTitle(title: string | null | undefined): boolean {
  const normalized = normaliseText(title);
  if (!normalized) return false;

  if (normalized.includes("supervisor meeting")) return true;
  if (normalized.includes("educational supervisor")) return true;
  if (normalized === "first meeting") return true;

  return false;
}

export function isSupervisorMeetingTitle(
  title: string | null | undefined,
): boolean {
  return looksLikeSupervisorMeetingTitle(title);
}

function normaliseDate(value: string | null | undefined): string {
  const clean = String(value ?? "").trim();
  if (!clean) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10);
  }

  const parsed = Date.parse(clean);
  if (Number.isNaN(parsed)) return clean.toLowerCase();
  return new Date(parsed).toISOString().slice(0, 10);
}

export function buildSupervisorMeetingKey(
  title: string | null | undefined,
  eventDate: string | null | undefined,
): string {
  return `${normaliseDate(eventDate)}::${normaliseText(title)}`;
}

export function isSupervisorMeetingReviewEntry(
  title: string | null | undefined,
  eventDate: string | null | undefined,
  supervisorMeetingKeys: ReadonlySet<string>,
): boolean {
  if (supervisorMeetingKeys.has(buildSupervisorMeetingKey(title, eventDate))) {
    return true;
  }

  return looksLikeSupervisorMeetingTitle(title);
}
