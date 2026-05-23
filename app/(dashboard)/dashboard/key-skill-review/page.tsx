"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReviewFilters } from "@/components/key-skill-review/ReviewFilters";
import { ReviewQueue } from "@/components/key-skill-review/ReviewQueue";
import { ProgressFocusBanner } from "@/components/key-skill-review/ProgressFocusBanner";
import type {
  FocusReviewMode,
  ReviewQueueMode,
} from "@/components/key-skill-review/ReviewQueue";
import { ReviewSkeleton } from "@/components/key-skill-review/ReviewSkeleton";
import { AuditSummaryModal } from "@/components/key-skill-review/AuditSummaryModal";
import {
  type ReviewEntry,
  type SkillSuggestion,
} from "@/lib/types/key-skill-review";
import type {
  AuditReviewDecisionBody,
  BootstrapResponse,
  KeySkillReviewActionResponse,
  KeySkillReviewReplaceBody,
  KeySkillReviewReplaceCancelBody,
  KeySkillReviewUnlinkBody,
  PushQueueEntry,
  PushQueueResponse,
  PushQueueV2Response,
  QueueResponse,
  UpdateSuggestionStatusBody,
} from "@/lib/types/key-skill-review-api";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "@/components/key-skill-review/ReviewFilters";
import {
  findEntryForProgressFocus,
  parseProgressFocusFromSearchParams,
} from "@/lib/key-skill-review/progress-focus";
import {
  buildAuditRecommendationKey,
  buildCurrentAuditDecisionMap,
  type AuditReviewDecisionRecord,
} from "@/lib/key-skill-review/audit-review-decisions";
import type {
  AuditCandidateRecommendation,
  AuditEntryResult,
} from "@/lib/types/audit-entry-result";
import { RECOMMENDED_SKILLS_PER_ENTRY_TARGET } from "@/lib/key-skill-review/entry-skill-target";
import {
  AUDIT_PROGRESS_EVENT,
  markAuditProgressCompleted,
  markAuditProgressFailed,
  markAuditProgressRunning,
  readAuditProgress,
} from "@/lib/key-skill-review/audit-progress";

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

// ── Batched request helper ────────────────────────────────────────────────────

async function batchedRequests<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  chunkSize = 8,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(fn));
  }
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
  durationMs?: number;
};

type LastUndoAction = {
  id: string;
  run: () => void;
};

type BatchActionScope = "linked" | "cross" | "both";
type PrimaryWorkstream = "audit" | "suggestions";
type AuditIssueTab = "overlinked" | "awaiting_sync" | "replace" | "flag" | "all";
type ReviewStage = "to_review" | "awaiting_sync" | "reviewed";
type ToReviewTab = "all" | "overlinked" | "replace" | "suggestions";
type AuditRunMode = "everything" | "suggested_links" | "over_cap" | "replacements";
type QuickFocusPreset = "pending" | "cross_pending" | "high_confidence" | null;
type AuditResponse = {
  ok: boolean;
  summary?: {
    entries_considered?: number;
    marker_update_failure_count?: number;
    persistence_partial_failure?: boolean;
    llm_enabled?: boolean;
    llm_configured?: boolean;
    llm_usage?: {
      model?: string;
      api_calls?: number;
      input_tokens?: number;
      output_tokens?: number;
      estimated_cost_usd?: number;
      pricing?: {
        input_per_million_usd?: number;
        output_per_million_usd?: number;
        source?: "env" | "default";
      };
    };
  };
  entries?: AuditEntryResult[];
};
type LastAuditSummary = {
  issueCount: number;
  entriesWithIssues: number;
  entriesConsidered: number;
  overlinkedEntryCount: number;
  persistenceWarningCount: number;
};
type LastAuditBreakdown = {
  entriesConsidered: number;
  issuesFound: number;
  overlinkedEntries: number;
  persistenceWarningCount: number;
  replaceCount: number;
  addCount: number;
  flagCount: number;
  skippedUnchangedCount: number;
  warningEntryCount: number;
  llmEstimatedCostUsd: number;
  llmApiCalls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
};

function canSurfaceAdditionalLinks(audit: AuditEntryResult | undefined): boolean {
  if (!audit) return true;
  if (audit.overlinked === true) return false;
  return Number(audit.slots_remaining ?? 0) > 0;
}

function countPendingSuggestionsForEntry(
  entry: ReviewEntry,
  audit: AuditEntryResult | undefined,
): number {
  if (!canSurfaceAdditionalLinks(audit)) return 0;
  return (
    entry.linked_cip_suggestions.filter((suggestion) => suggestion.status === "suggested")
      .length +
    entry.cross_cip_suggestions.filter((suggestion) => suggestion.status === "suggested")
      .length
  );
}

function estimateCurrentLinkedCount(
  entry: ReviewEntry,
  audit: AuditEntryResult | undefined,
): number {
  const fromAudit = Number(
    audit?.current_linked_skill_count ??
      audit?.raw_linked_skill_count ??
      audit?.effective_linked_skill_count ??
      0,
  );
  if (fromAudit > 0) return fromAudit;
  if (Array.isArray(entry.kaizen_linked_skills)) {
    return entry.kaizen_linked_skills.length;
  }
  return 0;
}

function resolveAuditModeEntryIds(
  entries: ReviewEntry[],
  auditResultsByEntryId: Record<string, AuditEntryResult>,
  mode: AuditRunMode,
): string[] {
  if (mode === "everything") return entries.map((entry) => entry.id);

  return entries
    .filter((entry) => {
      const audit = auditResultsByEntryId[entry.id];
      const currentLinkedCount = estimateCurrentLinkedCount(entry, audit);
      const target = Number(audit?.effective_target ?? RECOMMENDED_SKILLS_PER_ENTRY_TARGET);
      const overlinked = audit?.overlinked === true || currentLinkedCount > target;
      const slotsRemaining =
        typeof audit?.slots_remaining === "number"
          ? audit.slots_remaining
          : Math.max(target - currentLinkedCount, 0);
      const isFull = !overlinked && slotsRemaining === 0;

      if (mode === "suggested_links") {
        return !overlinked && slotsRemaining > 0;
      }
      if (mode === "over_cap") {
        return overlinked;
      }
      if (mode === "replacements") {
        return overlinked || isFull;
      }
      return true;
    })
    .map((entry) => entry.id);
}

function countRemainingRebalanceItemsForEntry(
  entry: ReviewEntry,
  audit: AuditEntryResult | undefined,
  currentAuditDecisionMap: Record<string, AuditReviewDecisionRecord>,
  appliedAuditRecommendationKeys: Record<string, true>,
  filter: "all" | "remove_replace" | "replace_only" = "all",
): number {
  if (!audit) return 0;

  const remainingKeys = new Set<string>();
  const addIfVisible = (recommendationKey: string) => {
    if (recommendationKey in currentAuditDecisionMap) return;
    if (recommendationKey in appliedAuditRecommendationKeys) return;
    remainingKeys.add(recommendationKey);
  };

  if (audit.audit_link_plan?.mode === "rebalance") {
    const planSkills = Array.isArray(audit.audit_link_plan.skills)
      ? audit.audit_link_plan.skills
      : [];
    for (const skill of planSkills) {
      if (skill.decision !== "remove" && skill.decision !== "replace_in") continue;
      if (filter === "replace_only" && skill.decision !== "replace_in") continue;
      addIfVisible(
        buildAuditRecommendationKey({
          action: skill.decision === "replace_in" ? "replace" : "remove",
          keySkillId: skill.key_skill_id,
          replaceSkillId: skill.replace_skill_id ?? null,
        }),
      );
    }
    return remainingKeys.size;
  }

  if (audit.overlinked !== true) return 0;

  const recommendations = Array.isArray(audit.candidate_recommendations)
    ? audit.candidate_recommendations
    : [];
  for (const recommendation of recommendations) {
    if (recommendation.action !== "remove" && recommendation.action !== "replace") continue;
    if (filter === "replace_only" && recommendation.action !== "replace") continue;
    addIfVisible(
      buildAuditRecommendationKey({
        action: recommendation.action,
        keySkillId: recommendation.key_skill_id,
        replaceSkillId: recommendation.replace_skill_id ?? null,
      }),
    );
  }

  return remainingKeys.size;
}

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

type QueuedPortfolioChange = {
  key: string;
  kind: "add" | "remove" | "replace";
  text: string;
};

function buildQueuedPortfolioChanges(queueEntries: PushQueueEntry[]): QueuedPortfolioChange[] {
  const changes: QueuedPortfolioChange[] = [];
  const replaceGroups = new Map<
    string,
    {
      remove?: PushQueueEntry["skills"][number];
      add?: PushQueueEntry["skills"][number];
      sequence: number;
    }
  >();

  const sortedSkills = queueEntries
    .flatMap((entry) => entry.skills)
    .slice()
    .sort((a, b) => {
      const aSeq = typeof a.sequence_index === "number" ? a.sequence_index : Number.MAX_SAFE_INTEGER;
      const bSeq = typeof b.sequence_index === "number" ? b.sequence_index : Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    });

  for (const skill of sortedSkills) {
    if (
      (skill.action_type === "replace_remove" || skill.action_type === "replace_add") &&
      skill.group_id
    ) {
      const existing = replaceGroups.get(skill.group_id) ?? {
        sequence:
          typeof skill.sequence_index === "number" ? skill.sequence_index : Number.MAX_SAFE_INTEGER,
      };
      if (skill.action_type === "replace_remove") existing.remove = skill;
      if (skill.action_type === "replace_add") existing.add = skill;
      existing.sequence = Math.min(
        existing.sequence,
        typeof skill.sequence_index === "number" ? skill.sequence_index : Number.MAX_SAFE_INTEGER,
      );
      replaceGroups.set(skill.group_id, existing);
      continue;
    }

    if (skill.action_type === "add") {
      changes.push({
        key: `add:${skill.suggestion_id}`,
        kind: "add",
        text: `Add ${skill.key_skill_title}`,
      });
      continue;
    }

    if (skill.action_type === "remove") {
      changes.push({
        key: `remove:${skill.suggestion_id}`,
        kind: "remove",
        text: `Remove ${skill.key_skill_title}`,
      });
    }
  }

  const replaceChanges = [...replaceGroups.entries()]
    .sort((a, b) => a[1].sequence - b[1].sequence)
    .map(([groupId, group]) => {
      if (group.remove && group.add) {
        return {
          key: `replace:${groupId}`,
          kind: "replace" as const,
          text: `Replace ${group.remove.key_skill_title} with ${group.add.key_skill_title}`,
        };
      }
      if (group.remove) {
        return {
          key: `replace-remove:${groupId}`,
          kind: "remove" as const,
          text: `Remove ${group.remove.key_skill_title}`,
        };
      }
      return {
        key: `replace-add:${groupId}`,
        kind: "add" as const,
        text: `Add ${group.add?.key_skill_title ?? "new linked skill"}`,
      };
    });

  return [...changes, ...replaceChanges];
}

function buildSyncStatusSummary(summary: PushQueueResponse["summary"]): {
  tone: "queued" | "running" | "failed" | "synced";
  title: string;
  detail: string;
} {
  if (summary.running > 0) {
    return {
      tone: "running",
      title: `${summary.running} ${summary.running === 1 ? "item is" : "items are"} syncing right now`,
      detail: `${summary.pending} queued · ${summary.failed} failed`,
    };
  }
  if (summary.failed > 0) {
    return {
      tone: "failed",
      title: `${summary.failed} ${summary.failed === 1 ? "item has" : "items have"} failed`,
      detail: `${summary.pending} still queued · ${summary.synced} synced successfully`,
    };
  }
  if (summary.pending > 0) {
    return {
      tone: "queued",
      title: `${summary.pending} ${summary.pending === 1 ? "queued item is" : "queued items are"} ready to sync`,
      detail: `${summary.synced} synced successfully`,
    };
  }
  return {
    tone: "synced",
    title: "Sync queue is clear",
    detail: `${summary.synced} ${summary.synced === 1 ? "item" : "items"} synced successfully`,
  };
}

function formatSyncTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function batchScopeLabel(scope: BatchActionScope): string {
  if (scope === "linked") return "linked-CiP";
  if (scope === "cross") return "cross-CiP";
  return "linked and cross-CiP";
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

function KeySkillReviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [pushQueue, setPushQueue] = useState<PushQueueResponse>( {
    queue_available: true,
    summary: { total: 0, pending: 0, running: 0, synced: 0, failed: 0 },
    entries: [],
  });
  const [pushQueueV2, setPushQueueV2] = useState<PushQueueV2Response>({
    queue_available: true,
    summary: { total: 0, pending: 0, running: 0, synced: 0, failed: 0 },
    groups: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAuditChooserOpen, setIsAuditChooserOpen] = useState(false);
  const [selectedAuditRunMode, setSelectedAuditRunMode] =
    useState<AuditRunMode>("everything");
  const [auditButtonState, setAuditButtonState] = useState<"idle" | "success">("idle");
  const [lastAuditSummary, setLastAuditSummary] = useState<LastAuditSummary | null>(null);
  const [lastAuditBreakdown, setLastAuditBreakdown] = useState<LastAuditBreakdown | null>(null);
  const [isAuditSummaryOpen, setIsAuditSummaryOpen] = useState(false);
  const [reviewStage, setReviewStage] = useState<ReviewStage>("to_review");
  const [toReviewTab, setToReviewTab] = useState<ToReviewTab>("all");
  const [auditResultsByEntryId, setAuditResultsByEntryId] = useState<
    Record<string, AuditEntryResult>
  >({});
  const [appliedAuditRecommendationKeys, setAppliedAuditRecommendationKeys] = useState<
    Record<string, true>
  >({});
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [queueProgressMessage, setQueueProgressMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [query, setQuery] = useState("");
  const [queueMode, setQueueMode] = useState<ReviewQueueMode>("focus");
  const [focusReviewMode, setFocusReviewMode] = useState<FocusReviewMode>(() => {
    if (typeof window === "undefined") return "classic";
    try {
      const raw = window.localStorage.getItem("piq.review.focus.mode");
      return raw === "swipe" ? "swipe" : "classic";
    } catch {
      return "classic";
    }
  });
  const [batchActionScope, setBatchActionScope] = useState<BatchActionScope>("linked");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [quickFocusPreset, setQuickFocusPreset] = useState<QuickFocusPreset>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastUndoAction, setLastUndoAction] = useState<LastUndoAction | null>(null);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const auditButtonSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueAckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueProgressHeartbeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRelaxedForProgressFocusRef = useRef(false);
  const lastHandledCompletedAuditRef = useRef<number>(0);

  const searchParamsKey = searchParams.toString();
  const progressFocusParsed = useMemo(
    () => parseProgressFocusFromSearchParams(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );
  const activePrimaryWorkstream: PrimaryWorkstream =
    reviewStage === "to_review" && toReviewTab === "suggestions"
      ? "suggestions"
      : "audit";
  const activeAuditIssueTab: AuditIssueTab =
    reviewStage === "awaiting_sync"
      ? "awaiting_sync"
      : reviewStage === "to_review"
        ? toReviewTab === "overlinked"
          ? "overlinked"
          : toReviewTab === "replace"
            ? "replace"
            : "all"
        : "all";
  const isSuggestionsReview =
    reviewStage === "to_review" && toReviewTab === "suggestions";

  const progressFocusResolution = useMemo(() => {
    if (!progressFocusParsed || entries.length === 0) return null;
    return findEntryForProgressFocus(entries, progressFocusParsed);
  }, [entries, progressFocusParsed]);

  const clearProgressFocusFromUrl = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("focus_cip");
    p.delete("focus_skill");
    p.delete("focus_descriptor");
    const q = p.toString();
    router.replace(q ? `/dashboard/key-skill-review?${q}` : "/dashboard/key-skill-review", {
      scroll: false,
    });
  }, [router, searchParams]);

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
    const durationMs = Math.max(1000, Number(toast.durationMs ?? 6000));
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, durationMs);
    toastTimers.current.set(id, timer);
  }, []);

  const handleUndoLastAction = useCallback(() => {
    setLastUndoAction((prev) => {
      if (!prev) return null;
      prev.run();
      return null;
    });
  }, []);

  const setFocusReviewModePersisted = useCallback((next: FocusReviewMode) => {
    setFocusReviewMode(next);
    try {
      window.localStorage.setItem("piq.review.focus.mode", next);
      window.localStorage.setItem("piq.review.style.seen", "1");
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (queueMode !== "focus" && focusReviewMode !== "classic") {
      setFocusReviewModePersisted("classic");
    }
  }, [focusReviewMode, queueMode, setFocusReviewModePersisted]);

  useEffect(() => {
    try {
      const seenHeader = window.localStorage.getItem("piq.key-skill-review.header.seen");
      if (seenHeader === "1") {
        setCompactHeader(true);
      } else {
        window.localStorage.setItem("piq.key-skill-review.header.seen", "1");
      }
    } catch {
      // no-op
    }
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    const data = await fetchJson<QueueResponse>("/api/key-skill-review/queue");
    setEntries(data.entries);
    const hydratedAuditResults: Record<string, AuditEntryResult> = {};
    for (const entry of data.entries) {
      if (!entry.audit_result) continue;
      const entryId =
        typeof entry.audit_result.review_entry_id === "string"
          ? entry.audit_result.review_entry_id
          : entry.id;
      if (!entryId) continue;
      hydratedAuditResults[entryId] = entry.audit_result;
    }
    if (Object.keys(hydratedAuditResults).length > 0) {
      setAuditResultsByEntryId((prev) => ({
        ...prev,
        ...hydratedAuditResults,
      }));
    }
  }, []);

  const loadPushQueue = useCallback(async () => {
    const data = await fetchJson<PushQueueResponse>("/api/key-skill-review/push-queue");
    setPushQueue(data);
  }, []);

  const loadPushQueueV2 = useCallback(async () => {
    const data = await fetchJson<PushQueueV2Response>("/api/key-skill-review/push-queue-v2");
    setPushQueueV2(data);
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
      void loadPushQueueV2();
      queueProgressHeartbeatTimer.current = null;
    }, 15000);
  }, [loadPushQueue, loadPushQueueV2]);

  const reloadAllQueues = useCallback(async () => {
    const [queueResult, pushQueueResult, pushQueueV2Result] = await Promise.allSettled([
      loadQueue(),
      loadPushQueue(),
      loadPushQueueV2(),
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
    if (pushQueueV2Result.status === "rejected") {
      setPushQueueV2({
        queue_available: false,
        summary: { total: 0, pending: 0, running: 0, synced: 0, failed: 0 },
        groups: [],
      });
    }
  }, [loadPushQueue, loadPushQueueV2, loadQueue]);

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
    if (!progressFocusParsed) {
      filtersRelaxedForProgressFocusRef.current = false;
      return;
    }
    if (entries.length === 0 || filtersRelaxedForProgressFocusRef.current) return;
    const res = findEntryForProgressFocus(entries, progressFocusParsed);
    if (res.entryId) {
      setStatusFilter("all");
      setSourceFilter("all");
      setConfidenceFilter("all");
      setQuery("");
      setQueueMode("focus");
    }
    filtersRelaxedForProgressFocusRef.current = true;
  }, [entries, progressFocusParsed]);

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
        void loadPushQueueV2();
      } else if (progress.phase === "error") {
        setIsSyncingQueue(false);
        if (queueProgressHeartbeatTimer.current) {
          clearTimeout(queueProgressHeartbeatTimer.current);
          queueProgressHeartbeatTimer.current = null;
        }
        setQueueProgressMessage(progress.detail ?? "Background sync failed");
        void loadPushQueue();
        void loadPushQueueV2();
      }
    }

    window.addEventListener("message", onWindowMessage);
    return () => {
      window.removeEventListener("message", onWindowMessage);
    };
  }, [loadPushQueue, loadPushQueueV2, refreshQueueHeartbeat]);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) {
        clearTimeout(timer);
      }
      toastTimers.current.clear();
      if (auditButtonSuccessTimer.current) {
        clearTimeout(auditButtonSuccessTimer.current);
        auditButtonSuccessTimer.current = null;
      }
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hydrateFromCompletedProgress = () => {
      const progress = readAuditProgress();
      if (!progress || progress.status !== "completed") return;
      if (progress.finished_at_ms <= lastHandledCompletedAuditRef.current) return;

      const entriesConsidered = Number(progress.entries_considered ?? 0);
      const issueCount = Number(progress.issues_found ?? 0);
      const overlinkedEntryCount = Number(progress.overlinked_entries ?? 0);
      const persistenceWarningCount = Number(progress.persistence_warning_count ?? 0);
      const replaceCount = Number(progress.replace_count ?? 0);
      const addCount = Number(progress.add_count ?? 0);
      const flagCount = Number(progress.flag_count ?? 0);
      const skippedUnchangedCount = Number(progress.skipped_unchanged_count ?? 0);
      const warningEntryCount = Number(progress.warning_entry_count ?? 0);
      const llmEstimatedCostUsd = Number(progress.llm_estimated_cost_usd ?? 0);
      const llmApiCalls = Number(progress.llm_api_calls ?? 0);
      const llmInputTokens = Number(progress.llm_input_tokens ?? 0);
      const llmOutputTokens = Number(progress.llm_output_tokens ?? 0);

      setLastAuditSummary({
        issueCount,
        entriesWithIssues: entriesConsidered,
        entriesConsidered,
        overlinkedEntryCount,
        persistenceWarningCount,
      });
      setLastAuditBreakdown({
        entriesConsidered,
        issuesFound: issueCount,
        overlinkedEntries: overlinkedEntryCount,
        persistenceWarningCount,
        replaceCount,
        addCount,
        flagCount,
        skippedUnchangedCount,
        warningEntryCount,
        llmEstimatedCostUsd: Number.isFinite(llmEstimatedCostUsd)
          ? llmEstimatedCostUsd
          : 0,
        llmApiCalls: Number.isFinite(llmApiCalls) ? llmApiCalls : 0,
        llmInputTokens: Number.isFinite(llmInputTokens) ? llmInputTokens : 0,
        llmOutputTokens: Number.isFinite(llmOutputTokens) ? llmOutputTokens : 0,
      });
      setIsAuditSummaryOpen(true);
      if (issueCount > 0) setReviewStage("to_review");
      lastHandledCompletedAuditRef.current = progress.finished_at_ms;
    };

    hydrateFromCompletedProgress();
    window.addEventListener(AUDIT_PROGRESS_EVENT, hydrateFromCompletedProgress);
    window.addEventListener("focus", hydrateFromCompletedProgress);
    return () => {
      window.removeEventListener(AUDIT_PROGRESS_EVENT, hydrateFromCompletedProgress);
      window.removeEventListener("focus", hydrateFromCompletedProgress);
    };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const entriesWithoutSuggestions = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.linked_cip_suggestions.length === 0 &&
          e.cross_cip_suggestions.length === 0,
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

  const auditModeEntryIds = useMemo(
    () => ({
      everything: resolveAuditModeEntryIds(entries, auditResultsByEntryId, "everything"),
      suggested_links: resolveAuditModeEntryIds(
        entries,
        auditResultsByEntryId,
        "suggested_links",
      ),
      over_cap: resolveAuditModeEntryIds(entries, auditResultsByEntryId, "over_cap"),
      replacements: resolveAuditModeEntryIds(
        entries,
        auditResultsByEntryId,
        "replacements",
      ),
    }),
    [auditResultsByEntryId, entries],
  );

  const selectedAuditRunEntryIds = auditModeEntryIds[selectedAuditRunMode];

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

  function applyLocalAuditReviewDecision(
    entryId: string,
    decision: AuditReviewDecisionRecord,
  ) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const existing = Array.isArray(entry.audit_review_decisions)
          ? entry.audit_review_decisions
          : [];
        const filtered = existing.filter(
          (item) =>
            !(
              item.recommendation_key === decision.recommendation_key &&
              item.audit_input_fingerprint === decision.audit_input_fingerprint
            ),
        );
        return {
          ...entry,
          audit_review_decisions: [decision, ...filtered].slice(0, 200),
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
      const undoId = `${entryId}:${suggestionId}:${Date.now()}`;
      const runUndo = () => {
        setLastUndoAction((prev) => (prev?.id === undoId ? null : prev));
        applyLocalStatusUpdate(entryId, suggestionId, source, prevStatus);
        void fetchJson<{ ok: true }>("/api/key-skill-review/status", {
          method: "PATCH",
          body: JSON.stringify({
            suggestion_id: suggestionId,
            status: prevStatus,
          } as UpdateSuggestionStatusBody),
        })
          .catch((err) => {
            setErrorMessage(err instanceof Error ? err.message : "Failed to undo");
          })
          .then(() => {
            void loadPushQueue();
          });
      };

      addToast({
        message: nextStatus === "confirmed" ? "Suggestion confirmed" : "Suggestion rejected",
        onUndo: runUndo,
      });
      setLastUndoAction({ id: undoId, run: runUndo });
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

  async function handleRecordAuditReviewDecision(body: AuditReviewDecisionBody) {
    const decisionRecord: AuditReviewDecisionRecord = {
      recommendation_key: body.recommendation_key,
      decision: body.decision,
      audit_input_fingerprint: body.audit_input_fingerprint,
      action: body.action,
      key_skill_id: body.key_skill_id,
      replace_skill_id:
        typeof body.replace_skill_id === "string" ? body.replace_skill_id : null,
      key_skill_title:
        typeof body.key_skill_title === "string" ? body.key_skill_title : null,
      replace_skill_title:
        typeof body.replace_skill_title === "string" ? body.replace_skill_title : null,
      reviewed_at: new Date().toISOString(),
    };

    applyLocalAuditReviewDecision(body.review_entry_id, decisionRecord);

    try {
      await fetchJson<{ ok: true }>("/api/key-skill-review/audit-review", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to store audit review decision",
      );
      throw err;
    }
  }

  async function handleApplyAuditRecommendation(
    entryId: string,
    recommendation: AuditCandidateRecommendation,
  ) {
    const recommendationItemKey =
      recommendation.action === "replace"
        ? `replace:${recommendation.key_skill_id}:${recommendation.replace_skill_id ?? ""}`
        : recommendation.action === "remove"
          ? `remove:${recommendation.key_skill_id}`
          : `add:${recommendation.key_skill_id}`;
    const recommendationSuggestionId =
      typeof recommendation.suggestion_id === "string"
        ? recommendation.suggestion_id.trim()
        : "";

    const auditEntry = auditResultsByEntryId[entryId];

    if (recommendation.action !== "remove" && !recommendationSuggestionId) {
      addToast({
        message:
          "This recommendation cannot be applied yet. Run Audit again to refresh actionable IDs.",
      });
      return;
    }

    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      addToast({ message: "Entry not found. Reload and try again." });
      return;
    }

    const allSuggestions = [
      ...entry.linked_cip_suggestions.map((s) => ({
        ...s,
        source: "linked_cip" as const,
      })),
      ...entry.cross_cip_suggestions.map((s) => ({
        ...s,
        source: "cross_cip" as const,
      })),
    ];

    const recommendationSuggestion = recommendationSuggestionId
      ? allSuggestions.find((s) => s.suggestion_id === recommendationSuggestionId)
      : null;
    if (recommendationSuggestion?.status === "confirmed") {
      addToast({
        message: `"${recommendation.key_skill_title}" is already linked and queued.`,
      });
      return;
    }

    let removeTargetKaizenSkillId: string | null = null;
    if (recommendation.action === "remove") {
      removeTargetKaizenSkillId =
        recommendation.target_kaizen_skill_id?.trim() ||
        auditEntry?.current_linked_skills?.find(
          (skill) => skill.key_skill_id === recommendation.key_skill_id,
        )?.kaizen_id ||
        null;

      if (!removeTargetKaizenSkillId) {
        addToast({
          message:
            "Cannot safely queue this removal because the exact Kaizen link ID is missing. Refresh and run audit again.",
        });
        return;
      }
    }

    let replaceTargetTitle: string | null = null;
    let replaceKaizenSkillId: string | null = null;
    if (
      recommendation.action === "replace" &&
      typeof recommendation.replace_skill_id === "string" &&
      recommendation.replace_skill_id.length > 0
    ) {
      const candidates = allSuggestions
        .filter(
          (s) =>
            s.key_skill_id === recommendation.replace_skill_id &&
            s.status === "confirmed",
        )
        .sort((a, b) => {
          const sourceRank = (value: "linked_cip" | "cross_cip") =>
            value === "linked_cip" ? 0 : 1;
          const bySource = sourceRank(a.source) - sourceRank(b.source);
          if (bySource !== 0) return bySource;
          return b.confidence - a.confidence;
        });
      replaceTargetTitle =
        candidates[0]?.key_skill_title ??
        recommendation.replace_skill_title ??
        auditEntry?.current_linked_skills?.find(
          (skill) => skill.key_skill_id === recommendation.replace_skill_id,
        )?.key_skill_title ??
        null;

      replaceKaizenSkillId =
        auditEntry?.current_linked_skills?.find(
          (skill) => skill.key_skill_id === recommendation.replace_skill_id,
        )?.kaizen_id ?? null;

      // Safety guard: never guess a Kaizen ID for destructive replace/remove.
      if (!replaceKaizenSkillId) {
        addToast({
          message:
            "Cannot safely apply replace because the exact Kaizen link ID is missing. Re-run audit after sync.",
        });
        return;
      }
    }

    setIsMutating(true);
    setErrorMessage(null);
    let replaceGroupId: string | null = null;
    let replaceUndoSuggestionId: string | null = null;
    try {
      if (recommendation.action === "remove") {
        const kaizenSkillIdForRemoval = removeTargetKaizenSkillId as string;
        const unlinkBody: KeySkillReviewUnlinkBody = {
          review_entry_id: entryId,
          key_skill_id: recommendation.key_skill_id,
          kaizen_skill_id: kaizenSkillIdForRemoval,
          reason: "audit_remove",
        };
        await fetchJson<KeySkillReviewActionResponse>("/api/key-skill-review/unlink", {
          method: "POST",
          body: JSON.stringify(unlinkBody),
        });
      } else if (recommendation.action === "replace") {
        if (
          typeof recommendation.replace_skill_id !== "string" ||
          !recommendation.replace_skill_id
        ) {
          throw new Error("Replace action is missing target skill details.");
        }

        const replaceBody: KeySkillReviewReplaceBody = {
          review_entry_id: entryId,
          recommendation_suggestion_id: recommendationSuggestionId,
          replace_skill_id: recommendation.replace_skill_id,
          replace_kaizen_skill_id: replaceKaizenSkillId,
          recommendation_reason: recommendation.rationale ?? null,
          remove_reason: "audit_replace",
        };

        const replaceResponse = await fetchJson<KeySkillReviewActionResponse>(
          "/api/key-skill-review/replace",
          {
            method: "POST",
            body: JSON.stringify(replaceBody),
          },
        );
        replaceGroupId =
          typeof replaceResponse.group_id === "string" && replaceResponse.group_id.trim()
            ? replaceResponse.group_id
            : null;
        replaceUndoSuggestionId =
          replaceResponse.queued.find((item) => item.action_type === "replace_remove")
            ?.suggestion_id ?? null;
      } else {
        await fetchJson<{ ok: true }>("/api/key-skill-review/status", {
          method: "PATCH",
          body: JSON.stringify({
            suggestion_id: recommendationSuggestionId,
            status: "confirmed",
          } as UpdateSuggestionStatusBody),
        });
      }

      await reloadAllQueues();

      // Fix 4: Remove applied recommendation from the audit strip so it
      // doesn't show as stale after the action completes.
      setAuditResultsByEntryId((prev) => {
        const existing = prev[entryId];
        if (!existing) return prev;
        const existingPlan = existing.audit_link_plan;
        const nextPlanSkills = Array.isArray(existingPlan?.skills)
          ? existingPlan.skills.filter((skill) => {
              if (recommendation.action === "remove") {
                return !(
                  skill.decision === "remove" &&
                  skill.key_skill_id === recommendation.key_skill_id
                );
              }
              if (recommendation.action === "replace") {
                const isIncomingMatch =
                  skill.decision === "replace_in" &&
                  skill.key_skill_id === recommendation.key_skill_id &&
                  skill.replace_skill_id === recommendation.replace_skill_id;
                const isOutgoingMatch =
                  skill.decision === "replace_out" &&
                  skill.key_skill_id === recommendation.replace_skill_id &&
                  skill.replace_skill_id === recommendation.key_skill_id;
                return !(isIncomingMatch || isOutgoingMatch);
              }
              return true;
            })
          : null;
        const nextPlan =
          existingPlan && nextPlanSkills
            ? {
                ...existingPlan,
                skills: nextPlanSkills,
                remove_count: nextPlanSkills.filter((skill) => skill.decision === "remove").length,
                replace_count: nextPlanSkills.filter((skill) => skill.decision === "replace_in").length,
                ignore_pending_count: nextPlanSkills.filter((skill) => skill.decision === "ignore_pending").length,
                keep_count: nextPlanSkills.filter((skill) => skill.decision === "keep").length,
              }
            : existingPlan;
        const updated: AuditEntryResult = {
          ...existing,
          audit_link_plan: nextPlan,
          candidate_recommendations: (existing.candidate_recommendations ?? []).filter((r) =>
            recommendation.action === "remove"
              ? !(
                  r.action === "remove" &&
                  r.key_skill_id === recommendation.key_skill_id
                )
              : !(
                  r.action === "replace" &&
                  r.key_skill_id === recommendation.key_skill_id &&
                  r.replace_skill_id === recommendation.replace_skill_id
                ) && r.suggestion_id !== recommendationSuggestionId,
          ),
          audit_findings: (existing.audit_findings ?? []).filter((finding) => {
            if (recommendation.action === "remove") {
              return !(
                finding.type === "remove" &&
                finding.key_skill_id === recommendation.key_skill_id
              );
            }
            if (recommendation.action === "replace") {
              return !(
                finding.type === "replace" &&
                finding.key_skill_id === recommendation.key_skill_id &&
                finding.replace_skill_id === recommendation.replace_skill_id
              );
            }
            return true;
          }),
        };
        return { ...prev, [entryId]: updated };
      });

      // Fix 3: Build undo callback so the user can revert within the toast timeout.
      const undoApply = async () => {
        setIsMutating(true);
        try {
          if (recommendation.action === "replace" && replaceUndoSuggestionId) {
            const cancelBody: KeySkillReviewReplaceCancelBody = {
              review_entry_id: entryId,
              recommendation_suggestion_id: recommendationSuggestionId,
              replace_suggestion_id: replaceUndoSuggestionId,
              group_id: replaceGroupId,
            };
            await fetchJson<{ ok: true }>("/api/key-skill-review/replace/cancel", {
              method: "POST",
              body: JSON.stringify(cancelBody),
            });
          } else if (recommendation.action === "remove") {
            throw new Error("Removal undo is not available yet.");
          } else {
            await fetchJson<{ ok: true }>("/api/key-skill-review/status", {
              method: "PATCH",
              body: JSON.stringify({
                suggestion_id: recommendationSuggestionId,
                status: "suggested",
              } as UpdateSuggestionStatusBody),
            });
          }
          await reloadAllQueues();
        } catch {
          addToast({ message: "Undo failed — please reload and try again." });
        } finally {
          setIsMutating(false);
        }
      };

      if (recommendation.action === "remove") {
        addToast({
          message: `Queued removal of "${recommendation.key_skill_title}" for Kaizen sync.`,
        });
      } else if (recommendation.action === "replace") {
        if (replaceTargetTitle) {
          addToast({
            message: `Replaced "${replaceTargetTitle}" with "${recommendation.key_skill_title}". Queued for Kaizen sync.`,
            onUndo: undoApply,
            durationMs: 12000,
          });
        } else {
          addToast({
            message: `Linked "${recommendation.key_skill_title}" and queued for Kaizen sync. Old link removal may still need manual review.`,
            onUndo: undoApply,
            durationMs: 12000,
          });
        }
      } else {
        addToast({
          message: `Linked "${recommendation.key_skill_title}" and queued for Kaizen sync.`,
          onUndo: undoApply,
          durationMs: 12000,
        });
      }
      if (
        (recommendation.action === "remove" || recommendation.action === "replace") &&
        typeof auditEntry?.audit_input_fingerprint === "string" &&
        auditEntry.audit_input_fingerprint.length > 0
      ) {
        await handleRecordAuditReviewDecision({
          review_entry_id: entryId,
          recommendation_key: recommendationItemKey,
          decision: "acted",
          audit_input_fingerprint: auditEntry.audit_input_fingerprint,
          action: recommendation.action,
          key_skill_id: recommendation.key_skill_id,
          replace_skill_id: recommendation.replace_skill_id ?? null,
          key_skill_title: recommendation.key_skill_title,
          replace_skill_title: recommendation.replace_skill_title ?? null,
        });
      }
      setAppliedAuditRecommendationKeys((prev) => {
        const next = {
          ...prev,
          [recommendationItemKey]: true,
        } as Record<string, true>;
        if (recommendation.action === "replace" && recommendationSuggestionId) {
          next[`suggestion:${recommendationSuggestionId}`] = true;
        }
        return next;
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to apply audit recommendation";
      setErrorMessage(message);
      addToast({ message });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleUnlinkKaizenSkill(
    entryId: string,
    keySkillId: string,
    kaizenSkillId: string,
    keySkillTitle: string,
  ) {
    if (!entryId || !keySkillId || !kaizenSkillId) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      const unlinkBody: KeySkillReviewUnlinkBody = {
        review_entry_id: entryId,
        key_skill_id: keySkillId,
        kaizen_skill_id: kaizenSkillId,
        reason: "overlinked_manual_ui",
      };
      await fetchJson<KeySkillReviewActionResponse>("/api/key-skill-review/unlink", {
        method: "POST",
        body: JSON.stringify(unlinkBody),
      });
      await reloadAllQueues();
      addToast({
        message: `Queued removal of "${keySkillTitle}" for Kaizen sync.`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to queue link removal";
      setErrorMessage(message);
      addToast({ message });
    } finally {
      setIsMutating(false);
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function handleConfirmAllHighConfidence(scope: BatchActionScope) {
    const toConfirm: { suggestionId: string }[] = [];
    for (const entry of entries) {
      const allForEntry = [
        ...entry.linked_cip_suggestions,
        ...entry.cross_cip_suggestions,
      ];
      const alreadyConfirmed = allForEntry.filter((s) => s.status === "confirmed").length;
      let slotsRemaining = Math.max(
        0,
        RECOMMENDED_SKILLS_PER_ENTRY_TARGET - alreadyConfirmed,
      );

      if (scope !== "cross") {
        for (const s of entry.linked_cip_suggestions) {
          if (slotsRemaining <= 0) break;
          if (s.confidence >= 0.8 && s.status === "suggested" && s.suggestion_id) {
            toConfirm.push({ suggestionId: s.suggestion_id });
            slotsRemaining -= 1;
          }
        }
      }
      if (scope !== "linked") {
        for (const s of entry.cross_cip_suggestions) {
          if (slotsRemaining <= 0) break;
          if (s.confidence >= 0.8 && s.status === "suggested" && s.suggestion_id) {
            toConfirm.push({ suggestionId: s.suggestion_id });
            slotsRemaining -= 1;
          }
        }
      }
    }
    if (toConfirm.length === 0) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await batchedRequests(toConfirm, ({ suggestionId }) =>
        fetchJson<{ ok: true }>("/api/key-skill-review/status", {
          method: "PATCH",
          body: JSON.stringify({ suggestion_id: suggestionId, status: "confirmed" }),
        }),
      );
      await reloadAllQueues();
      addToast({
        message: `${toConfirm.length} ${batchScopeLabel(scope)} suggestion${toConfirm.length !== 1 ? "s" : ""} confirmed`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to confirm suggestions");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRejectAllLowConfidence(scope: BatchActionScope) {
    const toReject: { suggestionId: string }[] = [];
    for (const entry of entries) {
      if (scope !== "cross") {
        for (const s of entry.linked_cip_suggestions) {
          if (s.confidence < 0.7 && s.status === "suggested" && s.suggestion_id) {
            toReject.push({ suggestionId: s.suggestion_id });
          }
        }
      }
      if (scope !== "linked") {
        for (const s of entry.cross_cip_suggestions) {
          if (s.confidence < 0.7 && s.status === "suggested" && s.suggestion_id) {
            toReject.push({ suggestionId: s.suggestion_id });
          }
        }
      }
    }
    if (toReject.length === 0) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await batchedRequests(toReject, ({ suggestionId }) =>
        fetchJson<{ ok: true }>("/api/key-skill-review/status", {
          method: "PATCH",
          body: JSON.stringify({ suggestion_id: suggestionId, status: "rejected" }),
        }),
      );
      await reloadAllQueues();
      addToast({
        message: `${toReject.length} low-confidence ${batchScopeLabel(scope)} suggestion${toReject.length !== 1 ? "s" : ""} rejected`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reject suggestions");
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
      await batchedRequests(toReset, ({ suggestionId }) =>
        fetchJson<{ ok: true }>("/api/key-skill-review/status", {
          method: "PATCH",
          body: JSON.stringify({ suggestion_id: suggestionId, status: "suggested" }),
        }),
      );
      await reloadAllQueues();
      addToast({ message: `${toReset.length} suggestion${toReset.length !== 1 ? "s" : ""} reset to suggested` });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reset suggestions");
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

  async function runAudit(mode: AuditRunMode = "everything") {
    const llmEnabledForUi =
      process.env.NEXT_PUBLIC_KEY_SKILL_REVIEW_LLM_ENABLED === "true";
    const runStartedAtMs = Date.now();
    const entryIds =
      mode === "everything"
        ? undefined
        : resolveAuditModeEntryIds(entries, auditResultsByEntryId, mode);
    if (mode !== "everything" && (!entryIds || entryIds.length === 0)) {
      addToast({ message: "No entries match that audit mode right now." });
      setIsAuditChooserOpen(false);
      return;
    }
    setAppliedAuditRecommendationKeys({});
    if (auditButtonSuccessTimer.current) {
      clearTimeout(auditButtonSuccessTimer.current);
      auditButtonSuccessTimer.current = null;
    }
    setAuditButtonState("idle");
    setIsAuditChooserOpen(false);
    setIsAuditing(true);
    markAuditProgressRunning(runStartedAtMs);
    setErrorMessage(null);
    try {
      const data = await fetchJson<AuditResponse>("/api/key-skill-review/audit", {
        method: "POST",
        body: JSON.stringify({
          use_llm: llmEnabledForUi,
          ...(entryIds ? { entry_ids: entryIds } : {}),
        }),
      });

      const entries = Array.isArray(data.entries) ? data.entries : [];
      const byEntryId: Record<string, AuditEntryResult> = {};
      entries.forEach((entry) => {
        const reviewEntryId =
          typeof entry.review_entry_id === "string" ? entry.review_entry_id : "";
        if (!reviewEntryId) return;
        byEntryId[reviewEntryId] = entry;
      });
      setAuditResultsByEntryId((prev) =>
        mode === "everything" ? byEntryId : { ...prev, ...byEntryId },
      );
      const overlinkedEntryCount = entries.filter((entry) => entry.overlinked === true).length;
      const entriesWithIssues = entries.filter((entry) =>
        Array.isArray(entry.audit_findings)
          ? entry.audit_findings.some((f) => f.type && f.type !== "ok")
          : false,
      ).length;
      const issueCount = entries.reduce((acc, entry) => {
        const findings = Array.isArray(entry.audit_findings)
          ? entry.audit_findings
          : [];
        return acc + findings.filter((f) => f.type && f.type !== "ok").length;
      }, 0);
      const entriesConsidered =
        typeof data.summary?.entries_considered === "number"
          ? data.summary.entries_considered
          : entries.length;
      const markerUpdateFailureCount =
        typeof data.summary?.marker_update_failure_count === "number"
          ? data.summary.marker_update_failure_count
          : entries.filter(
              (entry) =>
                Array.isArray(entry.audit_warning) &&
                entry.audit_warning.includes("audit_marker_update_failed"),
            ).length;
      const persistencePartialFailure =
        data.summary?.persistence_partial_failure === true ||
        markerUpdateFailureCount > 0;
      const replaceCount = entries.reduce((acc, entry) => {
        const findings = Array.isArray(entry.audit_findings) ? entry.audit_findings : [];
        return acc + findings.filter((f) => f.type === "replace").length;
      }, 0);
      const addCount = entries.reduce((acc, entry) => {
        const findings = Array.isArray(entry.audit_findings) ? entry.audit_findings : [];
        return acc + findings.filter((f) => f.type === "add").length;
      }, 0);
      const flagCount = entries.reduce((acc, entry) => {
        const findings = Array.isArray(entry.audit_findings) ? entry.audit_findings : [];
        return acc + findings.filter((f) => f.type === "flag").length;
      }, 0);
      const skippedUnchangedCount = entries.filter((entry) => entry.audit_skipped === true).length;
      const warningEntryCount = entries.filter(
        (entry) => Array.isArray(entry.audit_warning) && entry.audit_warning.length > 0,
      ).length;
      const llmEstimatedCostUsd = Number(
        data.summary?.llm_usage?.estimated_cost_usd ?? 0,
      );
      const llmApiCalls = Number(data.summary?.llm_usage?.api_calls ?? 0);
      const llmInputTokens = Number(data.summary?.llm_usage?.input_tokens ?? 0);
      const llmOutputTokens = Number(data.summary?.llm_usage?.output_tokens ?? 0);
      setLastAuditSummary({
        issueCount,
        entriesWithIssues,
        entriesConsidered,
        overlinkedEntryCount,
        persistenceWarningCount: markerUpdateFailureCount,
      });
      setLastAuditBreakdown({
        entriesConsidered,
        issuesFound: issueCount,
        overlinkedEntries: overlinkedEntryCount,
        persistenceWarningCount: markerUpdateFailureCount,
        replaceCount,
        addCount,
        flagCount,
        skippedUnchangedCount,
        warningEntryCount,
        llmEstimatedCostUsd: Number.isFinite(llmEstimatedCostUsd)
          ? llmEstimatedCostUsd
          : 0,
        llmApiCalls: Number.isFinite(llmApiCalls) ? llmApiCalls : 0,
        llmInputTokens: Number.isFinite(llmInputTokens) ? llmInputTokens : 0,
        llmOutputTokens: Number.isFinite(llmOutputTokens) ? llmOutputTokens : 0,
      });
      if (issueCount > 0) {
        setReviewStage("to_review");
        if (mode === "suggested_links") setToReviewTab("suggestions");
        else if (mode === "replacements") setToReviewTab("replace");
        else if (mode === "over_cap") setToReviewTab("overlinked");
        else if (overlinkedEntryCount > 0) setToReviewTab("overlinked");
        else if (replaceCount > 0) setToReviewTab("replace");
        else setToReviewTab("all");
      }
      setIsAuditSummaryOpen(true);

      if (persistencePartialFailure) {
        addToast({
          message:
            `Audit complete with ${markerUpdateFailureCount} persistence warning${markerUpdateFailureCount !== 1 ? "s" : ""}. ` +
            "Some entry snapshots may need a rerun to save cleanly.",
        });
      } else if (issueCount === 0) {
        addToast({
          message:
            llmEstimatedCostUsd > 0
              ? `Audit complete. Nothing to review. Est. run cost $${llmEstimatedCostUsd.toFixed(4)}`
              : "Audit complete. Nothing to review.",
        });
      } else {
        addToast({
          message:
            llmEstimatedCostUsd > 0
              ? `Audit complete — ${issueCount} issues across ${entriesWithIssues || entriesConsidered} entries. Est. run cost $${llmEstimatedCostUsd.toFixed(4)}`
              : `Audit complete — ${issueCount} issues found across ${entriesWithIssues || entriesConsidered} entries`,
        });
      }
      await reloadAllQueues();
      markAuditProgressCompleted({
        startedAtMs: runStartedAtMs,
        finishedAtMs: Date.now(),
        entriesConsidered,
        issuesFound: issueCount,
        overlinkedEntries: overlinkedEntryCount,
        persistenceWarningCount: markerUpdateFailureCount,
        replaceCount,
        addCount,
        flagCount,
        skippedUnchangedCount,
        warningEntryCount,
        llmEstimatedCostUsd: Number.isFinite(llmEstimatedCostUsd)
          ? llmEstimatedCostUsd
          : 0,
        llmApiCalls: Number.isFinite(llmApiCalls) ? llmApiCalls : 0,
        llmInputTokens: Number.isFinite(llmInputTokens) ? llmInputTokens : 0,
        llmOutputTokens: Number.isFinite(llmOutputTokens) ? llmOutputTokens : 0,
      });
      if (!persistencePartialFailure) {
        setAuditButtonState("success");
        auditButtonSuccessTimer.current = setTimeout(() => {
          setAuditButtonState("idle");
          auditButtonSuccessTimer.current = null;
        }, 1400);
      } else {
        setAuditButtonState("idle");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audit failed";
      setErrorMessage(message);
      addToast({ message });
      markAuditProgressFailed({
        startedAtMs: runStartedAtMs,
        finishedAtMs: Date.now(),
        errorMessage: message,
      });
      setAuditButtonState("idle");
    } finally {
      setIsAuditing(false);
    }
  }

  // ── Bulk action modal triggers ────────────────────────────────────────────

  function requestConfirmAllHighConfidence() {
    const scope = batchActionScope;
    const count = scopedConfidenceBuckets.high;
    if (count === 0) return;
    setPendingConfirm({
      label: `Confirm all high-confidence ${batchScopeLabel(scope)} suggestions`,
      description:
        `Confirms ${batchScopeLabel(scope)} suggestions with ≥80% confidence that are still pending review.`,
      count,
      onConfirm: () => {
        setPendingConfirm(null);
        void handleConfirmAllHighConfidence(scope);
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

  function requestRejectAllLowConfidence() {
    const scope = batchActionScope;
    const count = scopedConfidenceBuckets.low;
    if (count === 0) return;
    setPendingConfirm({
      label: `Reject all low-confidence ${batchScopeLabel(scope)} suggestions`,
      description:
        `Rejects ${batchScopeLabel(scope)} suggestions under 70% confidence that are still pending review.`,
      count,
      onConfirm: () => {
        setPendingConfirm(null);
        void handleRejectAllLowConfidence(scope);
      },
    });
  }

  const syncableQueueEntries = useMemo(
    () => pushQueue.entries.filter((entry) => entry.status === "pending" || entry.status === "failed"),
    [pushQueue.entries],
  );
  const snapshotRefreshQueueEntries = useMemo(
    () => pushQueue.entries.filter((entry) => entry.needs_snapshot_refresh === true),
    [pushQueue.entries],
  );

  function applyQuickFocusPreset(
    preset: "pending" | "cross_pending" | "high_confidence",
  ) {
    setQuickFocusPreset(preset);
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

  useEffect(() => {
    if (
      statusFilter === "suggested" &&
      sourceFilter === "all" &&
      confidenceFilter === "all" &&
      query === ""
    ) {
      setQuickFocusPreset("pending");
      return;
    }
    if (
      statusFilter === "suggested" &&
      sourceFilter === "cross_cip" &&
      confidenceFilter === "all" &&
      query === ""
    ) {
      setQuickFocusPreset("cross_pending");
      return;
    }
    if (
      statusFilter === "suggested" &&
      sourceFilter === "all" &&
      confidenceFilter === "gte_0_7" &&
      query === ""
    ) {
      setQuickFocusPreset("high_confidence");
      return;
    }
    setQuickFocusPreset(null);
  }, [confidenceFilter, query, sourceFilter, statusFilter]);

  function startBackgroundQueueSync() {
    if (!pushQueue.queue_available) {
      setQueueProgressMessage("Queue storage is unavailable. Run the latest migration first.");
      return;
    }

    const targetEntries = syncableQueueEntries;

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
        "No response from the extension. Check Atlas extension is enabled on this site.",
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

  function startSnapshotRefreshSync() {
    if (!pushQueue.queue_available) {
      setQueueProgressMessage("Queue storage is unavailable. Run the latest migration first.");
      return;
    }

    const targetEntries = snapshotRefreshQueueEntries;

    if (targetEntries.length === 0) {
      setQueueProgressMessage("No synced entries need snapshot refresh.");
      return;
    }

    if (queueAckTimer.current) {
      clearTimeout(queueAckTimer.current);
      queueAckTimer.current = null;
    }

    setIsSyncingQueue(true);
    setQueueProgressMessage("Starting snapshot refresh...");

    queueAckTimer.current = setTimeout(() => {
      setIsSyncingQueue(false);
      setQueueProgressMessage(
        "No response from the extension. Check Atlas extension is enabled on this site.",
      );
      queueAckTimer.current = null;
    }, 3500);

    window.postMessage(
      {
        type: "PORTFOLIOIQ_REFRESH_ENTRY_SNAPSHOTS",
        payload: {
          items: targetEntries.map((entry) => ({
            review_entry_id: entry.review_entry_id,
            title: entry.title,
            date: entry.date,
            entry_edit_url: entry.entry_edit_url,
          })),
        },
      },
      "*",
    );
  }

  const actionDisabled = isMutating || isLoading;
  const confidenceBuckets = useMemo(() => {
    let linkedHighPending = 0;
    let linkedMediumPending = 0;
    let linkedLowPending = 0;
    let crossHighPending = 0;
    let crossMediumPending = 0;
    let crossLowPending = 0;

    for (const entry of entries) {
      for (const s of entry.linked_cip_suggestions) {
        if (s.status !== "suggested" || !s.suggestion_id) continue;
        if (s.confidence >= 0.8) linkedHighPending += 1;
        else if (s.confidence >= 0.7) linkedMediumPending += 1;
        else linkedLowPending += 1;
      }
      for (const s of entry.cross_cip_suggestions) {
        if (s.status !== "suggested" || !s.suggestion_id) continue;
        if (s.confidence >= 0.8) crossHighPending += 1;
        else if (s.confidence >= 0.7) crossMediumPending += 1;
        else crossLowPending += 1;
      }
    }

    return {
      linkedHighPending,
      linkedMediumPending,
      linkedLowPending,
      crossHighPending,
      crossMediumPending,
      crossLowPending,
    };
  }, [entries]);

  const scopedConfidenceBuckets = useMemo(() => {
    if (batchActionScope === "linked") {
      return {
        high: confidenceBuckets.linkedHighPending,
        medium: confidenceBuckets.linkedMediumPending,
        low: confidenceBuckets.linkedLowPending,
      };
    }
    if (batchActionScope === "cross") {
      return {
        high: confidenceBuckets.crossHighPending,
        medium: confidenceBuckets.crossMediumPending,
        low: confidenceBuckets.crossLowPending,
      };
    }
    return {
      high: confidenceBuckets.linkedHighPending + confidenceBuckets.crossHighPending,
      medium: confidenceBuckets.linkedMediumPending + confidenceBuckets.crossMediumPending,
      low: confidenceBuckets.linkedLowPending + confidenceBuckets.crossLowPending,
    };
  }, [batchActionScope, confidenceBuckets]);

  const rejectedCount = useMemo(
    () =>
      entries.reduce(
        (acc, e) =>
          acc +
          [...e.linked_cip_suggestions, ...e.cross_cip_suggestions].filter(
            (s) => s.status === "rejected" && s.suggestion_id,
          ).length,
        0,
      ),
    [entries],
  );
  const canConfirmAllHighConfidence = scopedConfidenceBuckets.high > 0;
  const canRejectLowConfidence = scopedConfidenceBuckets.low > 0;
  const canResetRejected = rejectedCount > 0;
  const canGenerateForEmpty = entriesWithoutSuggestions.length > 0;
  const queueSummary = pushQueue.summary;
  const syncConsoleQueueSummary = pushQueueV2.summary;
  const canRunQueueSync = !isSyncingQueue && syncableQueueEntries.length > 0;
  const canRunSnapshotRefresh = !isSyncingQueue && snapshotRefreshQueueEntries.length > 0;
  const queueEntriesByReviewEntryId = useMemo(() => {
    const grouped = new Map<string, PushQueueEntry[]>();
    for (const queueEntry of pushQueue.entries) {
      if (queueEntry.status !== "pending" && queueEntry.status !== "running") continue;
      const existing = grouped.get(queueEntry.review_entry_id) ?? [];
      existing.push(queueEntry);
      grouped.set(queueEntry.review_entry_id, existing);
    }
    return grouped;
  }, [pushQueue.entries]);
  const lastQueueSyncedAtV2 = useMemo(() => {
    let latest: string | null = null;
    for (const group of pushQueueV2.groups) {
      if (!group.last_synced_at) continue;
      if (!latest || group.last_synced_at > latest) {
        latest = group.last_synced_at;
      }
    }
    return latest;
  }, [pushQueueV2.groups]);
  const pendingRemovalCountByEntryId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const queueEntry of pushQueue.entries) {
      if (queueEntry.status !== "pending" && queueEntry.status !== "running") continue;
      const removalCount = queueEntry.skills.filter(
        (skill) => skill.action_type === "remove" || skill.action_type === "replace_remove",
      ).length;
      if (removalCount <= 0) continue;
      counts[queueEntry.review_entry_id] =
        (counts[queueEntry.review_entry_id] ?? 0) + removalCount;
    }
    return counts;
  }, [pushQueue.entries]);
  const overlinkedQueueStateByEntryId = useMemo(() => {
    const state: Record<
      string,
      {
        isOverlinked: boolean;
        overlinkedBy: number;
        pendingRemovals: number;
        queuedToResolve: boolean;
        remainingAfterQueue: number;
      }
    > = {};

    for (const entry of entries) {
      const audit = auditResultsByEntryId[entry.id];
      const overlinkedBy = Number(audit?.overlinked_by ?? 0);
      const isOverlinked = audit?.overlinked === true && overlinkedBy > 0;
      const pendingRemovals = pendingRemovalCountByEntryId[entry.id] ?? 0;
      const queuedToResolve = isOverlinked && pendingRemovals >= overlinkedBy;
      state[entry.id] = {
        isOverlinked,
        overlinkedBy,
        pendingRemovals,
        queuedToResolve,
        remainingAfterQueue: isOverlinked
          ? Math.max(overlinkedBy - pendingRemovals, 0)
          : 0,
      };
    }

    return state;
  }, [auditResultsByEntryId, entries, pendingRemovalCountByEntryId]);
  const auditReviewStateByEntryId = useMemo(() => {
    const state: Record<
      string,
      {
        pendingSuggestionCount: number;
        remainingRebalanceCount: number;
        remainingReviewItemCount: number;
        reviewStatus:
          | "needs_review"
          | "reviewed_queued"
          | "reviewed_kept_over_cap"
          | "reviewed_no_action";
      }
    > = {};

    for (const entry of entries) {
      const audit = auditResultsByEntryId[entry.id];
      if (!audit) continue;

      const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        audit.audit_input_fingerprint ?? null,
      );
      const pendingSuggestionCount = countPendingSuggestionsForEntry(entry, audit);
      const remainingRebalanceCount = countRemainingRebalanceItemsForEntry(
        entry,
        audit,
        currentAuditDecisionMap,
        appliedAuditRecommendationKeys,
      );
      const remainingReviewItemCount = pendingSuggestionCount + remainingRebalanceCount;
      const overlinkedState = overlinkedQueueStateByEntryId[entry.id];
      const hasQueuedSuggestionSync =
        (queueEntriesByReviewEntryId.get(entry.id)?.length ?? 0) > 0;

      let reviewStatus:
        | "needs_review"
        | "reviewed_queued"
        | "reviewed_kept_over_cap"
        | "reviewed_no_action" = "reviewed_no_action";

      if (remainingReviewItemCount > 0) reviewStatus = "needs_review";
      else if (hasQueuedSuggestionSync) reviewStatus = "reviewed_queued";
      else if (overlinkedState?.queuedToResolve) reviewStatus = "reviewed_queued";
      else if (overlinkedState?.isOverlinked) reviewStatus = "reviewed_kept_over_cap";

      state[entry.id] = {
        pendingSuggestionCount,
        remainingRebalanceCount,
        remainingReviewItemCount,
        reviewStatus,
      };
    }

    return state;
  }, [
    appliedAuditRecommendationKeys,
    auditResultsByEntryId,
    entries,
    overlinkedQueueStateByEntryId,
    queueEntriesByReviewEntryId,
  ]);
  const auditReviewSummary = useMemo(() => {
    let totalEntries = 0;
    let suggestionsToReview = 0;
    let entriesNeedingReview = 0;
    let reviewedQueued = 0;
    let keptOverCap = 0;
    let reviewedNoAction = 0;

    for (const entry of entries) {
      const audit = auditResultsByEntryId[entry.id];
      if (!audit) continue;
      totalEntries += 1;
      const reviewState = auditReviewStateByEntryId[entry.id];
      if (!reviewState) continue;
      suggestionsToReview += reviewState.remainingReviewItemCount;

      if (reviewState.reviewStatus === "needs_review") entriesNeedingReview += 1;
      else if (reviewState.reviewStatus === "reviewed_queued") reviewedQueued += 1;
      else if (reviewState.reviewStatus === "reviewed_kept_over_cap") keptOverCap += 1;
      else reviewedNoAction += 1;
    }

    return {
      totalEntries,
      suggestionsToReview,
      entriesNeedingReview,
      reviewedQueued,
      keptOverCap,
      reviewedNoAction,
      allReviewed: suggestionsToReview === 0 && totalEntries > 0,
    };
  }, [auditResultsByEntryId, auditReviewStateByEntryId, entries]);
  const toReviewCounts = useMemo(() => {
    let all = 0;
    let overlinked = 0;
    let replace = 0;
    let suggestions = 0;

    for (const entry of entries) {
      const audit = auditResultsByEntryId[entry.id];
      if (!audit) continue;
      const reviewState = auditReviewStateByEntryId[entry.id];
      const overlinkedState = overlinkedQueueStateByEntryId[entry.id];
      const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        audit.audit_input_fingerprint ?? null,
      );

      const pendingSuggestionCount = reviewState?.pendingSuggestionCount ?? 0;
      const remainingRebalanceCount = countRemainingRebalanceItemsForEntry(
        entry,
        audit,
        currentAuditDecisionMap,
        appliedAuditRecommendationKeys,
        "remove_replace",
      );
      const remainingReplaceCount = countRemainingRebalanceItemsForEntry(
        entry,
        audit,
        currentAuditDecisionMap,
        appliedAuditRecommendationKeys,
        "replace_only",
      );
      const hasOverlinked = overlinkedState?.isOverlinked === true;
      const queuedToResolve = overlinkedState?.queuedToResolve === true;
      const overlinkedItemsToReview =
        hasOverlinked && !queuedToResolve ? remainingRebalanceCount : 0;

      all += pendingSuggestionCount + overlinkedItemsToReview;
      overlinked += overlinkedItemsToReview;
      replace += remainingReplaceCount;
      suggestions += pendingSuggestionCount;
    }

    return { all, overlinked, replace, suggestions };
  }, [
    appliedAuditRecommendationKeys,
    auditResultsByEntryId,
    auditReviewStateByEntryId,
    entries,
    overlinkedQueueStateByEntryId,
  ]);
  const awaitingSyncEntries = useMemo(
    () =>
      entries.filter(
        (entry) => auditReviewStateByEntryId[entry.id]?.reviewStatus === "reviewed_queued",
      ),
    [auditReviewStateByEntryId, entries],
  );
  const reviewedEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const status = auditReviewStateByEntryId[entry.id]?.reviewStatus;
        return status === "reviewed_kept_over_cap" || status === "reviewed_no_action";
      }),
    [auditReviewStateByEntryId, entries],
  );
  const auditIssueCounts = useMemo(() => {
    let overlinked = 0;
    let awaitingSync = 0;
    let replace = 0;
    let flag = 0;
    let all = 0;

    for (const entry of entries) {
      const audit = auditResultsByEntryId[entry.id];
      if (!audit) continue;
      const findings = Array.isArray(audit.audit_findings) ? audit.audit_findings : [];
      const overlinkedState = overlinkedQueueStateByEntryId[entry.id];
      const reviewState = auditReviewStateByEntryId[entry.id];
      const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        audit.audit_input_fingerprint ?? null,
      );
      const hasOverlinked = overlinkedState?.isOverlinked === true;
      const queuedToResolve = overlinkedState?.queuedToResolve === true;
      const needsOverlinkedReview = (reviewState?.remainingRebalanceCount ?? 0) > 0;
      const remainingReplaceCount = countRemainingRebalanceItemsForEntry(
        entry,
        audit,
        currentAuditDecisionMap,
        appliedAuditRecommendationKeys,
        "replace_only",
      );
      const hasReplace = remainingReplaceCount > 0;
      const hasFlag = findings.some((f) => f.type === "flag");
      const hasAnyIssue =
        hasOverlinked || findings.some((f) => f.type != null && f.type !== "ok");

      if (hasOverlinked && queuedToResolve) awaitingSync += 1;
      else if (hasOverlinked && needsOverlinkedReview) overlinked += 1;
      if (hasReplace) replace += 1;
      if (hasFlag) flag += 1;
      if (hasAnyIssue) all += 1;
    }

    return { overlinked, awaitingSync, replace, flag, all };
  }, [
    appliedAuditRecommendationKeys,
    auditResultsByEntryId,
    auditReviewStateByEntryId,
    entries,
    overlinkedQueueStateByEntryId,
  ]);

  const auditEntriesForQueue = useMemo(
    () =>
      entries.filter((entry) => {
        const audit = auditResultsByEntryId[entry.id];
        if (!audit) return false;
        const findings = Array.isArray(audit.audit_findings) ? audit.audit_findings : [];
        const overlinkedState = overlinkedQueueStateByEntryId[entry.id];
        const reviewState = auditReviewStateByEntryId[entry.id];
        const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
          entry.audit_review_decisions,
          audit.audit_input_fingerprint ?? null,
        );
        const hasOverlinked = overlinkedState?.isOverlinked === true;
        const queuedToResolve = overlinkedState?.queuedToResolve === true;
        const needsOverlinkedReview = (reviewState?.remainingRebalanceCount ?? 0) > 0;
        const remainingReplaceCount = countRemainingRebalanceItemsForEntry(
          entry,
          audit,
          currentAuditDecisionMap,
          appliedAuditRecommendationKeys,
          "replace_only",
        );
        const hasReplace = remainingReplaceCount > 0;
        const hasFlag = findings.some((f) => f.type === "flag");
        const hasAnyIssue =
          hasOverlinked || findings.some((f) => f.type != null && f.type !== "ok");

        if (activeAuditIssueTab === "overlinked") {
          return hasOverlinked && !queuedToResolve && needsOverlinkedReview;
        }
        if (activeAuditIssueTab === "awaiting_sync") return hasOverlinked && queuedToResolve;
        if (activeAuditIssueTab === "replace") return hasReplace;
        return hasAnyIssue;
      }),
    [
      activeAuditIssueTab,
      appliedAuditRecommendationKeys,
      auditResultsByEntryId,
      auditReviewStateByEntryId,
      entries,
      overlinkedQueueStateByEntryId,
    ],
  );

  const entriesForQueue = useMemo(
    () => (activePrimaryWorkstream === "audit" ? auditEntriesForQueue : entries),
    [activePrimaryWorkstream, auditEntriesForQueue, entries],
  );
  const filteredAuditQueueSummary = useMemo(() => {
    if (activePrimaryWorkstream !== "audit") return null;

    if (activeAuditIssueTab === "awaiting_sync") {
      return {
        itemCount: auditEntriesForQueue.length,
        entryCount: auditEntriesForQueue.length,
        label:
          auditEntriesForQueue.length === 1
            ? "1 entry awaiting Kaizen sync"
            : `${auditEntriesForQueue.length} entries awaiting Kaizen sync`,
      };
    }

    let itemCount = 0;
    for (const entry of auditEntriesForQueue) {
      const audit = auditResultsByEntryId[entry.id];
      if (!audit) continue;
      const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        audit.audit_input_fingerprint ?? null,
      );
      itemCount += countRemainingRebalanceItemsForEntry(
        entry,
        audit,
        currentAuditDecisionMap,
        appliedAuditRecommendationKeys,
        activeAuditIssueTab === "replace" ? "replace_only" : "remove_replace",
      );
    }

    const label =
      activeAuditIssueTab === "replace"
        ? `${itemCount} replacement suggestion${itemCount === 1 ? "" : "s"} to review`
        : `${itemCount} overlinked suggestion${itemCount === 1 ? "" : "s"} to review`;

    return {
      itemCount,
      entryCount: auditEntriesForQueue.length,
      label,
    };
  }, [
    appliedAuditRecommendationKeys,
    activeAuditIssueTab,
    activePrimaryWorkstream,
    auditEntriesForQueue,
    auditResultsByEntryId,
  ]);

  const auditModeOptions: Array<{
    mode: AuditRunMode;
    label: string;
    description: string;
    count: number;
  }> = [
    {
      mode: "everything",
      label: "Everything",
      description: "Full sweep across all entries.",
      count: auditModeEntryIds.everything.length,
    },
    {
      mode: "suggested_links",
      label: "Suggested links",
      description: "Only entries with open capacity for extra links.",
      count: auditModeEntryIds.suggested_links.length,
    },
    {
      mode: "over_cap",
      label: "Over cap",
      description: "Only entries that need remove or replace cleanup.",
      count: auditModeEntryIds.over_cap.length,
    },
    {
      mode: "replacements",
      label: "Replacements",
      description: "Only entries that are full or over cap and may need swaps.",
      count: auditModeEntryIds.replacements.length,
    },
  ];

  return (
    <>
      {pendingConfirm && (
        <ConfirmModal
          {...pendingConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {lastAuditBreakdown && (
        <AuditSummaryModal
          isOpen={isAuditSummaryOpen}
          breakdown={lastAuditBreakdown}
          onClose={() => setIsAuditSummaryOpen(false)}
          onStartReview={() => {
            setIsAuditSummaryOpen(false);
            setQueueMode("focus");
            setReviewStage("to_review");
            setToReviewTab("all");
          }}
          onViewOverlinkedFirst={() => {
            setIsAuditSummaryOpen(false);
            setQueueMode("focus");
            setReviewStage("to_review");
            setToReviewTab("overlinked");
          }}
        />
      )}

      <div className="min-h-full">
        <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
          {compactHeader ? (
            <header className="rounded-2xl border border-subtle bg-surface-2 px-4 py-3">
              <h1 className="text-heading-3 font-semibold text-primary">Key skill review</h1>
              <p className="mt-1 text-xs text-secondary">
                Review suggestions and audit findings one entry at a time.
              </p>
            </header>
          ) : (
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
                <h1 className="text-heading-1 font-semibold text-primary">Key skill review</h1>
                <p className="max-w-3xl text-small leading-relaxed text-secondary">
                  Work through suggestions with a calmer, one-entry-at-a-time flow. Keep
                  controls tucked away until you need them.
                </p>
              </div>
            </header>
          )}

          {errorMessage && (
            <div
              className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-small text-accent-red"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {progressFocusParsed && (
            <ProgressFocusBanner
              parsed={progressFocusParsed}
              resolution={progressFocusResolution}
              loading={isLoading}
              onClear={clearProgressFocusFromUrl}
            />
          )}

          {!isLoading && (
            <section className="card p-4 md:p-5">
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
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
            </section>
          )}

          {isLoading ? (
            <ReviewSkeleton />
          ) : (
            <div
              className={`grid gap-3 lg:gap-4 ${
                isSidebarCollapsed
                  ? "lg:grid-cols-[36px_minmax(0,1fr)]"
                  : "lg:grid-cols-[300px_36px_minmax(0,1fr)]"
              }`}
            >
              {!isSidebarCollapsed && (
                <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
                  <section className="card p-4 space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                        Review controls
                      </p>
                      <h2 className="text-small font-semibold text-primary">
                        Search and shape this queue
                      </h2>
                      <p className="text-[11px] text-secondary">
                        Use the side rail to find the right entries and narrow what you are reviewing.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[11px] font-medium text-secondary">
                        Kaizen queue: {queueSummary.pending} pending · {queueSummary.failed} failed
                      </span>
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

                    <div className="space-y-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Queue filters
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setReviewStage("to_review")}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                            reviewStage === "to_review"
                              ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                              : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                          }`}
                        >
                          To review
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewStage("awaiting_sync")}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                            reviewStage === "awaiting_sync"
                              ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                              : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                          }`}
                        >
                          Awaiting sync
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewStage("reviewed")}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                            reviewStage === "reviewed"
                              ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                              : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                          }`}
                        >
                          Reviewed
                        </button>
                      </div>
                      {reviewStage === "to_review" && (
                        <div className="flex flex-wrap gap-1.5">
                          {([
                            ["all", `All (${toReviewCounts.all})`],
                            ["overlinked", `Over cap (${toReviewCounts.overlinked})`],
                            ["replace", `Replace (${toReviewCounts.replace})`],
                            ["suggestions", `Link suggestions (${toReviewCounts.suggestions})`],
                          ] as const).map(([tab, label]) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setToReviewTab(tab)}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                                toReviewTab === tab
                                  ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                                  : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {isSuggestionsReview && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium text-secondary">Quick focus</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyQuickFocusPreset("pending")}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              quickFocusPreset === "pending"
                                ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                                : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                            }`}
                          >
                            Review pending suggestions
                          </button>
                          <button
                            type="button"
                            onClick={() => applyQuickFocusPreset("cross_pending")}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              quickFocusPreset === "cross_pending"
                                ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                                : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                            }`}
                          >
                            Review cross-CiP only
                          </button>
                          <button
                            type="button"
                            onClick={() => applyQuickFocusPreset("high_confidence")}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              quickFocusPreset === "high_confidence"
                                ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                                : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary"
                            }`}
                          >
                            High-confidence first
                          </button>
                        </div>
                      </div>
                    )}

                    <ReviewFilters
                      status={statusFilter}
                      source={sourceFilter}
                      confidence={confidenceFilter}
                      query={query}
                      showTitle={false}
                      showFacetFilters={isSuggestionsReview}
                      helperText={
                        isSuggestionsReview
                          ? "Search by entry title, entry text, or key skill, then use the filters below to refine suggestion review."
                          : "Search the current review queue by entry title, entry text, or key skill."
                      }
                      onStatusChange={setStatusFilter}
                      onSourceChange={setSourceFilter}
                      onConfidenceChange={setConfidenceFilter}
                      onQueryChange={setQuery}
                    />
                  </section>

                  {isSuggestionsReview && (
                    <details className="card p-4">
                      <summary className="cursor-pointer text-small font-semibold text-primary">
                        Batch actions
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-secondary">
                          Action scope
                        </p>
                        <div className="mt-2 inline-flex rounded-full border border-subtle bg-surface-2 p-1">
                          <button
                            type="button"
                            onClick={() => setBatchActionScope("linked")}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              batchActionScope === "linked"
                                ? "bg-surface-3 text-primary shadow-sm"
                                : "text-secondary hover:text-primary"
                            }`}
                          >
                            Linked only
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchActionScope("cross")}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              batchActionScope === "cross"
                                ? "bg-surface-3 text-primary shadow-sm"
                                : "text-secondary hover:text-primary"
                            }`}
                          >
                            Cross-CiP only
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchActionScope("both")}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              batchActionScope === "both"
                                ? "bg-surface-3 text-primary shadow-sm"
                                : "text-secondary hover:text-primary"
                            }`}
                          >
                            Both
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-secondary">
                          Pending confidence buckets
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          Selected scope: {batchScopeLabel(batchActionScope)}
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded-md border border-subtle bg-surface-2 px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted">High</p>
                            <p className="text-xs font-semibold text-primary">{scopedConfidenceBuckets.high}</p>
                          </div>
                          <div className="rounded-md border border-subtle bg-surface-2 px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted">Medium</p>
                            <p className="text-xs font-semibold text-primary">{scopedConfidenceBuckets.medium}</p>
                          </div>
                          <div className="rounded-md border border-subtle bg-surface-2 px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted">Low</p>
                            <p className="text-xs font-semibold text-primary">{scopedConfidenceBuckets.low}</p>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="grid grid-cols-[56px_1fr_1fr_1fr] items-center gap-1 text-[10px]">
                            <span className="text-muted">Linked</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-primary">{confidenceBuckets.linkedHighPending}</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-secondary">{confidenceBuckets.linkedMediumPending}</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-muted">{confidenceBuckets.linkedLowPending}</span>
                          </div>
                          <div className="grid grid-cols-[56px_1fr_1fr_1fr] items-center gap-1 text-[10px]">
                            <span className="text-muted">Cross-CiP</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-primary">{confidenceBuckets.crossHighPending}</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-secondary">{confidenceBuckets.crossMediumPending}</span>
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-center font-medium text-muted">{confidenceBuckets.crossLowPending}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={requestConfirmAllHighConfidence}
                          disabled={actionDisabled || !canConfirmAllHighConfidence}
                          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Confirm high-confidence ({scopedConfidenceBuckets.high})
                        </button>
                        <button
                          type="button"
                          onClick={requestRejectAllLowConfidence}
                          disabled={actionDisabled || !canRejectLowConfidence}
                          className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject low-confidence ({scopedConfidenceBuckets.low})
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateForEmpty}
                          disabled={actionDisabled || !canGenerateForEmpty}
                          className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Generate missing suggestions
                        </button>
                      </div>

                      <div className="rounded-xl border border-subtle bg-surface-1 p-3">
                        <p className="text-[11px] font-medium text-secondary">
                          Advanced tools
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={requestResetAllToSuggested}
                            disabled={actionDisabled || !canResetRejected}
                            className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reset rejected to suggested
                          </button>
                        </div>
                      </div>
                      </div>
                    </details>
                  )}
                </aside>
              )}

              <div className="hidden lg:flex lg:justify-center">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed((v) => !v)}
                  className="group sticky top-24 flex h-9 w-9 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary shadow-md transition-all duration-200 hover:scale-[1.03] hover:bg-surface-2 hover:text-primary active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent-blue/35 focus:ring-offset-2"
                  title={isSidebarCollapsed ? "Show left panel" : "Hide left panel"}
                  aria-label={isSidebarCollapsed ? "Show left panel" : "Hide left panel"}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="transition-transform duration-200"
                  >
                    {isSidebarCollapsed ? (
                      <polyline points="9 6 15 12 9 18" />
                    ) : (
                      <polyline points="15 6 9 12 15 18" />
                    )}
                  </svg>
                </button>
              </div>

	              <div className="flex flex-col gap-3">
	                <section className="card overflow-hidden p-0">
	                  <div className="relative overflow-hidden border-b border-subtle bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(255,255,255,0.96)_38%,rgba(255,255,255,1)_72%)] px-4 py-4">
	                    <div className="pointer-events-none absolute right-6 top-4 h-20 w-20 rounded-full bg-accent-blue/10 blur-2xl" aria-hidden />
	                    <div className="flex flex-wrap items-start justify-between gap-3">
	                      <div className="min-w-0 space-y-1.5">
	                        <div className="flex items-center gap-2">
	                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-accent-blue/12 text-accent-blue shadow-sm ring-1 ring-accent-blue/15">
	                            <svg
	                              width="16"
	                              height="16"
	                              viewBox="0 0 24 24"
	                              fill="none"
	                              stroke="currentColor"
	                              strokeWidth="2"
	                              strokeLinecap="round"
	                              strokeLinejoin="round"
	                              aria-hidden
	                            >
	                              <path d="M21 12a9 9 0 0 0-15.5-6.4" />
	                              <path d="M3 4v5h5" />
	                              <path d="M3 12a9 9 0 0 0 15.5 6.4" />
	                              <path d="M21 20v-5h-5" />
	                            </svg>
	                          </span>
	                          <div>
	                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
	                              Sync console
	                            </p>
	                            <p className="text-small font-semibold text-primary">Kaizen Sync</p>
	                          </div>
	                        </div>
	                        <p className="text-sm font-medium text-primary">
	                          {buildSyncStatusSummary(syncConsoleQueueSummary).title}
	                        </p>
	                        <p className="text-[11px] text-secondary">
	                          Push confirmed cross-CiP skills back to Kaizen in the background.
	                          <span className="ml-1 text-muted">
	                            {buildSyncStatusSummary(syncConsoleQueueSummary).detail}
	                          </span>
	                        </p>
	                        <p className="text-[11px] text-muted">
	                          Last sync to Kaizen was{" "}
	                          <span className="font-medium text-secondary">
	                            {formatSyncTimestamp(lastQueueSyncedAtV2) ?? "not yet recorded"}
	                          </span>
	                        </p>
	                      </div>
	                      <div className="flex flex-col items-end gap-2">
	                        <button
	                          type="button"
	                          onClick={() => startBackgroundQueueSync()}
	                          disabled={!canRunQueueSync}
	                          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
	                        >
	                          {isSyncingQueue ? "Syncing..." : "Sync to Kaizen"}
	                        </button>
	                      </div>
	                    </div>
	                  </div>
	                  {(!pushQueueV2.queue_available || queueProgressMessage) && (
	                    <div className="p-4">
	                      {!pushQueueV2.queue_available ? (
	                        <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700">
	                          Queue table is not available yet. Run database migration{" "}
	                          <code>0013_key_skill_push_queue.sql</code>.
	                        </div>
	                      ) : queueProgressMessage ? (
	                        <p className="text-xs text-secondary">{queueProgressMessage}</p>
	                      ) : null}
	                    </div>
	                  )}
	                </section>

	                {/* ── Unified controls toolbar ────────────────────────────────── */}
                <div className="card p-3 space-y-2">
                  {/* Last audit result — inline accent line */}
                  {lastAuditSummary && (
                    <p className="border-l-2 border-accent-blue pl-2 text-[11px] text-secondary">
                      Last audit:{" "}
                      <span className="font-semibold text-primary">
                        {lastAuditSummary.issueCount} issues
                      </span>{" "}
                      across {lastAuditSummary.entriesWithIssues || lastAuditSummary.entriesConsidered} entries
                      {lastAuditSummary.overlinkedEntryCount > 0
                        ? ` · ${lastAuditSummary.overlinkedEntryCount} overlinked`
                        : ""}
                      {lastAuditSummary.persistenceWarningCount > 0
                        ? ` · ${lastAuditSummary.persistenceWarningCount} persistence warnings`
                        : ""}
                    </p>
                  )}

                  {auditReviewSummary.totalEntries > 0 && (
                    <div className="rounded-2xl border border-accent-blue/20 bg-gradient-to-r from-accent-blue/8 via-surface-1 to-surface-1 px-4 py-3">
                      <div className="space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                          Review flow
                        </p>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-primary">
                            {reviewStage === "to_review" && toReviewTab !== "all" && filteredAuditQueueSummary
                              ? filteredAuditQueueSummary.label
                              : reviewStage === "awaiting_sync"
                                ? `${awaitingSyncEntries.length} entr${
                                    awaitingSyncEntries.length === 1 ? "y" : "ies"
                                  } awaiting Kaizen sync`
                                : reviewStage === "reviewed"
                                  ? `${reviewedEntries.length} reviewed entr${
                                      reviewedEntries.length === 1 ? "y" : "ies"
                                    }`
                              : auditReviewSummary.allReviewed
                              ? "Audit review complete"
                              : `${auditReviewSummary.suggestionsToReview} suggestion${
                                  auditReviewSummary.suggestionsToReview === 1 ? "" : "s"
                                } to review`}
                          </p>
                          {(reviewStage === "to_review" && toReviewTab !== "all" && filteredAuditQueueSummary) ? (
                            <p className="text-[11px] text-secondary">
                              {filteredAuditQueueSummary.entryCount}{" "}
                              {filteredAuditQueueSummary.entryCount === 1 ? "entry" : "entries"}
                            </p>
                          ) : reviewStage === "to_review" ? (
                            <p className="text-[11px] text-secondary">
                              Work through the queue one suggestion at a time.
                            </p>
                          ) : reviewStage === "awaiting_sync" ? (
                            <p className="text-[11px] text-secondary">
                              Run Kaizen Sync, then Audit again when you want a fresh pass.
                            </p>
                          ) : reviewStage === "reviewed" ? (
                            <p className="text-[11px] text-secondary">
                              Everything here is already reviewed for this audit pass.
                            </p>
                          ) : auditReviewSummary.allReviewed ? (
                            <p className="text-[11px] text-secondary">
                              Run Kaizen Sync, then Audit again when you want a fresh pass.
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="inline-flex rounded-full border border-subtle bg-surface-1 p-0.5">
                            <button
                              type="button"
                              onClick={() => setReviewStage("to_review")}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                reviewStage === "to_review"
                                  ? "bg-surface-2 text-primary shadow-sm"
                                  : "text-secondary hover:text-primary"
                              }`}
                            >
                              To review ({auditReviewSummary.suggestionsToReview})
                            </button>
                            <button
                              type="button"
                              onClick={() => setReviewStage("awaiting_sync")}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                reviewStage === "awaiting_sync"
                                  ? "bg-surface-2 text-primary shadow-sm"
                                  : "text-secondary hover:text-primary"
                              }`}
                            >
                              Awaiting sync ({auditReviewSummary.reviewedQueued})
                            </button>
                            <button
                              type="button"
                              onClick={() => setReviewStage("reviewed")}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                reviewStage === "reviewed"
                                  ? "bg-surface-2 text-primary shadow-sm"
                                  : "text-secondary hover:text-primary"
                              }`}
                            >
                              Reviewed ({auditReviewSummary.keptOverCap + auditReviewSummary.reviewedNoAction})
                            </button>
                          </div>
                        </div>

                        {reviewStage === "to_review" && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="inline-flex rounded-full border border-subtle bg-surface-1 p-0.5">
                              <button
                                type="button"
                                onClick={() => setQueueMode("focus")}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                  queueMode === "focus"
                                    ? "bg-surface-2 text-primary shadow-sm"
                                    : "text-secondary hover:text-primary"
                                }`}
                              >
                                Focus
                              </button>
                              <button
                                type="button"
                                onClick={() => setQueueMode("list")}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                  queueMode === "list"
                                    ? "bg-surface-2 text-primary shadow-sm"
                                    : "text-secondary hover:text-primary"
                                }`}
                              >
                                List
                              </button>
                            </div>
                            {queueMode === "focus" && (
                              <div className="inline-flex rounded-full border border-subtle bg-surface-1 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setFocusReviewModePersisted("classic")}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                    focusReviewMode === "classic"
                                      ? "bg-surface-2 text-primary shadow-sm"
                                      : "text-secondary hover:text-primary"
                                  }`}
                                >
                                  Classic
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFocusReviewModePersisted("swipe")}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                    focusReviewMode === "swipe"
                                      ? "bg-surface-2 text-primary shadow-sm"
                                      : "text-secondary hover:text-primary"
                                  }`}
                                >
                                  Swipe
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {reviewStage === "to_review" ? (
                  <ReviewQueue
                    key={`${reviewStage}|${toReviewTab}|${statusFilter}|${sourceFilter}|${confidenceFilter}|${queueMode}|${focusReviewMode}|${query}`}
                    entries={entriesForQueue}
                    reviewWorkstream={activePrimaryWorkstream}
                    auditItemFilter={activeAuditIssueTab}
                    appliedAuditRecommendationKeys={appliedAuditRecommendationKeys}
                    statusFilter={activePrimaryWorkstream === "audit" ? "all" : statusFilter}
                    sourceFilter={activePrimaryWorkstream === "audit" ? "all" : sourceFilter}
                    confidenceFilter={activePrimaryWorkstream === "audit" ? "all" : confidenceFilter}
                    query={query}
                    mode={queueMode}
                    focusReviewMode={focusReviewMode}
                    onUpdateSuggestion={handleUpdateSuggestion}
                    disabled={actionDisabled}
                    progressFocusEntryId={progressFocusResolution?.entryId ?? null}
                    progressFocusSkillId={progressFocusParsed?.skillId ?? null}
                    progressFocusDescriptorId={progressFocusParsed?.descriptorId ?? null}
                    onUndoLastAction={handleUndoLastAction}
                    canUndoLastAction={lastUndoAction != null}
                    onRequestExitSwipeMode={() => setFocusReviewModePersisted("classic")}
                    auditResultsByEntryId={auditResultsByEntryId}
                    onApplyAuditRecommendation={handleApplyAuditRecommendation}
                    onRecordAuditReviewDecision={handleRecordAuditReviewDecision}
                    pendingRemovalCountByEntryId={pendingRemovalCountByEntryId}
                    onUnlinkKaizenSkill={handleUnlinkKaizenSkill}
                  />
                ) : (
                  <section className="space-y-3">
                    <div className="rounded-xl border border-subtle bg-surface-2 px-4 py-3">
                      <h2 className="text-small font-semibold text-primary">
                        {reviewStage === "awaiting_sync" ? "Awaiting sync" : "Reviewed"}
                      </h2>
                      <p className="mt-1 text-[11px] text-secondary">
                        {reviewStage === "awaiting_sync"
                          ? "These entries have already been actioned and are waiting for Kaizen sync."
                          : "These entries are done for this audit pass, including any you chose to keep over cap."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {(reviewStage === "awaiting_sync" ? awaitingSyncEntries : reviewedEntries).length === 0 ? (
                        <div className="rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-[11px] text-secondary">
                          No entries in this section right now.
                        </div>
                      ) : (
                        (reviewStage === "awaiting_sync" ? awaitingSyncEntries : reviewedEntries).map((entry) => {
                          const audit = auditResultsByEntryId[entry.id];
                          const reviewState = auditReviewStateByEntryId[entry.id];
                          const queuedChanges =
                            reviewStage === "awaiting_sync"
                              ? buildQueuedPortfolioChanges(
                                  queueEntriesByReviewEntryId.get(entry.id) ?? [],
                                )
                              : [];
                          const statusLabel =
                            reviewStage === "awaiting_sync"
                              ? "Awaiting sync"
                              : reviewState?.reviewStatus === "reviewed_kept_over_cap"
                                ? "Kept over cap"
                                : "Reviewed";
                          return (
                            <article
                              key={`${reviewStage}-${entry.id}`}
                              className="rounded-xl border border-subtle bg-surface-1 px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-primary">{entry.title}</p>
                                  <p className="mt-0.5 text-[11px] text-muted">
                                    {entry.entry_type} · {entry.date}
                                  </p>
                                  {reviewStage === "awaiting_sync" ? (
                                    <div className="mt-2 space-y-2">
                                      <p className="text-[11px] font-medium text-primary">
                                        {queuedChanges.length} change{queuedChanges.length === 1 ? "" : "s"} queued
                                      </p>
                                      {queuedChanges.length > 0 ? (
                                        <ul className="space-y-1">
                                          {queuedChanges.map((change) => (
                                            <li
                                              key={`${entry.id}-${change.key}`}
                                              className="text-[11px] text-secondary"
                                            >
                                              {change.text}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-[11px] text-secondary">
                                          Waiting for Kaizen sync.
                                        </p>
                                      )}
                                      <p className="text-[11px] text-muted">
                                        These changes have been reviewed and are waiting to be pushed to Kaizen.
                                      </p>
                                      {audit?.overlinked_by ? (
                                        <p className="text-[11px] text-muted">
                                          Originally flagged as over cap by {audit.overlinked_by}.
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <>
                                      <p className="mt-1.5 text-[11px] text-secondary">
                                        {reviewState?.reviewStatus === "reviewed_kept_over_cap"
                                          ? "Reviewed and kept over cap by choice."
                                          : "Reviewed with no further action needed on this pass."}
                                      </p>
                                      {audit?.overlinked_by ? (
                                        <p className="mt-1 text-[11px] text-muted">
                                          Audit snapshot: over cap by {audit.overlinked_by}
                                        </p>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                                <span className="inline-flex rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-secondary">
                                  {statusLabel}
                                </span>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                )}

	              </div>
            </div>
          )}
        </main>

        {!isLoading && (
          <div className="fixed right-5 top-5 z-40 md:right-7 md:top-7">
            <div className="relative flex flex-col items-end">
              <button
                type="button"
                onClick={() => {
                  if (isAuditing || actionDisabled) return;
                  setIsAuditChooserOpen((current) => !current);
                }}
                disabled={actionDisabled || isAuditing}
                className={[
                  "relative z-10 inline-flex min-h-12 items-center gap-2 rounded-full border px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-[#525252]/35 focus:ring-offset-2",
                  isAuditing
                    ? "border-[#111827] bg-[#111827] text-white"
                    : auditButtonState === "success"
                      ? "border-[#27272A] bg-[#27272A] text-white"
                      : isAuditChooserOpen
                        ? "border-[#A1A1AA] bg-white text-[#18181B]"
                        : "border-[#D4D4D8] bg-[#F5F5F5] text-[#18181B] hover:-translate-y-0.5 hover:border-[#A1A1AA] hover:bg-white active:translate-y-0 active:scale-[0.98]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                ].join(" ")}
                aria-label={
                  isAuditing
                    ? "Audit running"
                    : isAuditChooserOpen
                      ? "Close audit options"
                      : "Open audit options"
                }
                title={
                  isAuditing
                    ? "Auditing..."
                    : isAuditChooserOpen
                      ? "Close audit options"
                      : "Choose audit options"
                }
              >
                {isAuditing ? (
                  <>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    </span>
                    <span className="text-sm font-semibold tracking-tight">Auditing...</span>
                  </>
                ) : auditButtonState === "success" ? (
                  <>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/12">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold tracking-tight">Run audit</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#18181B] text-white">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M12 3l1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2L7.5 7.5l3.3-1.3L12 3z" />
                        <path d="M5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8L2.5 16.5l1.8-.7L5 14z" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold tracking-tight">Run audit</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${isAuditChooserOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </>
                )}
              </button>

            <div
              aria-hidden={!isAuditChooserOpen || isAuditing}
              className={[
                "absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2.5rem))] origin-top-right overflow-hidden transition-all duration-300 ease-out",
                isAuditChooserOpen && !isAuditing
                  ? "max-h-[32rem] translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none max-h-0 -translate-y-2 scale-[0.98] opacity-0",
              ].join(" ")}
            >
              <div className="rounded-2xl border border-subtle bg-surface-1 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                    Audit options
                  </p>
                  <p className="text-sm font-semibold text-primary">Choose what to audit</p>
                  <p className="text-[11px] text-secondary">
                    Pick one mode, then start the audit when you are ready.
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  {auditModeOptions.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setSelectedAuditRunMode(option.mode)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        selectedAuditRunMode === option.mode
                          ? "border-accent-blue/40 bg-accent-blue/10"
                          : "border-subtle bg-surface-2 hover:bg-surface-3"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-primary">{option.label}</p>
                          <p className="mt-1 text-[11px] text-secondary">{option.description}</p>
                        </div>
                        <span className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-secondary">
                          {option.count}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    {selectedAuditRunMode === "everything"
                      ? "Runs across the whole portfolio."
                      : selectedAuditRunEntryIds.length === 0
                        ? "No entries match this mode right now."
                        : `Runs on ${selectedAuditRunEntryIds.length} matching entr${
                            selectedAuditRunEntryIds.length === 1 ? "y" : "ies"
                          }.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAuditChooserOpen(false)}
                      className="rounded-full border border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAudit(selectedAuditRunMode)}
                      disabled={
                        actionDisabled ||
                        isAuditing ||
                        (selectedAuditRunMode !== "everything" &&
                          selectedAuditRunEntryIds.length === 0)
                      }
                      className="rounded-full bg-[#18181B] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Start audit
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function KeySkillReviewPage() {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <KeySkillReviewPageContent />
    </Suspense>
  );
}
