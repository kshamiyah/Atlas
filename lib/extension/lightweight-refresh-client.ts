export type SyncMode = "light" | "full";

export type LightweightRefreshPayload = {
  phase?: string;
  detail?: string;
  sync_mode?: SyncMode;
  scannedCount?: number;
  count?: number;
  index?: number;
  total?: number;
  newEntriesSynced?: number;
  newCipAssessmentsSynced?: number;
  refreshedCount?: number;
  failedCount?: number;
  cipSuccessCount?: number;
  cipFailureCount?: number;
  cipTotal?: number;
};

export const LIGHTWEIGHT_REFRESH_MESSAGE = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH";
export const LIGHTWEIGHT_REFRESH_ACK = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_ACK";
export const LIGHTWEIGHT_REFRESH_PROGRESS = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_PROGRESS";

export const EXTENSION_ACK_TIMEOUT_MS = 8000;
export const EXTENSION_ACK_RETRY_MS = 700;
export const EXTENSION_AUTO_START_DELAY_MS = 500;

export const EXTENSION_UNAVAILABLE_MESSAGE =
  "Atlas extension not detected. Open this page in Chrome with the extension enabled, then click Refresh now.";

export function postPortfolioSync(options?: { force?: boolean; syncMode?: SyncMode }) {
  window.postMessage(
    {
      type: LIGHTWEIGHT_REFRESH_MESSAGE,
      payload: {
        force: Boolean(options?.force),
        sync_mode: options?.syncMode ?? "light",
      },
    },
    "*",
  );
}

export function postLightweightRefresh(force: boolean) {
  postPortfolioSync({ force, syncMode: "light" });
}

export function postFullPortfolioSync() {
  postPortfolioSync({ force: true, syncMode: "full" });
}

export function isLightweightRefreshAck(
  data: unknown,
): data is { payload?: { ok?: boolean; detail?: string } } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === LIGHTWEIGHT_REFRESH_ACK
  );
}

export function isLightweightRefreshProgress(
  data: unknown,
): data is { payload?: LightweightRefreshPayload } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === LIGHTWEIGHT_REFRESH_PROGRESS
  );
}
