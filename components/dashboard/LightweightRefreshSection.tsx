"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RefreshPayload = {
  phase?: string;
  detail?: string;
  scannedCount?: number;
  newEntriesSynced?: number;
  newCipAssessmentsSynced?: number;
  refreshedCount?: number;
  failedCount?: number;
};

type ViewState =
  | { kind: "idle" }
  | { kind: "starting"; message: string }
  | { kind: "running"; message: string }
  | { kind: "done"; message: string; payload: RefreshPayload }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

const SESSION_RUN_KEY = "portfolioiq:lightweight-refresh:ran:v1";
const SESSION_SUMMARY_KEY = "portfolioiq:lightweight-refresh:summary:v1";

function summarizeDone(payload: RefreshPayload): string {
  const parts: string[] = [];
  if ((payload.newEntriesSynced ?? 0) > 0) {
    parts.push(`${payload.newEntriesSynced} new entr${payload.newEntriesSynced === 1 ? "y" : "ies"}`);
  }
  if ((payload.newCipAssessmentsSynced ?? 0) > 0) {
    parts.push(`${payload.newCipAssessmentsSynced} CiP assessment${payload.newCipAssessmentsSynced === 1 ? "" : "s"}`);
  }
  if ((payload.refreshedCount ?? 0) > 0) {
    parts.push(`${payload.refreshedCount} older entr${payload.refreshedCount === 1 ? "y" : "ies"} refreshed`);
  }

  if (parts.length === 0) {
    return "Dashboard checked. No new entries or stale assessor snapshots were found.";
  }

  const failureSuffix =
    (payload.failedCount ?? 0) > 0
      ? ` ${payload.failedCount} refresh${payload.failedCount === 1 ? "" : "es"} still need attention.`
      : ".";

  return `Updated ${parts.join(", ")}.${failureSuffix}`;
}

function phaseMessage(payload: RefreshPayload): string {
  switch (payload.phase) {
    case "start":
      return "Starting lightweight Kaizen refresh…";
    case "dashboard":
      return "Refreshing dashboard snapshot…";
    case "profile":
      return "Refreshing profile details…";
    case "check_delta":
      return "Checking for new and stale entries…";
    case "scan_entries":
      return `Scanning recent Kaizen entries… ${payload.scannedCount ?? 0} checked`;
    case "enrich_new_entries":
      return "Importing newly found entries…";
    case "refresh_entry":
      return "Refreshing older assessor-sensitive entries…";
    case "done":
      return summarizeDone(payload);
    case "error":
      return payload.detail || "Lightweight refresh failed.";
    default:
      return "Refreshing Kaizen changes…";
  }
}

export function LightweightRefreshSection() {
  const router = useRouter();
  const ackTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const [state, setState] = useState<ViewState>(() => {
    if (typeof window === "undefined") return { kind: "idle" };

    const storedSummary = window.sessionStorage.getItem(SESSION_SUMMARY_KEY);
    if (!storedSummary) return { kind: "idle" };

    try {
      const parsed = JSON.parse(storedSummary) as RefreshPayload;
      return {
        kind: "done",
        message: summarizeDone(parsed),
        payload: parsed,
      };
    } catch {
      return { kind: "idle" };
    }
  });

  const clearAckTimer = useCallback(() => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
  }, []);

  const startRefresh = useCallback((force: boolean) => {
    if (typeof window === "undefined") return;
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setState({ kind: "starting", message: "Starting lightweight Kaizen refresh…" });

    clearAckTimer();
    ackTimerRef.current = window.setTimeout(() => {
      if (!refreshInFlightRef.current) return;
      refreshInFlightRef.current = false;
      setState({
        kind: "unavailable",
        message:
          "No response from the extension. Open Atlas in Chrome with the extension enabled to use lightweight refresh.",
      });
    }, 1800);

    window.postMessage(
      {
        type: "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH",
        payload: { force },
      },
      "*",
    );
  }, [clearAckTimer]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data) return;

      if (event.data.type === "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_ACK") {
        clearAckTimer();
        const ok = Boolean(event.data.payload?.ok);
        if (!ok) {
          refreshInFlightRef.current = false;
          setState({
            kind: "error",
            message:
              event.data.payload?.detail ||
              "Could not start lightweight refresh.",
          });
          return;
        }

        setState({
          kind: "running",
          message: "Lightweight refresh is running in the background…",
        });
        return;
      }

      if (event.data.type !== "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_PROGRESS") return;
      const payload = (event.data.payload || {}) as RefreshPayload;
      clearAckTimer();

      if (payload.phase === "done") {
        refreshInFlightRef.current = false;
        window.sessionStorage.setItem(SESSION_RUN_KEY, "1");
        window.sessionStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(payload));
        setState({
          kind: "done",
          message: summarizeDone(payload),
          payload,
        });
        router.refresh();
        return;
      }

      if (payload.phase === "error") {
        refreshInFlightRef.current = false;
        setState({
          kind: "error",
          message: phaseMessage(payload),
        });
        return;
      }

      setState({
        kind: "running",
        message: phaseMessage(payload),
      });
    }

    window.addEventListener("message", handleMessage);
    return () => {
      clearAckTimer();
      window.removeEventListener("message", handleMessage);
    };
  }, [clearAckTimer, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRun = window.sessionStorage.getItem(SESSION_RUN_KEY) === "1";
    if (hasRun) return;

    const timer = window.setTimeout(() => {
      startRefresh(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [startRefresh]);

  const tone =
    state.kind === "error" || state.kind === "unavailable"
      ? {
          border: "border-amber-300/35",
          bg: "bg-surface-2",
          badge: "bg-amber-300/12 text-amber-700 border-amber-300/35",
          label: "Needs attention",
        }
      : state.kind === "done"
        ? {
            border: "border-emerald-300/35",
            bg: "bg-surface-2",
            badge: "bg-emerald-300/12 text-emerald-700 border-emerald-300/35",
            label: "Updated",
          }
        : {
            border: "border-subtle",
            bg: "bg-surface-2",
            badge: "bg-surface-1 text-secondary border-subtle",
            label: "Running",
          };

  return (
    <section className={`rounded-lg border ${tone.border} ${tone.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-small font-semibold text-primary">Lightweight refresh</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            Checks for recent Kaizen changes and refreshes stale assessor-sensitive entries.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone.badge}`}>
          {tone.label}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-[11px] leading-5 text-secondary">
        {state.kind === "idle" ? "Waiting to start…" : state.message}
      </p>

      {(state.kind === "error" || state.kind === "unavailable" || state.kind === "done") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startRefresh(true)}
            className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
          >
            Run again
          </button>
          {state.kind === "done" ? (
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem(SESSION_RUN_KEY);
                window.sessionStorage.removeItem(SESSION_SUMMARY_KEY);
                startRefresh(true);
              }}
              className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-secondary transition hover:bg-surface-3"
            >
              Force refresh
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
