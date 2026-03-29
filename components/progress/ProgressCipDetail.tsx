"use client";

import Link from "next/link";
import type { ProgressCipRow, ProgressRagStatus } from "@/lib/types/progress";

function statusLabel(status: ProgressRagStatus, checkpointType: ProgressCipRow["checkpoint_type"]): string {
  if (status === "green") return "On track";
  if (status === "amber") return checkpointType === "annual" ? "Near trajectory" : "Needs work";
  return checkpointType === "annual" ? "Off trajectory" : "At risk";
}

type ProgressCipDetailProps = {
  row: ProgressCipRow;
};

export function ProgressCipDetail({ row }: ProgressCipDetailProps) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          CiP {row.cip_number} · {statusLabel(row.status, row.checkpoint_type)}
        </p>
        <h3 className="mt-1 text-small font-semibold leading-snug text-primary">
          {row.cip_title}
        </h3>
        <p className="mt-1 text-[11px] text-secondary">
          {row.status_reason}
        </p>
        {row.expected_key_skills_by_now !== null && row.checkpoint_type === "annual" && (
          <p className="mt-1 text-[11px] text-muted">
            Expected key skills by now: {row.expected_key_skills_by_now}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-micro text-secondary">
          <span>
            <span className="text-muted">Entries in scope</span>{" "}
            <span className="font-semibold tabular-nums text-primary">{row.entries_count}</span>
          </span>
          <span>
            <span className="text-muted">Last activity</span>{" "}
            <span className="font-semibold text-primary">
              {row.last_entry_date ?? "—"}
            </span>
          </span>
        </div>
      </header>

      <section>
        <h4 className="text-micro font-semibold text-primary">Coverage</h4>
        <p className="mt-1 text-[11px] text-secondary">
          Key skills {row.key_skills.covered}/{row.key_skills.total} ({row.key_skills.pct}%) ·
          Descriptors {row.descriptors.covered}/{row.descriptors.total} ({row.descriptors.pct}%)
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Missing {row.missing_key_skills} key skill{row.missing_key_skills === 1 ? "" : "s"},{" "}
          {row.missing_descriptors} descriptor{row.missing_descriptors === 1 ? "" : "s"}.
        </p>
      </section>

      {row.gap_key_skills.length > 0 && (
        <section>
          <h4 className="text-micro font-semibold text-primary">Unconfirmed key skills</h4>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px] text-secondary">
            {row.gap_key_skills.map((ks) => (
              <li key={ks.key_skill_id} className="rounded-md bg-surface-3/60 px-2 py-1">
                <span className="font-medium text-muted">#{ks.skill_number}</span> {ks.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {row.gap_descriptors.length > 0 && (
        <section>
          <h4 className="text-micro font-semibold text-primary">Uncovered descriptors</h4>
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-[11px] leading-snug text-secondary">
            {row.gap_descriptors.map((d) => (
              <li key={d.descriptor_id} className="rounded-md bg-surface-3/60 px-2 py-1.5">
                {d.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="text-micro font-semibold text-primary">Top contributing entries</h4>
        {row.top_entries.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted">No entries in this scope for this CiP.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {row.top_entries.map((e) => (
              <li key={e.review_entry_id}>
                <Link
                  href="/dashboard/key-skill-review"
                  className="block rounded-lg border border-subtle bg-surface-1/80 px-3 py-2 text-left text-[11px] transition-colors hover:border-accent-primary/40 hover:bg-surface-2"
                >
                  <span className="font-medium text-primary">{e.title}</span>
                  <span className="mt-0.5 block text-muted">
                    {e.event_date ?? "No event date"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
