"use client";

import { useMemo, useState } from "react";

type UnsignedAssessmentEntry = {
  id: string;
  other_party_name: string;
  entry_title: string;
  status: string;
  date: string;
};

type UnsignedAssessmentEntriesSectionProps = {
  entries: UnsignedAssessmentEntry[];
  hasEntriesSync: boolean;
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

function statusTone(status: string): {
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

type FilterKey = "all" | "awaiting" | "expired" | "unknown";

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

export function UnsignedAssessmentEntriesSection({
  entries,
  hasEntriesSync,
}: UnsignedAssessmentEntriesSectionProps) {
  const actionable = useMemo(
    () =>
      entries.filter(
        (entry) =>
          !isCompleteStatus(entry.status) &&
          !isTeamObservationEntry(entry.entry_title),
      ),
    [entries],
  );
  const [filter, setFilter] = useState<FilterKey>("all");

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

  const visibleEntries = useMemo(() => {
    if (filter === "all") return actionable;
    return actionable.filter((entry) => classifyStatus(entry.status) === filter);
  }, [actionable, filter]);

  if (!hasEntriesSync && actionable.length === 0) {
    return (
      <section className="rounded-lg border border-subtle bg-surface-2 p-4">
        <h2 className="text-small font-semibold text-primary">
          Unsigned assessments
        </h2>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          Sync your Kaizen entries to list assessor-dependent assessments that
          are not yet complete or signed.
        </p>
      </section>
    );
  }

  if (actionable.length === 0) {
    return (
      <section className="rounded-lg border border-subtle bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-small font-semibold text-primary">
            Unsigned assessments
          </h2>
          <span className="rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-[10px] font-medium text-secondary">
            0 open
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          No assessor-dependent assessments are currently excluded from
          portfolio evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300/35 bg-surface-2 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-small font-semibold text-primary">
            Unsigned assessments
          </h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-muted">
            These assessor-dependent assessments are not complete or signed, so
            they should not count toward portfolio evidence.
          </p>
        </div>
        <span className="w-fit rounded-full border border-amber-300/35 bg-amber-300/12 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
          {actionable.length} open
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["awaiting", "Awaiting assessment"],
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

      <ul className="mt-4 divide-y divide-subtle rounded-lg border border-subtle bg-surface-1">
        {visibleEntries.slice(0, 4).map((entry) => {
          const tone = statusTone(entry.status);
          return (
            <li
              key={entry.id}
              className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_8rem] md:items-start"
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

      {visibleEntries.length > 4 ? (
        <p className="mt-3 text-[10px] text-muted">
          Showing 4 of {visibleEntries.length} entries.
        </p>
      ) : null}

      {visibleEntries.length === 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-muted">
          No entries in this filter.
        </p>
      ) : null}
    </section>
  );
}
