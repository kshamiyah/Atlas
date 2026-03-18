type SyncStatusSectionProps = {
  lastSyncByType: Record<string, string>;
};

const LABELS: Record<string, string> = {
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
    const diffHours = Math.floor(diffMs / 3600_000);
    const diffDays = Math.floor(diffMs / 86400_000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function SyncStatusSection({ lastSyncByType }: SyncStatusSectionProps) {
  const types = Object.keys(LABELS);
  const hasAny = types.some((t) => lastSyncByType[t]);

  if (!hasAny) {
    return (
      <section className="rounded-lg border border-subtle bg-surface-2 p-5">
        <h2 className="text-small font-semibold text-primary">Sync status</h2>
        <p className="mt-2 text-micro text-muted">
          No syncs recorded yet. Connect the extension and sync from Kaizen.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-subtle bg-surface-2 p-5">
      <h2 className="text-small font-semibold text-primary mb-3">Sync status</h2>
      <ul className="space-y-1.5">
        {types.map((type) => {
          const at = lastSyncByType[type];
          return (
            <li key={type} className="flex justify-between gap-2 text-micro text-muted">
              <span>{LABELS[type] ?? type}</span>
              <span className="tabular-nums text-secondary">
                {at ? formatSyncTime(at) : "Never"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
