import type { ReviewEntry } from "@/lib/types/key-skill-review";

type CoverageSummaryProps = {
  entries: ReviewEntry[];
};

export function CoverageSummary({ entries }: CoverageSummaryProps) {
  const allSuggestions = entries.flatMap((e) => [
    ...e.linked_cip_suggestions,
    ...e.cross_cip_suggestions,
  ]);

  const total = allSuggestions.length;
  const confirmed = allSuggestions.filter((s) => s.status === "confirmed").length;
  const rejected = allSuggestions.filter((s) => s.status === "rejected").length;
  const suggested = allSuggestions.filter((s) => s.status === "suggested").length;
  const crossPending = entries
    .flatMap((e) => e.cross_cip_suggestions)
    .filter((s) => s.status === "suggested").length;

  return (
    <section className="rounded-lg border border-subtle bg-surface-2 p-4">
      <h2 className="text-small font-semibold text-primary mb-3">
        Coverage summary
      </h2>
      {total === 0 ? (
        <p className="text-micro text-muted">
          No key skill suggestions available yet.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-surface-1 p-3">
            <dt className="text-micro text-muted">Total suggestions</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-primary">
              {total}
            </dd>
          </div>
          <div className="rounded-lg bg-accent-green/10 p-3">
            <dt className="text-micro text-accent-green">Confirmed</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-accent-green">
              {confirmed}
            </dd>
          </div>
          <div className="rounded-lg bg-accent-red/10 p-3">
            <dt className="text-micro text-accent-red">Rejected</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-accent-red">
              {rejected}
            </dd>
          </div>
          <div className="rounded-lg bg-accent-amber/10 p-3 sm:col-span-1 col-span-2">
            <dt className="text-micro text-accent-amber">
              Suggested pending / cross-CiP pending
            </dt>
            <dd className="mt-1 text-heading-3 font-semibold text-accent-amber">
              {suggested}{" "}
              <span className="text-micro font-normal text-accent-amber/70">
                ({crossPending} cross-CiP)
              </span>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
