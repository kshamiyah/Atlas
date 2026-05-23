/**
 * Normalise Kaizen date strings (often DD/MM/YYYY or "23 May 2026") to YYYY-MM-DD.
 */
export function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const date = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return iso;
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

export function matchesKaizenDayFilter(
  kaizenDate: string | null | undefined,
  dayFilter: string,
): boolean {
  const filter = dayFilter.trim();
  if (!filter) return true;

  const iso = toIsoDateOrNull(kaizenDate);
  if (iso && iso === filter) return true;

  const raw = String(kaizenDate ?? "").trim();
  return raw === filter;
}

export function formatRelativeSyncTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Unknown";

    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3600_000);
    const diffDays = Math.floor(diffMs / 86400_000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export function compareKaizenEntryDatesDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftIso = toIsoDateOrNull(left) || "";
  const rightIso = toIsoDateOrNull(right) || "";
  return rightIso.localeCompare(leftIso);
}
