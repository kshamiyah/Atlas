export function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const raw = String(process.env.DEV_BYPASS_AUTH ?? "")
    .trim()
    .toLowerCase();

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getDevBypassUserId(): string | null {
  if (!isDevAuthBypassEnabled()) return null;

  const raw = String(
    process.env.DEV_BYPASS_USER_ID ?? process.env.MODEL_TEST_USER_ID ?? "",
  ).trim();

  return raw.length > 0 ? raw : null;
}
