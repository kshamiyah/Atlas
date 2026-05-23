"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const WEEKS = 52;
const DAYS = 7;

type ActivityEntry = {
  id: string;
  title: string;
  entryType: string;
  eventDate: string;
};

// Returns YYYY-MM-DD for the Sunday that starts the 52-week window ending today
function getStartDate(): Date {
  const today = new Date();
  // Align to start of day
  today.setHours(0, 0, 0, 0);
  // Go back 52 weeks, then rewind to the nearest Sunday
  const d = new Date(today);
  d.setDate(d.getDate() - WEEKS * 7);
  // Snap to Sunday (day 0)
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function toYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

function cellColor(count: number, dark = false): string {
  if (count === 0) return dark ? "#28282b" : "#e5e5ea";
  if (count === 1) return "#bbf7c4";
  if (count === 2) return "#4ade80";
  return "#28cd41";
}

type ActivityHeatmapProps = {
  dataVersion?: string;
};

async function loadActivityEntries(): Promise<ActivityEntry[]> {
  const response = await fetch("/api/activity");
  const data = await response.json();
  return (data?.entries as ActivityEntry[]) ?? [];
}

export function ActivityHeatmap({ dataVersion = "initial" }: ActivityHeatmapProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    loadActivityEntries()
      .then((nextEntries) => {
        if (!active) return;
        setEntries(nextEntries);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dataVersion]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data) return;

      if (event.data.type === "PORTFOLIOIQ_SYNC_ALL_DONE") {
        loadActivityEntries().then(setEntries);
        return;
      }

      if (event.data.type !== "PORTFOLIOIQ_LIGHTWEIGHT_REFRESH_PROGRESS") return;
      const phase = event.data.payload?.phase;
      if (phase === "done" || phase === "error") {
        loadActivityEntries().then(setEntries);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const { grid, totalDays, entriesByDate } = useMemo(() => {
    const startDate = getStartDate();
    const countByDate = new Map<string, number>();
    const byDate = new Map<string, ActivityEntry[]>();

    for (const entry of entries) {
      const key = entry.eventDate.slice(0, 10);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
      byDate.set(key, [...(byDate.get(key) ?? []), entry]);
    }

    // Build grid[week][day]
    const grid: Array<Array<{ ymd: string; count: number }>> = [];
    let day = new Date(startDate);
    for (let w = 0; w < WEEKS; w++) {
      const week: Array<{ ymd: string; count: number }> = [];
      for (let d = 0; d < DAYS; d++) {
        const ymd = toYMD(day);
        week.push({ ymd, count: countByDate.get(ymd) ?? 0 });
        day = new Date(day);
        day.setDate(day.getDate() + 1);
      }
      grid.push(week);
    }

    const totalDays = countByDate.size;
    return { grid, totalDays, entriesByDate: byDate };
  }, [entries]);

  // Month labels: figure out which week each month starts
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; week: number }> = [];
    let lastMonth = -1;
    grid.forEach((week, wi) => {
      const firstDay = new Date(week[0].ymd);
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({
          label: firstDay.toLocaleDateString("en-GB", { month: "short" }),
          week: wi,
        });
        lastMonth = month;
      }
    });
    return labels;
  }, [grid]);

  const today = toYMD(new Date());
  const totalEntries = entries.length;
  const selectedEntries = selectedDay ? entriesByDate.get(selectedDay) ?? [] : [];

  if (isLoading) {
    return (
      <section className="card w-full rounded-lg p-5 shadow-none">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-3" />
        <div className="mt-4 h-24 w-full animate-pulse rounded bg-surface-3" />
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="card w-full rounded-lg p-5 shadow-none">
        <h2 className="text-small font-semibold text-primary">Entry activity</h2>
        <p className="mt-1 text-micro text-muted">
          No dated entries yet — sync your portfolio to see activity by entry date.
        </p>
      </section>
    );
  }

  const cellW = 10;
  const cellH = 10;
  const gap = 2;
  const dayLabelW = 24;
  const totalW = dayLabelW + WEEKS * (cellW + gap);
  const topPad = 18; // room for month labels
  const totalH = topPad + DAYS * (cellH + gap);

  return (
    <section className="card w-full rounded-lg p-5 shadow-none">
      <div className="mb-4 flex flex-col gap-1 border-b border-subtle pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-small font-semibold text-primary">Entry activity</h2>
        <span className="text-micro text-muted">
          {totalEntries} entr{totalEntries !== 1 ? "ies" : "y"} logged ·{" "}
          {totalDays} day{totalDays !== 1 ? "s" : ""} active
        </span>
      </div>

      <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-3">
        <svg
          viewBox={`0 0 ${totalW} ${totalH}`}
          className="block h-auto max-h-44 w-full"
        >
          {/* Month labels */}
          {monthLabels.map(({ label, week }) => (
            <text
              key={label + week}
              x={dayLabelW + week * (cellW + gap)}
              y={11}
              fontSize={9}
              fill="var(--text-muted)"
              fontFamily="inherit"
            >
              {label}
            </text>
          ))}

          {/* Day-of-week labels */}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <text
              key={d}
              x={0}
              y={topPad + (i * 2 + 1) * (cellH + gap) + cellH - 2}
              fontSize={8}
              fill="var(--text-muted)"
              fontFamily="inherit"
            >
              {d}
            </text>
          ))}

          {/* Cells */}
          {grid.map((week, wi) =>
            week.map(({ ymd, count }, di) => {
              const x = dayLabelW + wi * (cellW + gap);
              const y = topPad + di * (cellH + gap);
              const isToday = ymd === today;
              return (
                <g key={ymd}>
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    rx={2}
                    fill={cellColor(count)}
                    stroke={
                      selectedDay === ymd
                        ? "var(--accent-primary)"
                        : isToday
                          ? "var(--accent-green)"
                          : "none"
                    }
                    strokeWidth={selectedDay === ymd ? 1.5 : isToday ? 1.5 : 0}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onClick={() =>
                      setSelectedDay((current) => (current === ymd ? null : ymd))
                    }
                  />
                  <title>
                    {new Date(ymd).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {`: ${count} entr${count !== 1 ? "ies" : "y"}`}
                  </title>
                </g>
              );
            })
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[10px] text-muted">Less</span>
        {[0, 1, 2, 3].map((level) => (
          <div
            key={level}
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: cellColor(level) }}
          />
        ))}
        <span className="text-[10px] text-muted">More</span>
      </div>

      {selectedDay ? (
        <div className="mt-4 rounded-lg border border-subtle bg-surface-1 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Selected day
              </p>
              <h3 className="mt-1 text-sm font-semibold text-primary">
                {new Date(selectedDay).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <p className="mt-1 text-[12px] text-muted">
                {selectedEntries.length} entr
                {selectedEntries.length !== 1 ? "ies" : "y"} logged
              </p>
            </div>

            <Link
              href={`/dashboard/entries?day=${selectedDay}`}
              className="btn-secondary w-fit px-3 py-1.5 text-[11px]"
            >
              Open in My Entries
            </Link>
          </div>

          {selectedEntries.length === 0 ? (
            <p className="mt-3 text-[12px] text-muted">No entries logged on this day.</p>
          ) : (
            <ul className="mt-3 divide-y divide-subtle">
              {selectedEntries.slice(0, 5).map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[10rem_minmax(0,1fr)]"
                >
                  <span className="inline-flex w-fit max-w-full rounded-md bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                    <span className="truncate">
                      {entry.entryType?.trim() || "Entry"}
                    </span>
                  </span>
                  <span className="min-w-0 text-sm leading-6 text-primary">
                    {entry.title?.trim() || "Untitled entry"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
