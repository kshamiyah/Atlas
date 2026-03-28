"use client";

import Link from "next/link";
import type { ProgressKeySkillGroup, ProgressKeySkillRow } from "@/lib/types/progress";

type ProgressKeySkillDetailProps = {
  group: ProgressKeySkillGroup;
  skill: ProgressKeySkillRow;
  reviewHref: string;
};

export function ProgressKeySkillDetail({
  group,
  skill,
  reviewHref,
}: ProgressKeySkillDetailProps) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          CiP {group.cip_number} · Key skill #{skill.skill_number}
        </p>
        <h3 className="mt-1 text-small font-semibold leading-snug text-primary">{skill.title}</h3>
        <p className="mt-2 text-micro text-secondary">
          {skill.is_confirmed ? (
            <>
              Confirmed from{" "}
              <span className="font-semibold tabular-nums text-primary">
                {skill.confirmed_entry_count}
              </span>{" "}
              scoped entr{skill.confirmed_entry_count === 1 ? "y" : "ies"}.
            </>
          ) : (
            "No confirmed evidence in this scope yet."
          )}
        </p>
      </header>

      <section>
        <h4 className="text-micro font-semibold text-primary">Descriptor evidence</h4>
        <p className="mt-1 text-[11px] text-secondary">
          {skill.descriptor_coverage.covered}/{skill.descriptor_coverage.total} covered (
          {skill.descriptor_coverage.pct}%)
        </p>
        <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-[11px] leading-snug">
          {skill.descriptor_items.map((d) => (
            <li
              key={d.descriptor_id}
              className={[
                "rounded-md px-2 py-1.5",
                d.covered ? "bg-accent-green/10 text-secondary" : "bg-surface-3/70 text-muted",
              ].join(" ")}
            >
              {d.covered ? "✓ " : "○ "}
              {d.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-micro font-semibold text-primary">Supporting entries</h4>
        {skill.top_entries.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted">
            No confirming entries in scope for this skill.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {skill.top_entries.map((e) => (
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
        )}
      </section>

      {!skill.is_confirmed && (
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
