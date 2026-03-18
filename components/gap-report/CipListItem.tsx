import type { GapReportCip } from "@/lib/types/gap-report";

type CipListItemProps = {
  cip: GapReportCip;
  isSelected: boolean;
  onSelect: () => void;
};

function progressBarColour(coveragePct: number): string {
  if (coveragePct === 0) return "bg-accent-red";
  if (coveragePct >= 100) return "bg-accent-green";
  return "bg-accent-amber";
}

export function CipListItem({
  cip,
  isSelected,
  onSelect,
}: CipListItemProps) {
  const pct = Math.min(100, Math.max(0, cip.coverage_pct));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card-interactive w-full border-l-2 px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? "border-accent-green bg-surface-3"
          : "border-transparent hover:bg-surface-3"
      }`}
    >
      <div className="truncate text-micro font-semibold text-primary">
        CiP {cip.cip_number}: {cip.cip_title}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-4">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressBarColour(cip.coverage_pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-micro text-muted">
          {cip.confirmed_skills} / {cip.total_skills}
        </span>
      </div>
    </button>
  );
}
