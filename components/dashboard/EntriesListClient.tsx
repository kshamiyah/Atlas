"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  formatRelativeSyncTime,
  matchesKaizenDayFilter,
  toIsoDateOrNull,
} from "@/lib/kaizen/kaizen-date";
import { parseLinkedKeySkillsRaw } from "@/lib/key-skill-review/kaizen-key-skill-parser";
import {
  filterKaizenEntriesForYear,
  listAvailableTrainingYears,
  resolveYearScopeContext,
  type ProfilePost,
} from "@/lib/progress/year-portfolio";
import { STAGE_ORDER, type StageName } from "@/lib/profile/stage";

type EntryRow = {
  id: string;
  title: string | null;
  kaizen_date: string | null;
  assessment_type: string | null;
  status: string | null;
  synced_at: string | null;
  source_entry_id?: string | null;
  source_url?: string | null;
  detected_entry_type?: string | null;
  category?: string | null;
  training_year?: string | null;
  linked_cip_number?: number | null;
  entry_text?: string | null;
  extracted_fields?: Record<string, unknown> | null;
  extraction_status?: string | null;
  key_skills_count?: number | null;
  kaizen_procedure_id?: number | null;
  assessor_role_id?: number | null;
};

type EntriesListClientProps = {
  entries: EntryRow[];
  totalSyncedCount: number;
  postHistory?: ProfilePost[];
  initialDayFilter?: string;
  initialQuery?: string;
  initialYearFilter?: StageName | null;
};

type YearFilterValue = "all" | StageName;

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

function formatEntryType(entry: EntryRow) {
  const detectedType = normalizeText(entry.detected_entry_type).toLowerCase();
  const typeMap: Record<string, string> = {
    osats_formative: "OSATS formative",
    osats_summative: "OSATS summative",
    reflective_log: "Reflection",
    reflective_log_entry: "Reflection",
    cbd: "Case-based discussion",
    mini_cex: "Mini-CEX",
    noa: "NOTSS/NOA",
    other_evidence: "Other evidence",
    teaching: "Teaching",
  };

  if (detectedType && typeMap[detectedType]) return typeMap[detectedType];

  return normalizeText(entry.assessment_type) || "Entry";
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="text-[12px] text-primary">{value}</p>
    </div>
  );
}

