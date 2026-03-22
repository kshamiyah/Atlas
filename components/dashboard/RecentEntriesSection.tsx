type EntryRow = {
  id: string;
  kaizen_date: string;
  assessment_type: string;
  title: string;
  category: string;
  training_year: string;
  status: string;
  key_skills_count: number | null;
};

type RecentEntriesSectionProps = {
  entries: EntryRow[];
};

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  Complete: { color: "var(--accent-green)", bg: "rgba(22,163,74,0.10)" },
  "In progress": {
    color: "var(--accent-amber)",
    bg: "rgba(245,158,11,0.10)",
  },
  Draft: { color: "var(--text-muted)", bg: "var(--surface-3)" },
};

function statusStyle(status: string) {
  return (
    STATUS_STYLES[status] ?? {
      color: "var(--text-muted)",
      bg: "var(--surface-3)",
    }
  );
}

export function RecentEntriesSection({ entries }: RecentEntriesSectionProps) {
  if (entries.length === 0) {
    return (
      <section className="card p-6">
        <h2
          className="text-small font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          Recent entries
        </h2>
        <p className="mt-2 text-micro text-muted">
          No entries synced yet. Sync the entries list from Kaizen (set to 100
          per page) using the extension.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between border-b border-subtle pb-3">
        <h2
          className="text-small font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          Recent entries
        </h2>
        <span className="text-[11px] text-muted">Latest 15</span>
      </div>
      <ul className="space-y-2">
        {entries.map((e) => {
          const ss = statusStyle(e.status);
          return (
            <li
              key={e.id}
              className="flex flex-col gap-1.5 rounded-xl border border-subtle bg-surface-1 px-3 py-3 transition-colors hover:bg-surface-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "var(--surface-4)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {e.assessment_type || "—"}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {e.kaizen_date || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium text-primary"
                  title={e.title}
                >
                  {e.title || "—"}
                </span>
                {e.status && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: ss.bg, color: ss.color }}
                  >
                    {e.status}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        Showing up to 15 most recent entries.
      </p>
    </section>
  );
}
