"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReviewFilters } from "@/components/key-skill-review/ReviewFilters";
import { ReviewQueue } from "@/components/key-skill-review/ReviewQueue";
import type { ReviewQueueMode } from "@/components/key-skill-review/ReviewQueue";
import { CoverageSummary } from "@/components/key-skill-review/CoverageSummary";
import { ReviewSkeleton } from "@/components/key-skill-review/ReviewSkeleton";
import {
  type ReviewEntry,
  type SkillSuggestion,
} from "@/lib/types/key-skill-review";
import type {
  AnalyseDescriptorsBody,
  AnalyseDescriptorsResponse,
  BootstrapResponse,
  PushQueueEntry,
  PushQueueResponse,
  QueueResponse,
  SuggestCrossCipResponse,
  UpdateSuggestionStatusBody,
} from "@/lib/types/key-skill-review-api";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "@/components/key-skill-review/ReviewFilters";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

type PendingConfirm = {
  label: string;
  description: string;
  count: number;
  onConfirm: () => void;
};

function ConfirmModal({
  label,
  description,
  count,
  onConfirm,
  onCancel,
}: PendingConfirm & { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm card p-6 shadow-2xl space-y-4">
        <div className="space-y-1.5">
          <h3 className="text-small font-semibold text-primary">{label}</h3>
          <p className="text-micro text-secondary">{description}</p>
          {count > 0 && (
            <p className="text-micro font-medium text-accent-amber">
              {count} suggestion{count !== 1 ? "s" : ""} will be affected.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary text-[11px]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast system ──────────────────────────────────────────────────────────────

type Toast = {
  id: string;
  message: string;
  onUndo?: () => void;
};

type SyncProgressPayload = {
  phase:
    | "start"
    | "item-start"
    | "item-done"
    | "item-error"
    | "done"
    | "error";
  index?: number;
  total?: number;
  title?: string;
  detail?: string;
  successCount?: number;
  failureCount?: number;
};

function formatQueueStatus(status: PushQueueEntry["status"]): string {
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  if (status === "synced") return "Synced";
  return "Pending";
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg border border-subtle bg-surface-2 px-4 py-2.5 shadow-xl text-small text-primary min-w-[260px] animate-fade-up"
        >
          <span className="flex-1 text-[13px]">{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => {
                toast.onUndo?.();
                onDismiss(toast.id);
              }}
              className="shrink-0 text-xs font-semibold text-accent-blue hover:underline"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-muted hover:text-primary text-base leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KeySkillReviewPage() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [pushQueue, setPushQueue] = useState<PushQueueResponse>( {
    queue_available: true,
    summary: { total: 0, pending: 0, running: 0, synced: 0, failed: 0 },
    entries: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [queueProgressMessage, setQueueProgressMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [query, setQuery] = useState("");
  const [queueMode, setQueueMode] = useState<ReviewQueueMode>("focus");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const queueAckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueProgressHeartbeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast helpers ─────────────────────────────────────────────────────────

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, 6000);
    toastTimers.current.set(id, timer);
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    const data = await fetchJson<QueueResponse>("/api/key-skill-review/queue");
    setEntries(data.entries);
  }, []);

  const loadPushQueue = useCallback(async () => {
    const data = await fetchJson<PushQueueResponse>("/api/key-skill-review/push-queue");
    setPushQueue(data);
  }, []);

  const refreshQueueHeartbeat = useCallback(() => {
    if (queueProgressHeartbeatTimer.current) {
      clearTimeout(queueProgressHeartbeatTimer.current);
      queueProgressHeartbeatTimer.current = null;
    }
    queueProgressHeartbeatTimer.current = setTimeout(() => {
      setIsSyncingQueue(false);
      setQueueProgressMessage(
        "Background worker stopped reporting progress. Reload extension and retry.",
      );
      void loadPushQueue();
      queueProgressHeartbeatTimer.current = null;
    }, 15000);
  }, [loadPushQueue]);

  const reloadAllQueues = useCallback(async () => {
    const [queueResult, pushQueueResult] = await Promise.allSettled([
      loadQueue(),
      loadPushQueue(),
    ]);

    if (queueResult.status === "rejected") {
      throw queueResult.reason;
    }

    if (pushQueueResult.status === "rejected") {
      setPushQueue({
        queue_available: false,
        summary: { total: 0, pending: 0, running: 0, synced: 0, failed: 0 },
        entries: [],
      });
    }
  }, [loadPushQueue, loadQueue]);

  const bootstrapAndLoad = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await fetchJson<BootstrapResponse>("/api/key-skill-review/bootstrap", {
        method: "POST",
      });
      await reloadAllQueues();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setIsLoading(false);
    }
  }, [reloadAllQueues]);

  useEffect(() => {
    void bootstrapAndLoad();
  }, [bootstrapAndLoad]);

  useEffect(() => {
    function onWindowMessage(event: MessageEvent) {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }

      const payload = event.data as {
        type?: string;
        payload?: unknown;
      };

      if (payload.type === "PORTFOLIOIQ_SYNC_CROSS_CIP_ACK") {
        if (queueAckTimer.current) {
          clearTimeout(queueAckTimer.current);
          queueAckTimer.current = null;
        }
        const ok = Boolean(
          payload.payload &&
            typeof payload.payload === "object" &&
            "ok" in payload.payload &&
            (payload.payload as { ok?: boolean }).ok,
        );
        if (!ok) {
          setIsSyncingQueue(false);
          const detail =
            payload.payload &&
            typeof payload.payload === "object" &&
            "detail" in payload.payload &&
            typeof (payload.payload as { detail?: string }).detail === "string"
              ? (payload.payload as { detail: string }).detail
              : "Could not start extension worker.";
          setQueueProgressMessage(detail);
          if (queueProgressHeartbeatTimer.current) {
            clearTimeout(queueProgressHeartbeatTimer.current);
            queueProgressHeartbeatTimer.current = null;
          }
        } else {
          refreshQueueHeartbeat();
        }
        return;
      }

      if (payload.type !== "PORTFOLIOIQ_CROSS_CIP_PROGRESS") return;
      const progress = payload.payload as SyncProgressPayload | undefined;
      if (!progress) return;

      if (progress.phase === "start") {
        if (queueAckTimer.current) {
          clearTimeout(queueAckTimer.current);
          queueAckTimer.current = null;
        }
        setIsSyncingQueue(true);
        setQueueProgressMessage(
          `Syncing ${progress.total ?? 0} entr${(progress.total ?? 0) === 1 ? "y" : "ies"}...`,
        );
        refreshQueueHeartbeat();
      } else if (progress.phase === "item-start") {
        setQueueProgressMessage(
          `Syncing ${progress.index ?? 0}/${progress.total ?? 0}: ${progress.title ?? "entry"}`,
        );
        refreshQueueHeartbeat();
      } else if (progress.phase === "item-done") {
        setQueueProgressMessage(
          `Synced ${progress.index ?? 0}/${progress.total ?? 0}: ${progress.title ?? "entry"}`,
        );
        refreshQueueHeartbeat();
      } else if (progress.phase === "item-error") {
        setQueueProgressMessage(
          `Failed ${progress.index ?? 0}/${progress.total ?? 0}: ${progress.detail ?? "Unknown error"}`,
        );
        refreshQueueHeartbeat();
      } else if (progress.phase === "done") {
        setIsSyncingQueue(false);
        if (queueProgressHeartbeatTimer.current) {
          clearTimeout(queueProgressHeartbeatTimer.current);
          queueProgressHeartbeatTimer.current = null;
        }
        setQueueProgressMessage(
          `Sync complete (${progress.successCount ?? 0} success, ${progress.failureCount ?? 0} failed)`,
        );
        void loadPushQueue();
      } else if (progress.phase === "error") {
        setIsSyncingQueue(false);
        if (queueProgressHeartbeatTimer.current) {
          clearTimeout(queueProgressHeartbeatTimer.current);
          queueProgressHeartbeatTimer.current = null;
        }
        setQueueProgressMessage(progress.detail ?? "Background sync failed");
        void loadPushQueue();
      }
    }

    window.addEventListener("message", onWindowMessage);
    return () => {
      window.removeEventListener("message", onWindowMessage);
    };
  }, [loadPushQueue, refreshQueueHeartbeat]);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) {
        clearTimeout(timer);
      }
      toastTimers.current.clear();
      if (queueAckTimer.current) {
        clearTimeout(queueAckTimer.current);
        queueAckTimer.current = null;
      }
      if (queueProgressHeartbeatTimer.current) {
        clearTimeout(queueProgressHeartbeatTimer.current);
        queueProgressHeartbeatTimer.current = null;
      }
    },
    [],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasAnySuggestions = useMemo(
    () =>
      entries.some(
        (e) =>
          e.linked_cip_suggestions.length > 0 ||
          e.cross_cip_suggestions.length > 0,
      ),
    [entries],
  );

  const entriesWithoutSuggestions = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.linked_cip_suggestions.length === 0 &&
          e.cross_cip_suggestions.length === 0,
      ),
    [entries],
  );

  const hasAnyConfirmed = useMemo(
    () =>
      entries.some(
        (e) =>
          e.linked_cip_suggestions.some((s) => s.status === "confirmed") ||
          e.cross_cip_suggestions.some((s) => s.status === "confirmed"),
      ),
    [entries],
  );

  const reviewStats = useMemo(() => {
    const all = entries.flatMap((e) => [
      ...e.linked_cip_suggestions,
      ...e.cross_cip_suggestions,
    ]);
    const total = all.length;
    const pending = all.filter((s) => s.status === "suggested").length;
    const confirmed = all.filter((s) => s.status === "confirmed").length;
    const rejected = all.filter((s) => s.status === "rejected").length;
    const crossPending = entries
      .flatMap((e) => e.cross_cip_suggestions)
      .filter((s) => s.status === "suggested").length;
    return { total, pending, confirmed, rejected, crossPending };
  }, [entries]);

  // ── Optimistic state updater ──────────────────────────────────────────────

  function applyLocalStatusUpdate(
    entryId: string,
    suggestionId: string,
    source: SkillSuggestion["source"],
    status: SkillSuggestion["status"],
  ) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const key =
          source === "linked_cip" ? "linked_cip_suggestions" : "cross_cip_suggestions";
        return {
          ...entry,
          [key]: entry[key].map((s: SkillSuggestion) =>
            s.suggestion_id === suggestionId ? { ...s, status } : s,
          ),
        };
      }),
    );
  }

  // ── Individual suggestion update (optimistic + undo toast) ───────────────

  async function handleUpdateSuggestion(
    entryId: string,
    suggestionId: string,
    source: SkillSuggestion["source"],
    nextStatus: SkillSuggestion["status"],
  ) {
    if (!suggestionId) return;

    // Capture previous status for undo
    let prevStatus: SkillSuggestion["status"] = "suggested";
    for (const entry of entries) {
      if (entry.id !== entryId) continue;
      const arr =
        source === "linked_cip"
          ? entry.linked_cip_suggestions
          : entry.cross_cip_suggestions;
      const match = arr.find((s) => s.suggestion_id === suggestionId);
      if (match) { prevStatus = match.status; break; }
    }

    // Optimistic UI update before API call
    applyLocalStatusUpdate(entryId, suggestionId, source, nextStatus);
    setErrorMessage(null);

    // Show undo toast for confirm / reject
    if (nextStatus === "confirmed" || nextStatus === "rejected") {
      addToast({
        message: nextStatus === "confirmed" ? "Suggestion confirmed" : "Suggestion rejected",
        onUndo: () => {
          applyLocalStatusUpdate(entryId, suggestionId, source, prevStatus);
          void fetchJson<{ ok: true }>("/api/key-skill-review/status", {
            method: "PATCH",
            body: JSON.stringify({
              suggestion_id: suggestionId,
              status: prevStatus,
            } as UpdateSuggestionStatusBody),
          }).catch((err) => {
            setErrorMessage(err instanceof Error ? err.message : "Failed to undo");
          }).then(() => {
            void loadPushQueue();
          });
        },
      });
    }

    // Background API call — UI already updated
    try {
      await fetchJson<{ ok: true }>("/api/key-skill-review/status", {
        method: "PATCH",
        body: JSON.stringify({
          suggestion_id: suggestionId,
          status: nextStatus,
        } as UpdateSuggestionStatusBody),
      });
      void loadPushQueue();
    } catch (err) {
      // Revert on failure
      applyLocalStatusUpdate(entryId, suggestionId, source, prevStatus);
      setErrorMessage(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function handleConfirmAllHighConfidenceLinked() {
    const toConfirm: { suggestionId: string }[] = [];
    for (const entry of entries) {
      for (const s of entry.linked_cip_suggestions) {
        if (s.confidence >= 0.8 && s.status !== "confirmed" && s.suggestion_id) {
          toConfirm.push({ suggestionId: s.suggestion_id });
        }
      }
    }
    if (toConfirm.length === 0) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        toConfirm.map(({ suggestionId }) =>
          fetchJson<{ ok: true }>("/api/key-skill-review/status", {
            method: "PATCH",
            body: JSON.stringify({ suggestion_id: suggestionId, status: "confirmed" }),
          }),
        ),
      );
      await reloadAllQueues();
      addToast({ message: `${toConfirm.length} suggestion${toConfirm.length !== 1 ? "s" : ""} confirmed` });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to confirm suggestions");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleResetAllToSuggested() {
    const toReset: { suggestionId: string }[] = [];
    for (const entry of entries) {
      for (const s of [...entry.linked_cip_suggestions, ...entry.cross_cip_suggestions]) {
        if (s.status === "rejected" && s.suggestion_id) {
          toReset.push({ suggestionId: s.suggestion_id });
        }
      }
    }
    if (toReset.length === 0) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        toReset.map(({ suggestionId }) =>
          fetchJson<{ ok: true }>("/api/key-skill-review/status", {
            method: "PATCH",
            body: JSON.stringify({ suggestion_id: suggestionId, status: "suggested" }),
          }),
        ),
      );
      await reloadAllQueues();
      addToast({ message: `${toReset.length} suggestion${toReset.length !== 1 ? "s" : ""} reset to suggested` });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reset suggestions");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSuggestCrossCip() {
    setIsMutating(true);
    setErrorMessage(null);
    try {
      await fetchJson<SuggestCrossCipResponse>(
        "/api/key-skill-review/suggest-cross-cip",
        { method: "POST" },
      );
      await reloadAllQueues();
      addToast({ message: "Cross-CiP AI suggestions refreshed" });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate cross-CiP suggestions");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleAnalyseDescriptors() {
    setIsMutating(true);
    setErrorMessage(null);
    try {
      const body: AnalyseDescriptorsBody = {};
      await fetchJson<AnalyseDescriptorsResponse>(
        "/api/key-skill-review/analyse-descriptors",
        { method: "POST", body: JSON.stringify(body) },
      );
      await reloadAllQueues();
      addToast({ message: "Descriptor AI analysis completed" });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to analyse descriptors");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleGenerateForEmpty() {
    if (entriesWithoutSuggestions.length === 0) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      for (const entry of entriesWithoutSuggestions) {
        await fetchJson<{ inserted: number }>("/api/key-skill-review/generate", {
          method: "POST",
          body: JSON.stringify({ review_entry_id: entry.id }),
        });
      }
      await reloadAllQueues();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate suggestions");
    } finally {
      setIsMutating(false);
    }
  }

  // ── Bulk action modal triggers ────────────────────────────────────────────

  function requestConfirmAllHighConfidence() {
    const count = entries.reduce(
      (acc, e) =>
        acc +
        e.linked_cip_suggestions.filter(
          (s) => s.confidence >= 0.8 && s.status !== "confirmed" && s.suggestion_id,
        ).length,
      0,
    );
    if (count === 0) return;
    setPendingConfirm({
      label: "Confirm all high-confidence linked-CiP suggestions",
      description:
        "Confirms all linked-CiP suggestions with ≥80% confidence that haven't been confirmed yet.",
      count,
      onConfirm: () => {
        setPendingConfirm(null);
        void handleConfirmAllHighConfidenceLinked();
      },
    });
  }

  function requestResetAllToSuggested() {
    const count = entries.reduce(
      (acc, e) =>
        acc +
        [...e.linked_cip_suggestions, ...e.cross_cip_suggestions].filter(
          (s) => s.status === "rejected" && s.suggestion_id,
        ).length,
      0,
    );
    if (count === 0) return;
    setPendingConfirm({
      label: "Reset all rejected suggestions",
      description:
        "Resets all rejected suggestions back to suggested status across all entries.",
      count,
      onConfirm: () => {
        setPendingConfirm(null);
        void handleResetAllToSuggested();
      },
    });
  }

  const syncableQueueEntries = useMemo(
    () => pushQueue.entries.filter((entry) => entry.status === "pending" || entry.status === "failed"),
    [pushQueue.entries],
  );

  function applyQuickFocusPreset(
    preset: "pending" | "cross_pending" | "high_confidence",
  ) {
    if (preset === "pending") {
      setStatusFilter("suggested");
      setSourceFilter("all");
      setConfidenceFilter("all");
      setQuery("");
      setQueueMode("focus");
      return;
    }

    if (preset === "cross_pending") {
      setStatusFilter("suggested");
      setSourceFilter("cross_cip");
      setConfidenceFilter("all");
      setQuery("");
      setQueueMode("focus");
      return;
    }

    setStatusFilter("suggested");
    setSourceFilter("all");
    setConfidenceFilter("gte_0_7");
    setQuery("");
    setQueueMode("focus");
  }

  function startBackgroundQueueSync(mode: "all" | "failed") {
    if (!pushQueue.queue_available) {
      setQueueProgressMessage("Queue storage is unavailable. Run the latest migration first.");
      return;
    }

    const targetEntries =
      mode === "failed"
        ? pushQueue.entries.filter((entry) => entry.status === "failed")
        : syncableQueueEntries;

    if (targetEntries.length === 0) {
      setQueueProgressMessage("No queued entries need syncing.");
      return;
    }

    if (queueAckTimer.current) {
      clearTimeout(queueAckTimer.current);
      queueAckTimer.current = null;
    }

    setIsSyncingQueue(true);
    setQueueProgressMessage("Starting extension background sync...");

    queueAckTimer.current = setTimeout(() => {
      setIsSyncingQueue(false);
      setQueueProgressMessage(
        "No response from the extension. Check PortfolioIQ extension is enabled on this site.",
      );
      queueAckTimer.current = null;
    }, 3500);

    window.postMessage(
      {
        type: "PORTFOLIOIQ_SYNC_CROSS_CIP_QUEUE",
        payload: {
          items: targetEntries.map((entry) => ({
            review_entry_id: entry.review_entry_id,
            title: entry.title,
            entry_edit_url: entry.entry_edit_url,
            suggestion_ids: entry.suggestion_ids,
            skills: entry.skills,
          })),
        },
      },
      "*",
    );
  }

  const actionDisabled = isMutating || isLoading;
  const canConfirmAllHighConfidence = hasAnySuggestions;
  const canResetRejected = hasAnySuggestions;
  const canGenerateForEmpty = entriesWithoutSuggestions.length > 0;
  const canGenerateCrossCip = entries.length > 0;
  const canAnalyseDescriptors = hasAnyConfirmed;
  const hasAnyBulkAction =
    canConfirmAllHighConfidence ||
    canResetRejected ||
    canGenerateForEmpty;
  const queueSummary = pushQueue.summary;
  const canRunQueueSync = !isSyncingQueue && syncableQueueEntries.length > 0;
  const canRetryFailedQueue =
    !isSyncingQueue && pushQueue.entries.some((entry) => entry.status === "failed");
  const activeQueueEntries = useMemo(
    () => pushQueue.entries.filter((entry) => entry.status !== "synced"),
    [pushQueue.entries],
  );
  const syncedQueueEntries = useMemo(
    () => pushQueue.entries.filter((entry) => entry.status === "synced"),
    [pushQueue.entries],
  );

  return (
    <>
      {pendingConfirm && (
        <ConfirmModal
          {...pendingConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="min-h-full">
        <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
          <header className="relative overflow-hidden rounded-3xl border border-subtle bg-surface-2 p-6 md:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(620px 230px at 15% -12%, rgba(0,113,227,0.15), transparent 68%), radial-gradient(420px 180px at 88% 0%, rgba(0,0,0,0.06), transparent 72%)",
              }}
            />
            <div className="relative space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                Attribution workflow
              </p>
              <h1 className="text-heading-1 font-semibold text-primary">
              Key skill review
              </h1>
              <p className="max-w-3xl text-small leading-relaxed text-secondary">
                Work through suggestions with a calmer, one-entry-at-a-time flow.
                Keep controls tucked away until you need them.
              </p>
            </div>
          </header>

          {errorMessage && (
            <div
              className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-small text-accent-red"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {!isLoading && (
            <section className="card p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Pending</p>
                    <p className="mt-1 text-heading-3 font-semibold text-primary">{reviewStats.pending}</p>
                  </div>
                  <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Confirmed</p>
                    <p className="mt-1 text-heading-3 font-semibold text-accent-blue">{reviewStats.confirmed}</p>
                  </div>
                  <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Rejected</p>
                    <p className="mt-1 text-heading-3 font-semibold text-secondary">{reviewStats.rejected}</p>
                  </div>
                  <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Cross-CiP pending</p>
                    <p className="mt-1 text-heading-3 font-semibold text-primary">{reviewStats.crossPending}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-small font-semibold text-primary">Quick focus</h2>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("all");
                        setSourceFilter("all");
                        setConfidenceFilter("all");
                        setQuery("");
                      }}
                      className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[11px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyQuickFocusPreset("pending")}
                      className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-secondary transition hover:bg-surface-3 hover:text-primary"
                    >
                      Review pending suggestions
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickFocusPreset("cross_pending")}
                      className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-secondary transition hover:bg-surface-3 hover:text-primary"
                    >
                      Review cross-CiP only
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickFocusPreset("high_confidence")}
                      className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-secondary transition hover:bg-surface-3 hover:text-primary"
                    >
                      High-confidence first
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-subtle pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-small font-semibold text-primary">AI Assist</h2>
                  <span className="text-[11px] text-muted">Your premium automation tools</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <section className="ai-feature-card">
                    <div className="flex items-center gap-2">
                      <span className="ai-feature-icon">AI</span>
                      <h3 className="text-xs font-semibold text-primary">Cross-CiP Suggestions</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-secondary">
                      AI scans each entry and proposes relevant skills from other CiPs you may have missed.
                    </p>
                    <button
                      type="button"
                      onClick={handleSuggestCrossCip}
                      disabled={actionDisabled || !canGenerateCrossCip}
                      className="btn-ai mt-3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Run cross-CiP AI
                    </button>
                  </section>

                  <section className="ai-feature-card">
                    <div className="flex items-center gap-2">
                      <span className="ai-feature-icon">AI</span>
                      <h3 className="text-xs font-semibold text-primary">Descriptor Analysis</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-secondary">
                      AI maps descriptor-level evidence and highlights supporting quotes for each skill.
                    </p>
                    {!canAnalyseDescriptors && (
                      <p className="mt-1 text-[11px] text-muted">
                        Requires at least one confirmed skill suggestion.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleAnalyseDescriptors}
                      disabled={actionDisabled || !canAnalyseDescriptors}
                      className="btn-ai mt-3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Run descriptor AI
                    </button>
                  </section>
                </div>
              </div>

              <div className="mt-4 border-t border-subtle pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-small font-semibold text-primary">Kaizen Sync Queue</h2>
                    <p className="text-[11px] text-muted">
                      Push confirmed cross-CiP skills back to Kaizen in the background.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadPushQueue()}
                    className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[11px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
                  >
                    Refresh
                  </button>
                </div>

                {!pushQueue.queue_available ? (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700">
                    Queue table is not available yet. Run database migration{" "}
                    <code>0013_key_skill_push_queue.sql</code>.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                      <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Pending
                        </p>
                        <p className="mt-1 text-heading-3 font-semibold text-primary">
                          {queueSummary.pending}
                        </p>
                      </div>
                      <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Running
                        </p>
                        <p className="mt-1 text-heading-3 font-semibold text-accent-blue">
                          {queueSummary.running}
                        </p>
                      </div>
                      <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Synced
                        </p>
                        <p className="mt-1 text-heading-3 font-semibold text-primary">
                          {queueSummary.synced}
                        </p>
                      </div>
                      <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Failed
                        </p>
                        <p className="mt-1 text-heading-3 font-semibold text-accent-red">
                          {queueSummary.failed}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startBackgroundQueueSync("all")}
                        disabled={!canRunQueueSync}
                        className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSyncingQueue ? "Syncing..." : "Run Background Sync"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startBackgroundQueueSync("failed")}
                        disabled={!canRetryFailedQueue}
                        className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Retry failed only
                      </button>
                    </div>

                    {queueProgressMessage && (
                      <p className="mt-2 text-xs text-secondary">{queueProgressMessage}</p>
                    )}

                    <div className="mt-3 space-y-2">
                      {activeQueueEntries.length === 0 ? (
                        <p className="rounded-xl border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-muted">
                          No pending or failed sync items right now.
                        </p>
                      ) : (
                        <>
                          {activeQueueEntries.slice(0, 5).map((entry) => (
                            <article
                              key={entry.review_entry_id}
                              className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-primary line-clamp-1">
                                  {entry.title}
                                </p>
                                <span
                                  className="rounded-full border border-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary"
                                >
                                  {formatQueueStatus(entry.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted">
                                {entry.skills.length} skill{entry.skills.length !== 1 ? "s" : ""}
                                {entry.entry_edit_url ? "" : " • missing Kaizen edit URL"}
                              </p>
                              {entry.last_error && (
                                <p className="mt-1 text-[11px] text-accent-red">{entry.last_error}</p>
                              )}
                            </article>
                          ))}
                          {activeQueueEntries.length > 5 && (
                            <p className="text-[11px] text-muted">
                              Showing first 5 of {activeQueueEntries.length} active queue entries.
                            </p>
                          )}
                        </>
                      )}

                      {syncedQueueEntries.length > 0 && (
                        <details className="rounded-xl border border-subtle bg-surface-1 p-3">
                          <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                            Show synced history ({syncedQueueEntries.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {syncedQueueEntries.slice(0, 10).map((entry) => (
                              <article
                                key={`${entry.review_entry_id}-synced`}
                                className="rounded-lg border border-subtle bg-surface-2 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-primary line-clamp-1">
                                    {entry.title}
                                  </p>
                                  <span className="rounded-full border border-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary">
                                    Synced
                                  </span>
                                </div>
                              </article>
                            ))}
                            {syncedQueueEntries.length > 10 && (
                              <p className="text-[11px] text-muted">
                                Showing first 10 of {syncedQueueEntries.length} synced entries.
                              </p>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {isLoading ? (
            <ReviewSkeleton />
          ) : (
            <div
              className={`grid gap-5 ${
                isSidebarCollapsed
                  ? "lg:grid-cols-1"
                  : "lg:grid-cols-[300px_minmax(0,1fr)]"
              }`}
            >
              {!isSidebarCollapsed && (
                <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
                  <CoverageSummary entries={entries} />

                  <details className="card p-4">
                    <summary className="cursor-pointer text-small font-semibold text-primary">
                      Filters and search
                    </summary>
                    <div className="mt-3">
                      <ReviewFilters
                        status={statusFilter}
                        source={sourceFilter}
                        confidence={confidenceFilter}
                        query={query}
                        onStatusChange={setStatusFilter}
                        onSourceChange={setSourceFilter}
                        onConfidenceChange={setConfidenceFilter}
                        onQueryChange={setQuery}
                      />
                    </div>
                  </details>

                  <details className="card p-4">
                    <summary className="cursor-pointer text-small font-semibold text-primary">
                      Batch actions
                    </summary>
                    <div className="mt-3 space-y-3">
                      {hasAnyBulkAction ? (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {canConfirmAllHighConfidence && (
                              <button
                                type="button"
                                onClick={requestConfirmAllHighConfidence}
                                disabled={actionDisabled}
                                className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Confirm high-confidence
                              </button>
                            )}
                            {canGenerateForEmpty && (
                              <button
                                type="button"
                                onClick={handleGenerateForEmpty}
                                disabled={actionDisabled}
                                className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Generate missing suggestions
                              </button>
                            )}
                          </div>

                          <div className="rounded-xl border border-subtle bg-surface-1 p-3">
                            <p className="text-[11px] font-medium text-secondary">
                              Advanced tools
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canResetRejected && (
                                <button
                                  type="button"
                                  onClick={requestResetAllToSuggested}
                                  disabled={actionDisabled}
                                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Reset rejected to suggested
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted">
                          No bulk actions available yet.
                        </p>
                      )}
                    </div>
                  </details>
                </aside>
              )}

              <div className="flex flex-col gap-3">
                <section className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Review style
                      </p>
                      <h2 className="text-small font-semibold text-primary">
                        Choose your pace
                      </h2>
                    </div>
                    <div className="inline-flex rounded-full border border-subtle bg-surface-1 p-1">
                      <button
                        type="button"
                        onClick={() => setQueueMode("focus")}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          queueMode === "focus"
                            ? "bg-surface-2 text-primary shadow-sm"
                            : "text-secondary hover:text-primary"
                        }`}
                      >
                        Focus mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setQueueMode("list")}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          queueMode === "list"
                            ? "bg-surface-2 text-primary shadow-sm"
                            : "text-secondary hover:text-primary"
                        }`}
                      >
                        List mode
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed((v) => !v)}
                      className="btn-secondary text-xs"
                    >
                      {isSidebarCollapsed ? "Show left panel" : "Hide left panel"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-secondary">
                    Focus mode shows one entry at a time for faster decisions. List mode keeps full context.
                  </p>
                </section>

                <ReviewQueue
                  key={`${statusFilter}|${sourceFilter}|${confidenceFilter}|${queueMode}|${query}`}
                  entries={entries}
                  statusFilter={statusFilter}
                  sourceFilter={sourceFilter}
                  confidenceFilter={confidenceFilter}
                  query={query}
                  mode={queueMode}
                  onUpdateSuggestion={handleUpdateSuggestion}
                  disabled={actionDisabled}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