export function EntriesListClient({
  entries,
  totalSyncedCount,
  postHistory = [],
  initialDayFilter = "",
  initialQuery = "",
  initialYearFilter = null,
}: EntriesListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState(initialDayFilter);
  const [yearFilter, setYearFilter] = useState<YearFilterValue>(initialYearFilter ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>("synced_at");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(entries[0]?.id ?? null);
  const [showDetails, setShowDetails] = useState(true);

  const availableYears = useMemo(
    () => listAvailableTrainingYears(postHistory, entries),
    [entries, postHistory],
  );

  const yearScope = useMemo(() => {
    if (yearFilter === "all") return null;
    return resolveYearScopeContext(postHistory, yearFilter);
  }, [postHistory, yearFilter]);

  const yearScopedEntries = useMemo(() => {
    if (yearFilter === "all") return entries;
    return filterKaizenEntriesForYear(
      entries,
      yearFilter,
      yearScope?.postWindow ?? null,
    );
  }, [entries, yearFilter, yearScope?.postWindow]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    dayFilter.trim().length > 0 ||
    yearFilter !== "all";

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
    const filtered = yearScopedEntries.filter((entry) => {
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
  }, [dayFilter, query, sortKey, statusFilter, typeFilter, yearScopedEntries]);

  function updateYearFilter(next: YearFilterValue) {
    setYearFilter(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "all") params.delete("year");
    else params.set("year", next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDayFilter("");
    if (yearFilter !== "all") updateYearFilter("all");
  }

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ?? filteredEntries[0] ?? null;
  const selectedLinkedKeySkills = useMemo(() => {
    if (!selectedEntry?.extracted_fields || typeof selectedEntry.extracted_fields !== "object") {
      return [];
    }

    const raw = selectedEntry.extracted_fields["linked key skills"];
    const parsed = parseLinkedKeySkillsRaw(typeof raw === "string" ? raw : null);

    return parsed.map((skill) => ({
      cipNumber: skill.cip_number,
      title: skill.key_skill_title,
    }));
  }, [selectedEntry]);

  const activeSortLabel = sortKey === "synced_at" ? "Recently synced" : "Entry date";

  return (
    <section className="card rounded-lg p-5 shadow-none">
      <div className="space-y-4 border-b border-subtle pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-small font-semibold text-primary">Evidence library</h2>
            <p className="mt-1 text-[12px] text-muted">
              Browse the entries Atlas has synced from ePortfolio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-secondary">
              Showing {filteredEntries.length} of {entries.length} loaded
            </span>
            {totalSyncedCount > entries.length ? (
              <span className="rounded-full bg-surface-3 px-2.5 py-1 text-secondary">
                {totalSyncedCount} synced in total
              </span>
            ) : null}
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-secondary">
              Sort: {activeSortLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,0.75fr))]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, types, dates, or statuses"
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          />
          <select
            value={yearFilter}
            onChange={(event) => updateYearFilter(event.target.value as YearFilterValue)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          >
            <option value="all">All training years</option>
            {STAGE_ORDER.map((year) => (
              <option key={year} value={year} disabled={!availableYears.includes(year)}>
                {year}
                {!availableYears.includes(year) ? " (no evidence)" : ""}
              </option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[12px] text-primary outline-none transition focus:border-accent-primary"
          >
            <option value="synced_at">Recently synced</option>
            <option value="entry_date">Entry date</option>
          </select>
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

        {yearFilter !== "all" ? (
          <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/8 px-3 py-2 text-[11px] leading-relaxed text-secondary">
            <span className="font-medium text-primary">{yearFilter} scope:</span>{" "}
            {yearScope?.scopeMethod === "post_window" && yearScope.postWindowLabel ? (
              <>
                entries dated within your ePortfolio post ({yearScope.postWindowLabel}
                {yearScope.postWindow?.hospital ? ` · ${yearScope.postWindow.hospital}` : ""})
              </>
            ) : (
              <>entries tagged as {yearFilter} in ePortfolio</>
            )}
            {" · "}
            {yearScopedEntries.length} matching loaded entries
          </div>
        ) : null}

        {hasActiveFilters ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">Filters are narrowing your entry library.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="pt-4">
          <p className="text-sm text-muted">
            {entries.length === 0
              ? "No entries synced yet."
              : "No entries match this filter."}
          </p>
        </div>
      ) : (
        <div
          className={
            showDetails
              ? "grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)] xl:items-start"
              : "grid gap-4"
          }
        >
          <div>
            <div className="hidden gap-3 border-b border-subtle py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted md:grid md:grid-cols-[minmax(0,1fr)_11rem]">
              <span>Entry</span>
              <span className="md:text-right">Dates</span>
            </div>
            <ul className="divide-y divide-subtle">
              {filteredEntries.map((entry) => {
                const active = selectedEntry?.id === entry.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEntryId(entry.id);
                        setShowDetails(true);
                      }}
                      className="grid w-full gap-3 py-4 text-left transition first:pt-4 last:pb-0 md:grid-cols-[minmax(0,1fr)_11rem] md:items-start"
                      style={{
                        background: active ? "rgba(0,113,227,0.06)" : "transparent",
                      }}
                    >
                      <div className="min-w-0 space-y-2 px-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex max-w-full rounded-md bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                            <span className="truncate">
                              {normalizeText(entry.assessment_type) || "Entry"}
                            </span>
                          </span>
                        </div>
                        <p className="min-w-0 text-sm font-medium leading-6 text-primary">
                          {normalizeText(entry.title) || "Untitled entry"}
                        </p>
                      </div>
                      <div className="space-y-1 px-1 text-[11px] md:text-right">
                        <p className="tabular-nums text-muted">
                          {normalizeText(entry.kaizen_date) || "—"}
                        </p>
                        <p
                          className="tabular-nums text-secondary"
                          title={entry.synced_at ? new Date(entry.synced_at).toLocaleString("en-GB") : undefined}
                        >
                          Synced {formatRelativeSyncTime(entry.synced_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {showDetails ? (
            <aside className="card rounded-lg border border-subtle bg-surface-1 p-4 shadow-none xl:sticky xl:top-20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-small font-semibold text-primary">Entry detail</h3>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
                >
                  Hide details
                </button>
              </div>
              {!selectedEntry ? (
                <p className="text-sm text-muted">Select an entry to inspect its synced detail.</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-md bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                        {normalizeText(selectedEntry.assessment_type) || "Entry"}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-primary">
                      {normalizeText(selectedEntry.title) || "Untitled entry"}
                    </h3>
                    <p className="text-[12px] text-secondary">
                      Entry date {normalizeText(selectedEntry.kaizen_date) || "—"} · synced{" "}
                      {formatRelativeSyncTime(selectedEntry.synced_at)}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Training year" value={normalizeText(selectedEntry.training_year)} />
                    <Field label="Linked key skills count" value={selectedEntry.key_skills_count ?? null} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Linked key skills
                    </p>
                    {selectedLinkedKeySkills.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedLinkedKeySkills.map((skill) => (
                          <span
                            key={`${skill.cipNumber}-${skill.title}`}
                            className="inline-flex rounded-md bg-surface-3 px-2 py-1 text-[11px] text-secondary"
                          >
                            CiP {skill.cipNumber}: {skill.title}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted">No linked key skills recorded for this entry.</p>
                    )}
                  </div>

                  {selectedEntry.source_url ? (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Source
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={selectedEntry.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary px-3 py-2 text-[12px]"
                        >
                          Open in ePortfolio
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </aside>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
              >
                Show details
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
