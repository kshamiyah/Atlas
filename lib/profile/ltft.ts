export const DEFAULT_WORKING_PERCENT = 100;
export const MIN_WORKING_PERCENT = 10;
export const MAX_WORKING_PERCENT = 100;

export function sanitizeWorkingPercent(
  value: unknown,
  fallback = DEFAULT_WORKING_PERCENT,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < MIN_WORKING_PERCENT) return MIN_WORKING_PERCENT;
  if (rounded > MAX_WORKING_PERCENT) return MAX_WORKING_PERCENT;
  return rounded;
}

export function isLtftWorkingPattern(workingPercent: number): boolean {
  return sanitizeWorkingPercent(workingPercent) < DEFAULT_WORKING_PERCENT;
}

function scaleSignedDays(days: number, ratio: number): number {
  const scaled = days * ratio;
  return scaled >= 0 ? Math.ceil(scaled) : Math.floor(scaled);
}

export function calculateArcpCountdown(
  arcpDate: string | null | undefined,
  workingPercentInput: unknown,
  nowMs = Date.now(),
): {
  workingPercent: number;
  isLtft: boolean;
  calendarDaysToArcp: number | null;
  wteDaysToArcp: number | null;
} {
  const workingPercent = sanitizeWorkingPercent(workingPercentInput);
  const isLtft = isLtftWorkingPattern(workingPercent);

  const calendarDaysToArcp = arcpDate
    ? Math.ceil((new Date(arcpDate).getTime() - nowMs) / 86_400_000)
    : null;

  const wteDaysToArcp =
    calendarDaysToArcp === null
      ? null
      : scaleSignedDays(calendarDaysToArcp, workingPercent / 100);

  return {
    workingPercent,
    isLtft,
    calendarDaysToArcp,
    wteDaysToArcp,
  };
}
