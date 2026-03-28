"use client";

import type { ProgressCipRow, ProgressRagStatus } from "@/lib/types/progress";

function statusChip(status: ProgressRagStatus): { label: string; className: string } {
  if (status === "green") {
    return {
      label: "On track",
      className: "border-accent-green/40 bg-accent-green/12 text-accent-green",
    };
  }
  if (status === "amber") {
    return {
      label: "Needs work",
      className: "border-accent-amber/40 bg-accent-amber/14 text-accent-amber",
    };
  }
  return {
    label: "At risk",
    className: "border-accent-red/40 bg-accent-red/12 text-accent-red",
  };
}

function formatPct(block: { pct: number }): string {
  return `${block.pct}%`;
}

type ProgressCipListProps = {
  rows: ProgressCipRow[];
  selectedCipNumber: number;
  onSelect: (cipNumber: number) => void;
};

export function ProgressCipList({ rows, selectedCipNumber, onSelect }: ProgressCipListProps) {
  return (
    <ul className="space-y-1" role="listbox" aria-label="CiPs">
      {rows.map((row) => {
        const selected = row.cip_number === selectedCipNumber;
        const chip = statusChip(row.status);
        return (
          <li key={row.cip_number}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(row.cip_number)}
              className={[
                "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-accent-primary bg-accent-primary/10 ring-1 ring-accent-primary/30"
                  : "border-subtle bg-surface-1/60 hover:border-subtle hover:bg-surface-2/80",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-micro font-semibold text-primary">
                    CiP {row.cip_number}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-secondary">
                    {row.cip_title}
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    chip.className,
                  ].join(" ")}
                >
                  {chip.label}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-[11px] tabular-nums text-muted">
                <span>
                  Skills <span className="font-medium text-secondary">{formatPct(row.key_skills)}</span>
                </span>
                <span>
                  Desc.{" "}
                  <span className="font-medium text-secondary">{formatPct(row.descriptors)}</span>
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
