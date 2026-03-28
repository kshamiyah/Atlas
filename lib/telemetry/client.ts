/**
 * Client-side product telemetry hook. Extend with analytics provider when ready.
 * In development, events log to the console for verification (Phase 10).
 */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (typeof window === "undefined") return;
  const payload = { name, props: props ?? {}, ts: Date.now() };
  if (process.env.NODE_ENV === "development") {
    console.debug("[telemetry]", payload);
  }
  try {
    window.dispatchEvent(new CustomEvent("portfolioiq-telemetry", { detail: payload }));
  } catch {
    // ignore
  }
}
