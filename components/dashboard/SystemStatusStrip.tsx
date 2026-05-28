"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EXTENSION_AUTO_START_DELAY_MS,
  EXTENSION_UNAVAILABLE_MESSAGE,
  type LightweightRefreshPayload,
} from "@/lib/extension/lightweight-refresh-client";
import { useLightweightRefreshBridge } from "@/lib/extension/use-lightweight-refresh-bridge";

type ViewState =
  | { kind: "idle" }
  | { kind: "starting"; message: string }
  | { kind: "running"; message: string }
  | { kind: "done"; message: string; payload: LightweightRefreshPayload }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

type SystemStatusStripProps = {
  lastSyncByType: Record<string, string>;
};

const SESSION_RUN_KEY = "portfolioiq:lightweight-refresh:ran:v1";
const SESSION_SUMMARY_KEY = "portfolioiq:lightweight-refresh:summary:v1";

const SYNC_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  cip_detail: "CiP detail",
  entries: "Entries",
};

function formatSyncTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3600_000);
    const diffDays = Math.floor(diffMs / 86400_000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function summarizeDone(payload: LightweightRefreshPayload): string {
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
    return "Checked. No new entries found.";
  }

  return `Updated ${parts.join(", ")}.`;
}

function phaseMessage(payload: LightweightRefreshPayload): string {
  switch (payload.phase) {
    case "scan_entries":
      return `${payload.scannedCount ?? 0} entries scanned`;
    case "done":
      return summarizeDone(payload);
    case "error":
      return payload.detail || "Refresh failed.";
    default:
      return "Refreshing ePortfolio changes.";
  }
}

export function SystemStatusStrip({ lastSyncByType }: SystemStatusStripProps) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>(() => {
    if (typeof window === "undefined") return { kind: "idle" };

    const storedSummary = window.sessionStorage.getItem(SESSION_SUMMARY_KEY);
    if (!storedSummary) return { kind: "idle" };

    try {
      const parsed = JSON.parse(storedSummary) as LightweightRefreshPayload;
      return {
        kind: "done",
        message: summarizeDone(parsed),
        payload: parsed,
      };
    } catch {
      return { kind: "idle" };
    }
  });

  const handleProgress = useCallback(
    (payload: LightweightRefreshPayload) => {
      if (payload.phase === "start") {
        setState({ kind: "running", message: "Refresh running." });
        return;
      }

      if (payload.phase === "done") {
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
    },
    [router],
  );

  const { startRefresh } = useLightweightRefreshBridge({
    onAckFailed: (detail) => {
      setState({ kind: "error", message: detail });
    },
    onProgress: handleProgress,
    onUnavailable: () => {
      setState({
        kind: "unavailable",
        message: EXTENSION_UNAVAILABLE_MESSAGE,
      });
    },
  });

  const beginRefresh = useCallback(
    (force: boolean) => {
      setState({ kind: "starting", message: "Starting refresh." });
      startRefresh(force);
    },
    [startRefresh],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRun = window.sessionStorage.getItem(SESSION_RUN_KEY) === "1";
    if (hasRun) return;

    const timer = window.setTimeout(() => {
      beginRefresh(false);
    }, EXTENSION_AUTO_START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [beginRefresh]);

  const syncTypes = Object.keys(SYNC_LABELS);
  const activeSyncCount = syncTypes.filter((type) => lastSyncByType[type]).length;
  const hasSyncHistory = activeSyncCount > 0;
  const entriesSync = lastSyncByType.entries ? formatSyncTime(lastSyncByType.entries) : "never";
  const dashboardSync = lastSyncByType.dashboard ? formatSyncTime(lastSyncByType.dashboard) : "never";
  const cipSync = lastSyncByType.cip_detail ? formatSyncTime(lastSyncByType.cip_detail) : "never";

  const isExtensionOffline = state.kind === "unavailable";
  const isAttention = state.kind === "error";
  const isRunning = state.kind === "starting" || state.kind === "running";
  const statusLabel = isAttention
    ? "Needs attention"
    : isRunning
      ? "Refreshing"
      : isExtensionOffline && !hasSyncHistory
        ? "Extension offline"
        : "Synced";
  const statusColor =
    isAttention || (isExtensionOffline && !hasSyncHistory)
      ? "var(--accent-amber)"
      : "var(--accent-green)";
  const statusMessage =
    state.kind === "idle"
      ? `${activeSyncCount} sync areas active`
      : isExtensionOffline && hasSyncHistory
        ? "Last sync on record. Enable the extension for live refresh."
        : state.message;

  return (
    <section className="rounded-lg border border-subtle bg-surface-2 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-primary">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: statusColor }}
              />
              ePortfolio status
            </span>
            <span className="text-[11px] text-muted">{statusLabel}</span>
            <span className="text-[11px] text-muted">{statusMessage}</span>
          </div>
          <p className="truncate text-[11px] text-muted">
            Entries {entriesSync} · Dashboard {dashboardSync} · CiP detail {cipSync}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => beginRefresh(true)}
            disabled={isRunning}
            className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh now
          </button>
          {state.kind === "done" ? (
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.removeItem(SESSION_RUN_KEY);
                window.sessionStorage.removeItem(SESSION_SUMMARY_KEY);
                beginRefresh(true);
              }}
              className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-secondary transition hover:bg-surface-3"
            >
              Force refresh
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
