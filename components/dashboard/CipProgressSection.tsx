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
  if (statusColour === "green") return "bg-accent-green";
  if (statusColour === "orange") return "bg-accent-amber";
  if (statusColour === "red") return "bg-accent-red";
  return "bg-surface-4";
}

// Fix 14: plain-English status narrative
function statusNarrative(pct: number | null, colour: string | null): {
  label: string;
  className: string;
} {
  if (pct === null || pct === 0) {
    return { label: "No evidence yet", className: "text-muted" };
  }
  if (colour === "green" || pct >= 80) {
    return { label: "On track", className: "text-accent-green" };
  }
  if (colour === "orange" || pct >= 50) {
    return { label: "Building", className: "text-accent-amber" };
  }
  return { label: "Needs evidence", className: "text-accent-red" };
}

export function CipProgressSection({ cips }: CipProgressSectionProps) {
  if (cips.length === 0) {
    return (
      <section className="rounded-lg border border-subtle bg-surface-2 p-5">
        <h2 className="text-small font-semibold text-primary">CiP progress</h2>
        <p className="mt-2 text-micro text-muted">
          No data yet. Use the PortfolioIQ extension on your Kaizen dashboard and
          click &quot;Sync Dashboard&quot; to pull your progress.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-subtle bg-surface-2 p-5">
      <h2 className="text-small font-semibold text-primary mb-4">CiP progress</h2>
      <ul className="space-y-3">
        {cips.map((c) => {
          const { label, className: narrativeClass } = statusNarrative(
            c.percentage,
            c.status_colour,
          );
          return (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-micro font-medium text-secondary">
                  CiP {c.cip_number}: {c.cip_title}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-micro font-medium ${narrativeClass}`}>
                    {label}
                  </span>
                  <span className="text-micro tabular-nums text-muted">
                    {c.percentage != null ? `${c.percentage}%` : "—"}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
                <div
                  className={`h-full ${barColour(c.status_colour)} transition-all`}
                  style={{
                    width: `${Math.min(100, Math.max(0, c.percentage ?? 0))}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
