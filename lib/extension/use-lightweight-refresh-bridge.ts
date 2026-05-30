"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  EXTENSION_ACK_RETRY_MS,
  EXTENSION_ACK_TIMEOUT_MS,
  EXTENSION_UNAVAILABLE_MESSAGE,
  isLightweightRefreshAck,
  isLightweightRefreshProgress,
  postPortfolioSync,
  type LightweightRefreshPayload,
  type SyncMode,
} from "@/lib/extension/lightweight-refresh-client";

type RefreshHandlers = {
  onAckFailed: (detail: string) => void;
  onProgress: (payload: LightweightRefreshPayload) => void;
  onUnavailable: () => void;
};

export function useLightweightRefreshBridge(handlers: RefreshHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const ackTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const finishUnavailable = useCallback(() => {
    if (!refreshInFlightRef.current) return;
    refreshInFlightRef.current = false;
    clearTimers();
    handlersRef.current.onUnavailable();
  }, [clearTimers]);

  const scheduleRetry = useCallback(function retry(force: boolean, syncMode: SyncMode) {
    retryTimerRef.current = window.setTimeout(() => {
      if (!refreshInFlightRef.current) return;
      postPortfolioSync({ force, syncMode });
      scheduleRetry(force, syncMode);
    }, EXTENSION_ACK_RETRY_MS);
  }, []);

  const startRefresh = useCallback(
    (force: boolean, syncMode: SyncMode = "light") => {
      if (typeof window === "undefined") return;
      if (refreshInFlightRef.current) return;

      refreshInFlightRef.current = true;
      clearTimers();

      ackTimerRef.current = window.setTimeout(() => {
        finishUnavailable();
      }, EXTENSION_ACK_TIMEOUT_MS);

      postPortfolioSync({ force, syncMode });
      scheduleRetry(force, syncMode);
    },
    [clearTimers, finishUnavailable, scheduleRetry],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data) return;

      if (isLightweightRefreshAck(event.data)) {
        clearTimers();
        const ok = Boolean(event.data.payload?.ok);
        if (!ok) {
          refreshInFlightRef.current = false;
          handlersRef.current.onAckFailed(
            event.data.payload?.detail || "Could not start refresh.",
          );
          return;
        }
        handlersRef.current.onProgress({ phase: "start" });
        return;
      }

      if (!isLightweightRefreshProgress(event.data)) return;
      clearTimers();

      const payload = event.data.payload || {};
      if (payload.phase === "done" || payload.phase === "error") {
        refreshInFlightRef.current = false;
      }
      handlersRef.current.onProgress(payload);
    }

    window.addEventListener("message", handleMessage);
    return () => {
      clearTimers();
      window.removeEventListener("message", handleMessage);
    };
  }, [clearTimers]);

  return { startRefresh, refreshInFlightRef };
}

export { EXTENSION_UNAVAILABLE_MESSAGE };
