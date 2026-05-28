"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "Reading your notes", fromSec: 0 },
  { label: "Writing entry fields", fromSec: 35 },
  { label: "Mapping key skills & descriptors", fromSec: 70 },
] as const;

const EXPECTED_SEC = 95;

type Props = {
  startedAt: number;
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function GenerateLoadingPanel({ startedAt }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const activeStep = STEPS.reduce(
    (idx, step, i) => (elapsed >= step.fromSec ? i : idx),
    0,
  );
  const progress = Math.min(0.92, elapsed / EXPECTED_SEC);

  return (
    <section
      className="card overflow-hidden p-0"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="border-b border-subtle bg-accent-blue/5 px-5 py-4 md:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
              Generating
            </p>
            <h2 className="mt-1 text-base font-semibold text-primary">
              Writing your entry
            </h2>
            <p className="mt-1 text-xs text-secondary">
              Atlas is structuring your notes and matching curriculum skills.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted">
            {formatElapsed(elapsed)}
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent-blue transition-[width] duration-1000 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Usually 1–2 minutes. Keep this tab open.
        </p>
      </div>

      <ol className="space-y-0 divide-y divide-subtle px-5 py-2 md:px-6">
        {STEPS.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          return (
            <li
              key={step.label}
              className="flex items-center gap-3 py-3 text-sm"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  done
                    ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
                    : active
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-subtle bg-surface-2 text-muted"
                }`}
              >
                {done ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : active ? (
                  <span
                    className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-blue"
                    aria-hidden
                  />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={
                  active
                    ? "font-medium text-primary"
                    : done
                      ? "text-secondary"
                      : "text-muted"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
