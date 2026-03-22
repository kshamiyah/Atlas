const SYNC_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  cip_detail: "CiP detail",
  entries: "Entries",
};

function formatSyncTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

type CipRow = {
  id: string;
  cip_number: number;
  cip_title: string;
  percentage: number | null;
  status_colour: string | null;
};

type CipProgressSectionProps = {
  cips: CipRow[];
  lastSyncByType?: Record<string, string>;
};

function barColour(statusColour: string | null) {
  if (statusColour === "green") return "var(--accent-green)";
  if (statusColour === "orange") return "var(--accent-amber)";
  if (statusColour === "red") return "var(--accent-red)";
  return "var(--surface-4)";
}

function statusNarrative(
  pct: number | null,
  colour: string | null,
): { label: string; color: string } {
  if (pct === null || pct === 0) {
    return { label: "No evidence yet", color: "var(--text-muted)" };
  }
  if (colour === "green" || pct >= 80) {
    return { label: "On track", color: "var(--accent-green)" };
  }
  if (colour === "orange" || pct >= 50) {
    return { label: "Building", color: "var(--accent-amber)" };
  }
  return { label: "Needs evidence", color: "var(--accent-red)" };
}

export function CipProgressSection({
  cips,
  lastSyncByType,
}: CipProgressSectionProps) {
  const syncTypes = Object.keys(SYNC_LABELS);
  const hasSyncData =
    lastSyncByType && syncTypes.some((t) => lastSyncByType[t]);

  if (cips.length === 0) {
    return (
      <section className="card p-6">
        <h2
          className="text-small font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          CiP progress
        </h2>
        <p className="mt-2 text-micro text-muted">
          No data yet. Use the PortfolioIQ extension on your Kaizen dashboard
          and click &quot;Sync Dashboard&quot; to pull your progress.
        </p>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-0 p-6">
      <div className="mb-4 flex items-center justify-between border-b border-subtle pb-3">
        <h2
          className="text-small font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          CiP progress
        </h2>
        <a
          href="/dashboard/gap-report"
          className="text-[11px] font-medium text-accent-blue hover:underline"
        >
          View full report →
        </a>
      </div>
      <ul className="flex-1 space-y-3">
        {cips.map((c) => {
          const { label, color } = statusNarrative(c.percentage, c.status_colour);
          const fillColor = barColour(c.status_colour);
          return (
            <li key={c.id} className="rounded-xl border border-subtle bg-surface-1 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-micro font-medium text-secondary">
                  CiP {c.cip_number}:{" "}
                  <span className="text-muted font-normal">{c.cip_title}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-micro font-semibold"
                    style={{ color }}
                  >
                    {label}
                  </span>
                  <span className="text-micro tabular-nums text-muted">
                    {c.percentage != null ? `${c.percentage}%` : "—"}
                  </span>
                </div>
              </div>
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-4)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(0, c.percentage ?? 0))}%`,
                    background: fillColor,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Sync status footer */}
      {hasSyncData && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-subtle pt-4">
          {syncTypes.map((type) => {
            const at = lastSyncByType?.[type];
            return (
              <span key={type} className="text-[11px] text-muted">
                {SYNC_LABELS[type]}:{" "}
                <span className="text-secondary tabular-nums">
                  {at ? formatSyncTime(at) : "Never"}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
