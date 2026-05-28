"use client";

import { STAGE_ORDER, type StageName } from "@/lib/profile/stage";

type ProgressYearBarProps = {
  selectedYear: StageName | null;
  currentYear: StageName | null;
  onYearChange: (year: StageName) => void;
  disabled?: boolean;
};

export function ProgressYearBar({
  selectedYear,
  currentYear,
  onYearChange,
  disabled,
}: ProgressYearBarProps) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        Training year
      </p>
      <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-surface-3 p-0.5">
        {STAGE_ORDER.map((year) => {
          const isSelected = selectedYear === year;
          const isCurrent = currentYear === year;
          return (
            <button
              key={year}
              type="button"
              disabled={disabled}
              onClick={() => onYearChange(year)}
              className={[
                "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150 disabled:opacity-50",
                isSelected
                  ? "bg-surface-1 text-primary shadow-sm ring-1 ring-subtle"
                  : "text-muted hover:text-secondary",
              ].join(" ")}
            >
              {year}
              {isCurrent ? <span className="ml-1 opacity-60">· you</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
