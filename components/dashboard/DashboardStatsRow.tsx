"use client";

import { useState } from "react";

type Stat = {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "green" | "amber" | "blue" | "default";
};

function StatCard({ label, value, sub, accent = "default" }: Stat) {
  const valueClass =
    accent === "green"
      ? "text-accent-green"
      : accent === "amber"
        ? "text-accent-amber"
        : accent === "blue"
          ? "text-accent-blue"
          : "text-primary";

  return (
    <div className="card-interactive flex flex-col gap-0.5 rounded-xl border border-subtle bg-surface-2 px-4 py-3.5">
      <span className="text-micro text-muted">{label}</span>
      <span
        className={`text-heading-2 font-bold tabular-nums leading-tight ${valueClass}`}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

type DashboardStatsRowProps = {
  totalEntries: number;
  confirmedSkills: number;
  cipsInProgress: number;
  totalCips: number;
  daysToArcp: number | null;
  arcpDate: string | null;
  isLoading?: boolean;
};

export function DashboardStatsRow({
  totalEntries,
  confirmedSkills,
  cipsInProgress,
  totalCips,
  daysToArcp,
  arcpDate,
  isLoading,
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[78px] animate-pulse rounded-xl bg-surface-3"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total entries"
        value={totalEntries}
        sub="synced from Kaizen"
      />
      <StatCard
        label="Confirmed skills"
        value={confirmedSkills}
        sub="key skills with evidence"
        accent="green"
      />
      <StatCard
        label="CiPs in progress"
        value={totalCips > 0 ? `${cipsInProgress}/${totalCips}` : "—"}
        sub="at least 1 confirmed skill"
        accent={
          cipsInProgress === totalCips && totalCips > 0
            ? "green"
            : cipsInProgress > 0
              ? "blue"
              : "default"
        }
      />
      {/* Days to ARCP */}
      <div className="card flex flex-col gap-1 p-4">
        <p
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Days to ARCP
        </p>
        {editingArcp ? (
          <form
            onSubmit={saveArcpDate}
            className="flex flex-col gap-2"
          >
            <input
              type="date"
              name="arcp_date"
              defaultValue={arcpDate ?? ""}
              required
              className="login-input rounded-lg px-2 py-1 text-xs outline-none"
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
        ) : daysToArcp !== null ? (
          <div className="flex items-start gap-1.5">
            <p
              className="text-2xl font-bold tabular-nums"
              style={{
                color:
                  daysToArcp < 30
                    ? "var(--accent-red)"
                    : daysToArcp < 90
                      ? "var(--accent-amber)"
                      : "var(--text-primary)",
              }}
            >
              {daysToArcp < 0 ? "Past" : daysToArcp}
            </p>
            <button
              type="button"
              onClick={() => setEditingArcp(true)}
              className="mt-1 rounded p-0.5 transition hover:bg-surface-3"
              style={{ color: "var(--text-muted)" }}
              aria-label="Edit ARCP date"
            >
              <svg
                width="14"
                height="14"
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
            className="text-left text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--text-secondary)" }}
          >
            Set ARCP date →
          </button>
        )}
      </div>
    </div>
  );
}
