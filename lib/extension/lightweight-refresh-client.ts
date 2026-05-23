export type LightweightRefreshPayload = {
  phase?: string;
  detail?: string;
  scannedCount?: number;
  newEntriesSynced?: number;
  newCipAssessmentsSynced?: number;
  refreshedCount?: number;
  failedCount?: number;
};

export const LIGHTWEIGHT_REFRESH_MESSAGE = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH";
export const LIGHTWEIGHT_REFRESH_ACK = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_ACK";
export const LIGHTWEIGHT_REFRESH_PROGRESS = "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_PROGRESS";

export const EXTENSION_ACK_TIMEOUT_MS = 8000;
export const EXTENSION_ACK_RETRY_MS = 700;
export const EXTENSION_AUTO_START_DELAY_MS = 500;

export const EXTENSION_UNAVAILABLE_MESSAGE =
  "Atlas extension not detected. Open this page in Chrome with the extension enabled, then click Refresh now.";

export function postLightweightRefresh(force: boolean) {
  window.postMessage(
    {
      type: LIGHTWEIGHT_REFRESH_MESSAGE,
      payload: { force },
    },
    "*",
  );
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
