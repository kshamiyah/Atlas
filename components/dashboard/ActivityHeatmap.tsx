"use client";

import { useEffect, useMemo, useState } from "react";

const WEEKS = 52;
const DAYS = 7;

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

export function ActivityHeatmap() {
  const [dates, setDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data) => {
        setDates((data?.dates as string[]) ?? []);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const { grid, totalDays } = useMemo(() => {
    const startDate = getStartDate();
    const countByDate = new Map<string, number>();

    for (const d of dates) {
      const key = d.slice(0, 10); // YYYY-MM-DD
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
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
    return { grid, totalDays };
  }, [dates]);

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
  const totalEntries = dates.length;

  if (isLoading) {
    return (
      <section className="card p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-3" />
        <div className="mt-4 h-24 w-full animate-pulse rounded bg-surface-3" />
      </section>
    );
  }

  if (dates.length === 0) {
    return (
      <section className="card p-6">
        <h2 className="text-small font-semibold text-primary">Evidence Activity</h2>
        <p className="mt-1 text-micro text-muted">
          No entry dates yet — sync your portfolio to see activity.
        </p>
      </section>
    );
  }

  const cellW = 12;
  const cellH = 12;
  const gap = 2;
  const dayLabelW = 28;
  const totalW = dayLabelW + WEEKS * (cellW + gap);
  const topPad = 18; // room for month labels
  const totalH = topPad + DAYS * (cellH + gap);

  return (
    <section className="card p-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-subtle pb-3">
        <h2 className="text-small font-semibold text-primary">Evidence Activity</h2>
        <span className="text-micro text-muted">
          {totalEntries} entr{totalEntries !== 1 ? "ies" : "y"} logged ·{" "}
          {totalDays} day{totalDays !== 1 ? "s" : ""} active
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1 p-3">
        <svg
          width={totalW}
          height={totalH}
          className="block"
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
                    stroke={isToday ? "var(--accent-green)" : "none"}
                    strokeWidth={isToday ? 1.5 : 0}
                  />
                  {count > 0 && (
                    <title>{`${ymd}: ${count} entr${count !== 1 ? "ies" : "y"}`}</title>
                  )}
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
    </section>
  );
}
