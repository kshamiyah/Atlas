export function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const raw = String(process.env.DEV_BYPASS_AUTH ?? "")
    .trim()
    .toLowerCase();

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
