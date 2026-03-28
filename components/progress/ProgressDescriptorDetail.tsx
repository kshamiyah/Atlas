"use client";

import Link from "next/link";
import type { ProgressDescriptorCipGroup, ProgressDescriptorRow } from "@/lib/types/progress";

type ProgressDescriptorDetailProps = {
  cip: ProgressDescriptorCipGroup;
  skillTitle: string;
  skillNumber: number;
  row: ProgressDescriptorRow;
  reviewHref: string;
};

export function ProgressDescriptorDetail({
  cip,
  skillTitle,
  skillNumber,
  row,
  reviewHref,
}: ProgressDescriptorDetailProps) {
  const confLabel =
    row.confidence != null && Number.isFinite(row.confidence)
      ? `${Math.round(Number(row.confidence) * 100)}%`
      : "—";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          CiP {cip.cip_number} · Skill #{skillNumber}
        </p>
        <h3 className="mt-1 text-small font-semibold text-primary">{skillTitle}</h3>
        <p className="mt-2 text-micro leading-relaxed text-secondary">{row.text}</p>
        <p className="mt-2 text-[11px] text-muted">
          Status:{" "}
          <span className={row.covered ? "font-medium text-accent-green" : "font-medium text-accent-amber"}>
            {row.covered ? "Covered" : "Uncovered"}
          </span>
          {row.covered && (
            <>
              <span className="mx-1 opacity-40">·</span>
              Confidence {confLabel}
              <span className="mx-1 opacity-40">·</span>
              {row.supporting_entry_count} supporting entr
              {row.supporting_entry_count === 1 ? "y" : "ies"}
            </>
          )}
        </p>
        {row.latest_activity_date && (
          <p className="mt-1 text-[11px] text-muted">
            Latest activity: <span className="text-secondary">{row.latest_activity_date}</span>
          </p>
        )}
      </header>

      {row.evidence_quote && (
        <section>
          <h4 className="text-micro font-semibold text-primary">Evidence quote</h4>
          <blockquote className="mt-2 rounded-lg border border-subtle bg-surface-3/40 p-3 text-[11px] italic leading-relaxed text-secondary">
            {row.evidence_quote}
          </blockquote>
        </section>
      )}

      {row.covered && row.supporting_entries.length > 0 && (
        <section>
          <h4 className="text-micro font-semibold text-primary">Supporting entries</h4>
          <ul className="mt-2 space-y-2">
            {row.supporting_entries.map((e) => (
              <li key={e.review_entry_id}>
                <Link
                  href="/dashboard/key-skill-review"
                  className="block rounded-lg border border-subtle bg-surface-1/80 px-3 py-2 text-left text-[11px] transition-colors hover:border-accent-primary/40 hover:bg-surface-2"
                >
                  <span className="font-medium text-primary">{e.title}</span>
                  <span className="mt-0.5 block text-muted">{e.event_date ?? "No event date"}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={reviewHref}
            className="mt-3 inline-block text-[11px] font-medium text-accent-primary underline-offset-2 hover:underline"
          >
            Open supporting entries in My Entries
          </Link>
        </section>
      )}

      {!row.covered && (
        <div>
          <Link
            href={reviewHref}
            className="inline-flex rounded-lg border border-accent-primary bg-accent-primary px-4 py-2 text-micro font-semibold text-surface-1 transition-opacity hover:opacity-90"
          >
            Review in My Entries
          </Link>
        </div>
      )}
    </div>
  );
}
