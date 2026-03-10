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

export function RecentEntriesSection({ entries }: RecentEntriesSectionProps) {
  if (entries.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          Recent entries
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          No entries synced yet. Sync the entries list from Kaizen (set to 100 per
          page) using the extension.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">
        Recent entries
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-left text-slate-400">
              <th className="pb-2 pr-2 font-medium">Date</th>
              <th className="pb-2 pr-2 font-medium">Type</th>
              <th className="pb-2 pr-2 font-medium">Title</th>
              <th className="pb-2 pr-2 font-medium">Category</th>
              <th className="pb-2 pr-2 font-medium">Year</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-b border-slate-800/80 text-slate-300"
              >
                <td className="py-1.5 pr-2">{e.kaizen_date || "—"}</td>
                <td className="py-1.5 pr-2">{e.assessment_type || "—"}</td>
                <td className="max-w-[180px] truncate py-1.5 pr-2" title={e.title}>
                  {e.title || "—"}
                </td>
                <td className="py-1.5 pr-2">{e.category || "—"}</td>
                <td className="py-1.5 pr-2">{e.training_year || "—"}</td>
                <td className="py-1.5">{e.status || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Showing up to 15 most recent entries.
      </p>
    </section>
  );
}
