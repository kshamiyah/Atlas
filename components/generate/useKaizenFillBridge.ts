"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KaizenFillPayload } from "@/lib/kaizen/fill-payload";

export type KaizenBridgeStatus = "checking" | "ready" | "missing";

const ACK_TIMEOUT_MS = 4000;
const DETECT_ATTEMPTS = 10;
const DETECT_INTERVAL_MS = 300;

export const BRIDGE_MESSAGE = {
  ping: "PORTFOLIOIQ_BRIDGE_PING",
  pong: "PORTFOLIOIQ_BRIDGE_PONG",
  ready: "PORTFOLIOIQ_BRIDGE_READY",
  queueFill: "PORTFOLIOIQ_QUEUE_FILL",
  queueFillAck: "PORTFOLIOIQ_QUEUE_FILL_ACK",
} as const;

export function hasExtensionMarker(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-portfolioiq-extension") === "1";
}

export type QueueFillResult = {
  ok: boolean;
  error?: string;
};

export function useKaizenFillBridge() {
  const [status, setStatus] = useState<KaizenBridgeStatus>(() =>
    hasExtensionMarker() ? "ready" : "checking",
  );
  const [lastQueueError, setLastQueueError] = useState<string | null>(null);
  const detectGenerationRef = useRef(0);

  const syncStatusFromMarker = useCallback(() => {
    if (hasExtensionMarker()) {
      setStatus("ready");
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (syncStatusFromMarker()) return;

    const generation = ++detectGenerationRef.current;
    let attempts = 0;

    function markReady() {
      if (generation !== detectGenerationRef.current) return;
      setStatus("ready");
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window || !event.data) return;
      const type = event.data.type;
      if (
        type === BRIDGE_MESSAGE.pong ||
        type === BRIDGE_MESSAGE.ready ||
        type === BRIDGE_MESSAGE.queueFillAck
      ) {
        markReady();
      }
    }

    window.addEventListener("message", onMessage);

    const intervalId = window.setInterval(() => {
      if (generation !== detectGenerationRef.current) return;

      if (syncStatusFromMarker()) {
        window.clearInterval(intervalId);
        return;
      }

      window.postMessage({ type: BRIDGE_MESSAGE.ping }, "*");
      attempts += 1;

      if (attempts >= DETECT_ATTEMPTS) {
        window.clearInterval(intervalId);
        setStatus("missing");
      }
    }, DETECT_INTERVAL_MS);

    window.postMessage({ type: BRIDGE_MESSAGE.ping }, "*");

    return () => {
      detectGenerationRef.current += 1;
      window.removeEventListener("message", onMessage);
      window.clearInterval(intervalId);
    };
  }, [syncStatusFromMarker]);

  const queueFill = useCallback(
    async (payload: KaizenFillPayload): Promise<QueueFillResult> => {
      setLastQueueError(null);

      return new Promise((resolve) => {
        let settled = false;

        function finish(result: QueueFillResult) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          window.removeEventListener("message", onAck);

          if (result.ok) {
            setStatus("ready");
            setLastQueueError(null);
          } else if (!hasExtensionMarker()) {
            setStatus("missing");
            setLastQueueError(result.error ?? "Extension bridge not available");
          } else {
            setStatus("ready");
            setLastQueueError(
              result.error ?? "Could not confirm fields were queued — try again",
            );
          }

          resolve(result);
        }

        function onAck(event: MessageEvent) {
          if (event.source !== window || !event.data) return;
          if (event.data.type !== BRIDGE_MESSAGE.queueFillAck) return;

          const ok = Boolean(event.data.payload?.ok ?? true);
          finish({
            ok,
            error:
              ok
                ? undefined
                : String(event.data.payload?.error ?? "Queue rejected by extension"),
          });
        }

        const timeoutId = window.setTimeout(
          () =>
            finish({
              ok: false,
              error: "Timed out waiting for extension — reload Atlas extension and try again",
            }),
          ACK_TIMEOUT_MS,
        );

        window.addEventListener("message", onAck);
        window.postMessage({ type: BRIDGE_MESSAGE.queueFill, payload }, "*");
      });
    },
    [],
  );

  const recheck = useCallback(() => {
    setLastQueueError(null);
    setStatus("checking");
    detectGenerationRef.current += 1;
    const generation = ++detectGenerationRef.current;

    if (syncStatusFromMarker()) return;

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      if (generation !== detectGenerationRef.current) {
        window.clearInterval(intervalId);
        return;
      }

      if (syncStatusFromMarker()) {
        window.clearInterval(intervalId);
        return;
      }

      window.postMessage({ type: BRIDGE_MESSAGE.ping }, "*");
      attempts += 1;
      if (attempts >= DETECT_ATTEMPTS) {
        window.clearInterval(intervalId);
        setStatus("missing");
      }
    }, DETECT_INTERVAL_MS);
  }, [syncStatusFromMarker]);

  const extensionPresent = status === "ready" || hasExtensionMarker();

  return {
    status,
    extensionPresent,
    lastQueueError,
    queueFill,
    recheck,
  };
};
