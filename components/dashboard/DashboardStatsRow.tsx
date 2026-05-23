"use client";

import { useState } from "react";

type Stat = {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "green" | "amber" | "blue" | "default";
};

function StatCard({ label, value, sub, accent = "default" }: Stat) {
  const valueColor =
    accent === "green"
      ? "var(--accent-green)"
      : accent === "amber"
        ? "var(--accent-amber)"
        : accent === "blue"
          ? "var(--accent-blue)"
          : "var(--text-primary)";

  return (
    <div
      className="card flex min-h-[150px] flex-col justify-between gap-3 p-6"
      style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.03), 0 10px 28px rgba(0,0,0,0.05)" }}
    >
      <div className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <span
          className="block text-[2.7rem] font-semibold tabular-nums leading-none tracking-[-0.04em]"
          style={{ color: valueColor }}
        >
          {value}
        </span>
      </div>
      {sub && <span className="text-[11px] leading-5 text-muted">{sub}</span>}
    </div>
  );
}

type DashboardStatsRowProps = {
  totalEntries: number;
  calendarDaysToArcp: number | null;
  wteDaysToArcp: number | null;
  workingPercent: number;
  arcpDate: string | null;
};

export function DashboardStatsRow({
  totalEntries,
  calendarDaysToArcp,
  wteDaysToArcp,
  workingPercent,
  arcpDate,
}: DashboardStatsRowProps) {
  const [editingArcp, setEditingArcp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveArcpDate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const date = new FormData(e.currentTarget).get("arcp_date") as string;
      const res = await fetch("/api/profile/arcp-date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arcp_date: date }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[arcp-date]", data?.error ?? res.statusText);
        return;
      }
      setEditingArcp(false);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  const isLtft = workingPercent < 100;
  const focusDaysToArcp =
    isLtft && wteDaysToArcp !== null ? wteDaysToArcp : calendarDaysToArcp;

  const arcpValueColor =
    focusDaysToArcp !== null
      ? focusDaysToArcp < 30
        ? "var(--accent-red)"
        : focusDaysToArcp < 90
          ? "var(--accent-amber)"
          : "var(--text-primary)"
      : "var(--text-muted)";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StatCard label="Total entries" value={totalEntries} sub="synced from Kaizen" />

      {/* Days to ARCP */}
      <div
        className="card flex min-h-[150px] flex-col justify-between gap-3 p-6"
        style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.03), 0 10px 28px rgba(0,0,0,0.05)" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Days to ARCP
        </span>

        {editingArcp ? (
          <form onSubmit={saveArcpDate} className="mt-1 flex flex-col gap-2">
            <input
              type="date"
              name="arcp_date"
              defaultValue={arcpDate ?? ""}
              required
              className="app-input rounded-lg px-2 py-1.5 text-xs outline-none"
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingArcp(false)}
                className="btn-secondary px-2 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : focusDaysToArcp !== null ? (
          <div className="flex items-end gap-1.5">
            <span
              className="text-[2.7rem] font-semibold tabular-nums leading-none tracking-[-0.04em]"
              style={{ color: arcpValueColor }}
            >
              {focusDaysToArcp < 0 ? "Past" : focusDaysToArcp}
            </span>
            {isLtft && (
              <span className="mb-1 text-[11px] text-muted">
                WTE
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditingArcp(true)}
              className="mb-1 rounded p-0.5 transition hover:bg-surface-3"
              style={{ color: "var(--text-muted)" }}
              aria-label="Edit ARCP date"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          </div>
        ) : (
          <button
              type="button"
              onClick={() => setEditingArcp(true)}
              className="mt-1 text-left text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              Set ARCP date →
          </button>
        )}
        {focusDaysToArcp !== null && isLtft && (
          <span className="text-[11px] leading-5 text-muted">
            {workingPercent}% LTFT · {calendarDaysToArcp ?? "—"} calendar day
            {(calendarDaysToArcp ?? 0) === 1 ? "" : "s"}
          </span>
        )}
        {focusDaysToArcp === null && isLtft && (
          <span className="text-[11px] leading-5 text-muted">
            LTFT mode active ({workingPercent}% WTE). Add ARCP date to show adjusted countdown.
          </span>
        )}
      </div>
    </div>
  );
}
