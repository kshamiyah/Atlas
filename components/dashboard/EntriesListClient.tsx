"use client";

import { useMemo, useState } from "react";
import {
  formatRelativeSyncTime,
  matchesKaizenDayFilter,
  toIsoDateOrNull,
} from "@/lib/kaizen/kaizen-date";

type EntryRow = {
  id: string;
  title: string | null;
  kaizen_date: string | null;
  assessment_type: string | null;
  status: string | null;
  synced_at: string | null;
};

type EntriesListClientProps = {
  entries: EntryRow[];
  totalSyncedCount: number;
  initialDayFilter?: string;
  initialQuery?: string;
};

type SortKey = "synced_at" | "entry_date";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSorted(values: Array<string | null>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function compareEntries(a: EntryRow, b: EntryRow, sortKey: SortKey): number {
  if (sortKey === "synced_at") {
    const aSync = a.synced_at ? new Date(a.synced_at).getTime() : 0;
    const bSync = b.synced_at ? new Date(b.synced_at).getTime() : 0;
    if (bSync !== aSync) return bSync - aSync;

    const aEntry = toIsoDateOrNull(a.kaizen_date) || "";
    const bEntry = toIsoDateOrNull(b.kaizen_date) || "";
    return bEntry.localeCompare(aEntry);
  }

  const aEntry = toIsoDateOrNull(a.kaizen_date) || "";
  const bEntry = toIsoDateOrNull(b.kaizen_date) || "";
  if (aEntry !== bEntry) return bEntry.localeCompare(aEntry);

  const aSync = a.synced_at ? new Date(a.synced_at).getTime() : 0;
  const bSync = b.synced_at ? new Date(b.synced_at).getTime() : 0;
  return bSync - aSync;
}

export function EntriesListClient({
  entries,
  totalSyncedCount,
  initialDayFilter = "",
  initialQuery = "",
}: EntriesListClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState(initialDayFilter);
  const [sortKey, setSortKey] = useState<SortKey>("synced_at");

  const hasActiveFilters =
    query.trim().length > 0 ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    dayFilter.trim().length > 0;

  const assessmentTypes = useMemo(
    () => uniqueSorted(entries.map((entry) => entry.assessment_type)),
    [entries],
  );
  const statuses = useMemo(
    () => uniqueSorted(entries.map((entry) => entry.status)),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      const title = normalizeText(entry.title);
      const type = normalizeText(entry.assessment_type);
      const status = normalizeText(entry.status);
      const date = normalizeText(entry.kaizen_date);

      const matchesQuery =
        !q ||
        title.toLowerCase().includes(q) ||
        type.toLowerCase().includes(q) ||
        status.toLowerCase().includes(q) ||
        date.toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || type === typeFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesDay = matchesKaizenDayFilter(entry.kaizen_date, dayFilter);

      return matchesQuery && matchesType && matchesStatus && matchesDay;
    });

    return filtered.sort((a, b) => compareEntries(a, b, sortKey));
  }, [dayFilter, entries, query, sortKey, statusFilter, typeFilter]);

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDayFilter("");
  }

  return (
    <section className="card rounded-lg p-5 shadow-none">
      <div className="flex flex-col gap-3 border-b border-subtle pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-small font-semibold text-primary">All entries</h2>
          <p className="mt-1 text-[12px] text-muted">
            Showing {filteredEntries.length} of {entries.length} loaded
            {totalSyncedCount > entries.length
              ? ` (${totalSyncedCount} synced in total)`
              : ""}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:w-[58rem] xl:grid-cols-5">
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          >
            <option value="synced_at">Recently synced</option>
            <option value="entry_date">Entry date</option>
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search entries"
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          >
            <option value="all">All types</option>
            {assessmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dayFilter}
            onChange={(event) => setDayFilter(event.target.value)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          />
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="pt-4">
          <p className="text-sm text-muted">
            {entries.length === 0
              ? "No entries synced yet."
              : "No entries match this filter."}
          </p>
          {entries.length > 0 && hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="hidden gap-3 border-b border-subtle py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted md:grid md:grid-cols-[10rem_minmax(0,1fr)_7rem_7rem_7rem]">
            <span>Type</span>
            <span>Title</span>
            <span>Status</span>
            <span>Entry date</span>
            <span className="md:text-right">Synced</span>
          </div>
          <ul className="divide-y divide-subtle">
            {filteredEntries.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-3 py-3 first:pt-4 last:pb-0 md:grid-cols-[10rem_minmax(0,1fr)_7rem_7rem_7rem] md:items-start"
              >
                <span className="min-w-0">
                  <span className="inline-flex max-w-full rounded-md bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                    <span className="truncate">
                      {normalizeText(entry.assessment_type) || "Entry"}
                    </span>
                  </span>
                </span>
                <span className="min-w-0 text-sm font-medium leading-6 text-primary">
                  {normalizeText(entry.title) || "Untitled entry"}
                </span>
                <span className="text-[11px] text-muted">
                  {normalizeText(entry.status) || "Unknown"}
                </span>
                <span className="text-[11px] tabular-nums text-muted">
                  {normalizeText(entry.kaizen_date) || "—"}
                </span>
                <span
                  className="text-[11px] tabular-nums text-secondary md:text-right"
                  title={entry.synced_at ? new Date(entry.synced_at).toLocaleString("en-GB") : undefined}
                >
                  {formatRelativeSyncTime(entry.synced_at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
