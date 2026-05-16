export const AUDIT_PROGRESS_STORAGE_KEY = "piq.audit.progress.v1";
export const AUDIT_PROGRESS_EVENT = "piq:audit-progress";

export type PersistedAuditProgress =
  | {
      status: "running";
      started_at_ms: number;
    }
  | {
      status: "completed";
      started_at_ms: number;
      finished_at_ms: number;
      entries_considered: number;
      issues_found: number;
      overlinked_entries: number;
      persistence_warning_count: number;
      replace_count: number;
      add_count: number;
      flag_count: number;
      skipped_unchanged_count: number;
      warning_entry_count: number;
      llm_estimated_cost_usd: number;
      llm_api_calls: number;
      llm_input_tokens: number;
      llm_output_tokens: number;
    }
  | {
      status: "failed";
      started_at_ms: number;
      finished_at_ms: number;
      error_message: string;
    };

function emitAuditProgressEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUDIT_PROGRESS_EVENT));
}

function writeAuditProgress(value: PersistedAuditProgress | null) {
  if (typeof window === "undefined") return;
  try {
    if (value == null) {
      window.localStorage.removeItem(AUDIT_PROGRESS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(AUDIT_PROGRESS_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // no-op
  }
  emitAuditProgressEvent();
}

export function readAuditProgress(): PersistedAuditProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUDIT_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuditProgress;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.status === "running" && Number.isFinite(parsed.started_at_ms)) return parsed;
    if (
      parsed.status === "completed" &&
      Number.isFinite(parsed.started_at_ms) &&
      Number.isFinite(parsed.finished_at_ms)
    ) {
      return parsed;
    }
    if (
      parsed.status === "failed" &&
      Number.isFinite(parsed.started_at_ms) &&
      Number.isFinite(parsed.finished_at_ms) &&
      typeof parsed.error_message === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function markAuditProgressRunning(startedAtMs: number) {
  writeAuditProgress({
    status: "running",
    started_at_ms: startedAtMs,
  });
}

export function markAuditProgressCompleted(input: {
  startedAtMs: number;
  finishedAtMs: number;
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
}) {
  writeAuditProgress({
    status: "completed",
    started_at_ms: input.startedAtMs,
    finished_at_ms: input.finishedAtMs,
    entries_considered: input.entriesConsidered,
    issues_found: input.issuesFound,
    overlinked_entries: input.overlinkedEntries,
    persistence_warning_count: input.persistenceWarningCount,
    replace_count: input.replaceCount,
    add_count: input.addCount,
    flag_count: input.flagCount,
    skipped_unchanged_count: input.skippedUnchangedCount,
    warning_entry_count: input.warningEntryCount,
    llm_estimated_cost_usd: input.llmEstimatedCostUsd,
    llm_api_calls: input.llmApiCalls,
    llm_input_tokens: input.llmInputTokens,
    llm_output_tokens: input.llmOutputTokens,
  });
}

export function markAuditProgressFailed(input: {
  startedAtMs: number;
  finishedAtMs: number;
  errorMessage: string;
}) {
  writeAuditProgress({
    status: "failed",
    started_at_ms: input.startedAtMs,
    finished_at_ms: input.finishedAtMs,
    error_message: input.errorMessage,
  });
}

export function clearAuditProgress() {
  writeAuditProgress(null);
}
