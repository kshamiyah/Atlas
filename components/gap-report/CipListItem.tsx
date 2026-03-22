import type { GapReportCip } from "@/lib/types/gap-report";

export type CipPriority = "at-risk" | "needs-work" | "on-track";

type CipListItemProps = {
  cip: GapReportCip;
  priority: CipPriority;
  missingSkills: number;
  nextAction: string;
  isSelected: boolean;
  onSelect: () => void;
};

function progressBarColour(coveragePct: number): string {
  if (coveragePct === 0) return "bg-accent-red";
  if (coveragePct >= 100) return "bg-accent-green";
  return "bg-accent-amber";
}

function priorityTheme(priority: CipPriority): {
  label: string;
  chip: string;
} {
  if (priority === "at-risk") {
    return {
      label: "At Risk",
      chip: "bg-accent-red/12 text-accent-red border-accent-red/30",
    };
  }
  if (priority === "needs-work") {
    return {
      label: "Needs Work",
      chip: "bg-accent-amber/14 text-accent-amber border-accent-amber/35",
    };
  }
  return {
    label: "On Track",
    chip: "bg-accent-green/14 text-accent-green border-accent-green/35",
  };
}

export function CipListItem({
  cip,
  priority,
  missingSkills,
  nextAction,
  isSelected,
  onSelect,
}: CipListItemProps) {
  const pct = Math.min(100, Math.max(0, cip.coverage_pct));
  const badge = priorityTheme(priority);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card-interactive w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
        isSelected
          ? "border-accent-blue/45 bg-surface-2 ring-1 ring-accent-blue/20"
          : "border-subtle bg-surface-1 hover:bg-surface-3"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-primary">
            CiP {cip.cip_number}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">{cip.cip_title}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.chip}`}>
          {badge.label}
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressBarColour(cip.coverage_pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">
            {cip.confirmed_skills}/{cip.total_skills} confirmed
          </span>
          <span className="font-medium text-secondary">
            {missingSkills} missing
          </span>
        </div>
        <span className="line-clamp-1 text-[11px] text-muted">
          Next: {nextAction}
        </span>
      </div>
    </button>
  );
}
