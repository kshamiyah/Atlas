"use client";

import { useMemo, useState } from "react";
import { formatRelativeSyncTime } from "@/lib/kaizen/kaizen-date";

type EntryRow = {
  id: string;
  kaizen_date: string;
  assessment_type: string;
  title: string;
  category: string;
  training_year: string;
  status: string;
  key_skills_count: number | null;
  synced_at?: string | null;
};

type UnsignedAssessmentEntry = {
  id: string;
  other_party_name: string;
  entry_title: string;
  status: string;
  date: string;
};

type EvidenceTabsSectionProps = {
  entries: EntryRow[];
  unsignedEntries: UnsignedAssessmentEntry[];
  hasEntriesSync: boolean;
  totalEntries: number;
};

type TabKey = "recent" | "unsigned";
type FilterKey = "all" | "awaiting" | "expired" | "unknown";

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  Complete: { color: "var(--accent-green)", bg: "rgba(22,163,74,0.10)" },
  "In progress": {
    color: "var(--accent-amber)",
    bg: "rgba(245,158,11,0.10)",
  },
  Draft: { color: "var(--text-muted)", bg: "var(--surface-3)" },
};

function normalizeStatus(value: string): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompleteStatus(value: string): boolean {
  const status = normalizeStatus(value).toLowerCase();
  return status.includes("complete") || status.includes("completed") || status.includes("signed");
}

function isTeamObservationEntry(entryTitle: string): boolean {
  const title = normalizeStatus(entryTitle).toLowerCase();
  return (
    /\bto1\b/.test(title) ||
    /\bto2\b/.test(title) ||
    title.includes("team observation")
  );
}

function classifyStatus(status: string): FilterKey {
  const normalized = normalizeStatus(status).toLowerCase();
  if (normalized.includes("expired")) return "expired";
  if (
    normalized.includes("pending") ||
    normalized.includes("await") ||
    normalized.includes("requested") ||
    normalized.includes("ready for assessment")
  ) {
    return "awaiting";
  }
  return "unknown";
}

function statusStyle(status: string) {
  return (
    STATUS_STYLES[status] ?? {
      color: "var(--text-muted)",
      bg: "var(--surface-3)",
    }
  );
}

function unsignedTone(status: string): {
  bg: string;
  color: string;
  border: string;
  label: string;
} {
  const normalized = normalizeStatus(status).toLowerCase();
  if (normalized.includes("expired")) {
    return {
      bg: "rgba(220,38,38,0.10)",
      color: "var(--accent-red)",
      border: "rgba(220,38,38,0.22)",
      label: "Expired",
    };
  }
  if (normalized.includes("pending") || normalized.includes("await")) {
    return {
      bg: "rgba(245,158,11,0.10)",
      color: "var(--accent-amber)",
      border: "rgba(245,158,11,0.22)",
      label: "Awaiting",
    };
  }
  return {
    bg: "var(--surface-3)",
    color: "var(--text-secondary)",
    border: "var(--border-subtle)",
    label: "Open",
  };
}

