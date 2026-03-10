type CipRow = {
  id: string;
  cip_number: number;
  cip_title: string;
  percentage: number | null;
  status_colour: string | null;
};

type CipProgressSectionProps = {
  cips: CipRow[];
};

function barColour(statusColour: string | null) {
  if (statusColour === "green") return "bg-emerald-500";
  if (statusColour === "orange") return "bg-amber-500";
  if (statusColour === "red") return "bg-red-500";
  return "bg-slate-600";
}

export function CipProgressSection({ cips }: CipProgressSectionProps) {
  if (cips.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          CiP progress
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          No data yet. Use the PortfolioIQ extension on your Kaizen dashboard and
          click &quot;Sync Dashboard&quot; to pull your progress.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-4">
        CiP progress
      </h2>
      <ul className="space-y-3">
        {cips.map((c) => (
          <li key={c.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                CiP {c.cip_number}: {c.cip_title}
              </span>
              <span className="text-xs tabular-nums text-slate-400">
                {c.percentage != null ? `${c.percentage}%` : "—"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${barColour(c.status_colour)} transition-all`}
                style={{
                  width: `${Math.min(100, Math.max(0, c.percentage ?? 0))}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
