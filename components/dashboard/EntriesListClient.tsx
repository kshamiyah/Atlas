"use client";

import { useMemo, useState } from "react";

type EntryRow = {
  id: string;
  title: string | null;
  kaizen_date: string | null;
  assessment_type: string | null;
  status: string | null;
};

type EntriesListClientProps = {
  entries: EntryRow[];
  initialDayFilter?: string;
  initialQuery?: string;
};

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

export function EntriesListClient({
  entries,
  initialDayFilter = "",
  initialQuery = "",
}: EntriesListClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState(initialDayFilter);

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
    return entries.filter((entry) => {
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
      const matchesDay = !dayFilter || date === dayFilter;

      return matchesQuery && matchesType && matchesStatus && matchesDay;
    });
  }, [dayFilter, entries, query, statusFilter, typeFilter]);

  return (
    <section className="card rounded-lg p-5 shadow-none">
      <div className="flex flex-col gap-3 border-b border-subtle pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-small font-semibold text-primary">All entries</h2>
          <p className="mt-1 text-[12px] text-muted">
            Showing {filteredEntries.length} of {entries.length}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:w-[52rem] xl:grid-cols-4">
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
        <p className="pt-4 text-sm text-muted">No entries match this filter.</p>
      ) : (
        <ul className="divide-y divide-subtle">
          {filteredEntries.map((entry) => (
            <li
              key={entry.id}
              className="grid gap-3 py-3 first:pt-4 last:pb-0 md:grid-cols-[11rem_minmax(0,1fr)_8rem_7rem] md:items-start"
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
              <span className="text-[11px] tabular-nums text-muted md:text-right">
                {normalizeText(entry.kaizen_date) || "-"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
