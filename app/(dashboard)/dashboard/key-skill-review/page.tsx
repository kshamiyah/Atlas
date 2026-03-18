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
              className="text-xs font-semibold text-accent-green hover:underline shrink-0"
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
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const bootstrapAndLoad = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await fetchJson<BootstrapResponse>("/api/key-skill-review/bootstrap", {
        method: "POST",
      });
      await loadQueue();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setIsLoading(false);
    }
  }, [loadQueue]);

  useEffect(() => {
    void bootstrapAndLoad();
  }, [bootstrapAndLoad]);

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
      await loadQueue();
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
      await loadQueue();
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
      await loadQueue();
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
      await loadQueue();
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
      await loadQueue();
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

  const actionDisabled = isMutating || isLoading;

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
        <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
          {/* Page header — Fix 13: proper type hierarchy */}
          <header className="space-y-1">
            <h1 className="text-heading-2 font-semibold text-primary">
              Key skill review
            </h1>
            <p className="text-small text-secondary">
              Review and confirm key skill attributions for your recent entries.
            </p>
          </header>

          {errorMessage && (
            <div
              className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-small text-accent-red"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <ReviewSkeleton />
          ) : (
            <>
              <section className="card p-4 space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-small font-semibold text-primary">Bulk actions</h2>
                  <p className="text-micro text-muted">
                    Apply actions across all entries in the current review set.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={requestConfirmAllHighConfidence}
                    disabled={actionDisabled || !hasAnySuggestions}
                    className="btn-primary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm all high confidence (≥0.8)
                  </button>
                  <button
                    type="button"
                    onClick={requestResetAllToSuggested}
                    disabled={actionDisabled || !hasAnySuggestions}
                    className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset all rejected
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateForEmpty}
                    disabled={actionDisabled || entriesWithoutSuggestions.length === 0}
                    className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate for entries without suggestions
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestCrossCip}
                    disabled={actionDisabled || entries.length === 0}
                    className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate cross-CiP suggestions
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyseDescriptors}
                    disabled={actionDisabled || !hasAnyConfirmed}
                    className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Analyse descriptors
                  </button>
                </div>
              </section>

              <CoverageSummary entries={entries} />

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

              <div className="flex flex-col gap-3">
                <ReviewQueue
                  entries={entries}
                  statusFilter={statusFilter}
                  sourceFilter={sourceFilter}
                  confidenceFilter={confidenceFilter}
                  query={query}
                  onUpdateSuggestion={handleUpdateSuggestion}
                  disabled={actionDisabled}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
