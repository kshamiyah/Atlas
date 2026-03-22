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
    <section className="card p-4">
      <h2 className="mb-3 text-small font-semibold text-primary">
        Coverage summary
      </h2>
      {total === 0 ? (
        <p className="text-micro text-muted">
          No key skill suggestions available yet.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-subtle bg-surface-1 p-3">
            <dt className="text-[11px] text-muted">Total</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-primary">
              {total}
            </dd>
          </div>
          <div className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 p-3">
            <dt className="text-[11px] text-accent-blue">Confirmed</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-accent-blue">
              {confirmed}
            </dd>
          </div>
          <div className="rounded-xl border border-subtle bg-surface-1 p-3">
            <dt className="text-[11px] text-secondary">Rejected</dt>
            <dd className="mt-1 text-heading-3 font-semibold text-secondary">
              {rejected}
            </dd>
          </div>
          <div className="col-span-2 rounded-xl border border-subtle bg-surface-1 p-3">
            <dt className="text-[11px] text-secondary">
              Pending / Cross-CiP
            </dt>
            <dd className="mt-1 text-heading-3 font-semibold text-primary">
              {suggested}{" "}
              <span className="text-micro font-normal text-muted">
                ({crossPending} cross-CiP)
              </span>
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