export function EvidenceTabsSection({
  entries,
  unsignedEntries,
  hasEntriesSync,
  totalEntries,
}: EvidenceTabsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [filter, setFilter] = useState<FilterKey>("all");

  const actionable = useMemo(
    () =>
      unsignedEntries.filter(
        (entry) =>
          !isCompleteStatus(entry.status) &&
          !isTeamObservationEntry(entry.entry_title),
      ),
    [unsignedEntries],
  );

  const counts = useMemo(() => {
    const next = {
      all: actionable.length,
      awaiting: 0,
      expired: 0,
      unknown: 0,
    };
    for (const entry of actionable) {
      next[classifyStatus(entry.status)] += 1;
    }
    return next;
  }, [actionable]);

  const visibleUnsigned = useMemo(() => {
    if (filter === "all") return actionable;
    return actionable.filter((entry) => classifyStatus(entry.status) === filter);
  }, [actionable, filter]);

  const importedLabel =
    totalEntries > entries.length
      ? `${totalEntries} synced · showing ${entries.length} newest by entry date`
      : `${entries.length} synced · newest entry date first`;
  const signatureLabel = `${actionable.length} need signature`;

  return (
    <section className="card w-full rounded-lg p-5 shadow-none">
      <div className="flex flex-col gap-4 border-b border-subtle pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-small font-semibold text-primary">Entries</h2>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            {importedLabel} · {signatureLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-fit rounded-lg border border-subtle bg-surface-1 p-1">
            {[
              ["recent", "Recent", entries.length],
              ["unsigned", "Needs signature", actionable.length],
            ].map(([key, label, count]) => {
              const typedKey = key as TabKey;
              const isActive = activeTab === typedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(typedKey)}
                  className="rounded-md px-3 py-1.5 text-[11px] font-medium transition"
                  style={{
                    background: isActive ? "var(--surface-2)" : "transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
          <a
            href="/dashboard/entries"
            className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
          >
            View all entries
          </a>
        </div>
      </div>

      {activeTab === "recent" ? (
        <div className="pt-4">
          {entries.length === 0 ? (
            <p className="text-[12px] leading-5 text-muted">
              No entries synced yet. Sync the entries list from Kaizen using the extension.
            </p>
          ) : (
            <>
              <ul className="max-h-[28rem] divide-y divide-subtle overflow-y-auto pr-2">
                {entries.slice(0, 8).map((entry) => {
                  const tone = statusStyle(entry.status);
                  return (
                    <li
                      key={entry.id}
                      className="grid gap-3 py-2.5 first:pt-0 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)_6.5rem] md:items-start"
                    >
                      <div className="min-w-0">
                        <span
                          className="inline-flex max-w-full rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                          style={{
                            background: "var(--surface-4)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <span className="truncate">{entry.assessment_type || "Entry"}</span>
                        </span>
                      </div>
                      <p className="min-w-0 text-sm font-medium leading-6 text-primary">
                        {entry.title || "Untitled entry"}
                      </p>
                      <div className="flex items-center gap-2 md:flex-col md:items-end">
                        {entry.status ? (
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: tone.bg, color: tone.color }}
                          >
                            {entry.status}
                          </span>
                        ) : null}
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] font-medium tabular-nums text-secondary">
                            {entry.kaizen_date || "—"}
                          </span>
                          {entry.synced_at ? (
                            <span
                              className="text-[10px] tabular-nums text-muted"
                              title={new Date(entry.synced_at).toLocaleString("en-GB")}
                            >
                              Synced {formatRelativeSyncTime(entry.synced_at)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-muted">
                Showing {Math.min(8, entries.length)} of {totalEntries} entries by entry date
                {totalEntries > entries.length ? " (newest first)" : ""}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="pt-4">
          {!hasEntriesSync && actionable.length === 0 ? (
            <p className="text-[12px] leading-5 text-muted">
              Sync your Kaizen entries to list assessor-dependent assessments that are not yet complete or signed.
            </p>
          ) : actionable.length === 0 ? (
            <p className="text-[12px] leading-5 text-muted">
              No assessor-dependent assessments are currently excluded from portfolio evidence.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["awaiting", "Awaiting"],
                  ["expired", "Expired"],
                ].map(([key, label]) => {
                  const typedKey = key as FilterKey;
                  const active = filter === typedKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(typedKey)}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition"
                      style={{
                        borderColor: active ? "rgba(245,158,11,0.35)" : "var(--border-subtle)",
                        background: active ? "rgba(245,158,11,0.10)" : "var(--surface-1)",
                        color: active ? "var(--accent-amber)" : "var(--text-secondary)",
                      }}
                    >
                      {label} ({counts[typedKey]})
                    </button>
                  );
                })}
              </div>

              {visibleUnsigned.length === 0 ? (
                <p className="text-[12px] leading-5 text-muted">
                  No entries in this filter.
                </p>
              ) : (
                <>
                  <ul className="max-h-[28rem] divide-y divide-subtle overflow-y-auto pr-2">
                    {visibleUnsigned.slice(0, 6).map((entry) => {
                      const tone = unsignedTone(entry.status);
                      return (
                        <li
                          key={entry.id}
                          className="grid gap-3 py-2.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_8rem] md:items-start"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-6 text-primary">
                              {entry.entry_title || "Untitled assessment request"}
                            </p>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5 text-muted">
                              {entry.other_party_name ? (
                                <span className="min-w-0 max-w-full truncate">
                                  {entry.other_party_name}
                                </span>
                              ) : null}
                              {normalizeStatus(entry.status) ? (
                                <span className="min-w-0 max-w-full truncate">
                                  {normalizeStatus(entry.status)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 md:flex-col md:items-end">
                            <span
                              className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                background: tone.bg,
                                color: tone.color,
                                borderColor: tone.border,
                              }}
                            >
                              {tone.label}
                            </span>
                            {entry.date ? (
                              <span className="text-[11px] tabular-nums text-muted">
                                {entry.date}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-[11px] text-muted">
                    Showing {Math.min(6, visibleUnsigned.length)} of {visibleUnsigned.length} entries.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
