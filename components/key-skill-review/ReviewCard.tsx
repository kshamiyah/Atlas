"use client";

import { useState } from "react";
import type {
  KeySkillCoverage,
  ReviewEntry,
  SkillSuggestion,
} from "@/lib/types/key-skill-review";

type ReviewCardProps = {
  entry: ReviewEntry;
  onUpdateSuggestion: (
    entryId: string,
    suggestionId: string,
    source: SkillSuggestion["source"],
    nextStatus: SkillSuggestion["status"],
  ) => void;
  disabled?: boolean;
};

function StatusBadge({ status }: { status: SkillSuggestion["status"] }) {
  const colours: Record<SkillSuggestion["status"], string> = {
    suggested: "bg-surface-4 text-secondary border-subtle",
    confirmed: "bg-accent-green/15 text-accent-green border-accent-green/40",
    rejected: "bg-accent-red/10 text-accent-red border-accent-red/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colours[status]}`}
    >
      {status}
    </span>
  );
}

// Fix 8: Human-readable confidence labels with raw number on hover
function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const { label, colour } =
    value >= 0.8
      ? { label: "High confidence", colour: "bg-accent-green/20 text-accent-green" }
      : value >= 0.7
        ? { label: "Medium confidence", colour: "bg-accent-amber/20 text-accent-amber" }
        : { label: "Low confidence", colour: "bg-surface-4 text-muted" };

  return (
    <span
      title={`Confidence score: ${pct}%`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default ${colour}`}
    >
      {label}
    </span>
  );
}

function SuggestionRow({
  suggestion,
  entryId,
  source,
  onUpdate,
  disabled: rowDisabled,
}: {
  suggestion: SkillSuggestion;
  entryId: string;
  source: SkillSuggestion["source"];
  onUpdate: (
    entryId: string,
    suggestionId: string,
    source: SkillSuggestion["source"],
    nextStatus: SkillSuggestion["status"],
  ) => void;
  disabled?: boolean;
}) {
  const actionId = suggestion.suggestion_id;
  const buttonDisabled = !actionId || rowDisabled;

  return (
    <li className="rounded-lg border border-subtle bg-surface-3 p-3 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-primary">
            {suggestion.key_skill_title}
          </p>
          <p className="text-[11px] text-muted">
            CiP {suggestion.cip_number} · {suggestion.key_skill_id}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidencePill value={suggestion.confidence} />
          <StatusBadge status={suggestion.status} />
        </div>
      </div>
      {suggestion.rationale && (
        <p className="text-[11px] leading-snug text-secondary">
          {suggestion.rationale}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1.5">
        <button
          type="button"
          disabled={buttonDisabled}
          onClick={() =>
            actionId && onUpdate(entryId, actionId, source, "confirmed")
          }
          className="inline-flex items-center rounded-md bg-accent-green/15 px-2.5 py-1 text-[11px] font-medium text-accent-green ring-1 ring-accent-green/40 transition hover:bg-accent-green/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={buttonDisabled}
          onClick={() =>
            actionId && onUpdate(entryId, actionId, source, "rejected")
          }
          className="inline-flex items-center rounded-md bg-accent-red/10 px-2.5 py-1 text-[11px] font-medium text-accent-red ring-1 ring-accent-red/40 transition hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={buttonDisabled}
          onClick={() =>
            actionId && onUpdate(entryId, actionId, source, "suggested")
          }
          className="inline-flex items-center rounded-md bg-surface-4 px-2.5 py-1 text-[11px] font-medium text-secondary ring-1 ring-subtle transition hover:bg-surface-5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </li>
  );
}

function DescriptorCoveragePanel({ coverage }: { coverage: KeySkillCoverage[] }) {
  const nonEmpty = coverage.filter((ks) => ks.descriptors.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-primary">
        Descriptor coverage
      </h4>
      <div className="space-y-2">
        {nonEmpty.map((ks) => {
          const coveredCount = ks.descriptors.filter((d) => d.covered).length;
          const total = ks.descriptors.length;
          return (
            <div
              key={ks.key_skill_id}
              className="rounded-lg border border-subtle bg-surface-3 p-3 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-primary">
                    {ks.key_skill_title}
                  </p>
                  <p className="text-[11px] text-muted">CiP {ks.cip_number}</p>
                </div>
                <span className="text-[11px] tabular-nums text-secondary">
                  {coveredCount}/{total} descriptors evidenced
                </span>
              </div>
              <ul className="space-y-1.5">
                {ks.descriptors.map((d) => (
                  <li key={d.descriptor_id} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 text-[11px] font-bold leading-none ${
                        d.covered ? "text-accent-green" : "text-muted"
                      }`}
                    >
                      {d.covered ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p
                        className={`text-[11px] leading-snug ${
                          d.covered ? "text-primary" : "text-muted"
                        }`}
                      >
                        {d.descriptor_text}
                      </p>
                      {d.covered && (
                        <div className="flex flex-wrap items-center gap-2">
                          {d.confidence > 0 && (
                            <span className="text-[10px] tabular-nums text-muted">
                              {Math.round(d.confidence * 100)}%
                            </span>
                          )}
                          {d.evidence_quote && (
                            <span className="text-[10px] italic leading-snug text-muted line-clamp-1">
                              "{d.evidence_quote}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export function ReviewCard({
  entry,
  onUpdateSuggestion,
  disabled,
}: ReviewCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Fix 7: progressive disclosure states
  const [showEntryText, setShowEntryText] = useState(false);
  const [showCrossCip, setShowCrossCip] = useState(false);

  const hasCoverage =
    entry.descriptor_coverage != null && entry.descriptor_coverage.length > 0;

  const confirmedCount =
    entry.linked_cip_suggestions.filter((s) => s.status === "confirmed").length +
    entry.cross_cip_suggestions.filter((s) => s.status === "confirmed").length;
  const pendingCount =
    entry.linked_cip_suggestions.filter((s) => s.status === "suggested").length +
    entry.cross_cip_suggestions.filter((s) => s.status === "suggested").length;
  const crossCipCount = entry.cross_cip_suggestions.length;

  const metaLine =
    entry.linked_cip_number === 0 ? (
      <>
        {entry.entry_type}
        {" · "}
        <span className="italic">No linked CiP</span>
        {" · "}
        {entry.date}
      </>
    ) : (
      <>
        {entry.entry_type} · CiP {entry.linked_cip_number} · {entry.date}
      </>
    );

  return (
    <article className="card card-interactive p-4">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left space-y-2"
      >
        {/* Row 1 — title + chevron */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-small font-semibold text-primary">
            {entry.title}
          </h3>
          <ChevronIcon open={isOpen} />
        </div>
        {/* Row 2 — meta */}
        <p className="text-micro text-muted">{metaLine}</p>
        {/* Row 3 — status pills */}
        <div className="flex flex-wrap gap-1.5">
          {confirmedCount > 0 && (
            <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-micro font-medium text-accent-green">
              ✓ {confirmedCount} confirmed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-surface-4 px-2 py-0.5 text-micro font-medium text-secondary">
              {pendingCount} pending
            </span>
          )}
          {crossCipCount > 0 && (
            <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-micro font-medium text-accent-purple">
              {crossCipCount} cross-CiP
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-3 border-t border-subtle pt-3 space-y-4">

          {/* Fix 7: Collapsible entry text */}
          <div>
            <button
              type="button"
              onClick={() => setShowEntryText((v) => !v)}
              className="flex items-center gap-1.5 text-micro font-medium text-muted hover:text-secondary transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-200 ${showEntryText ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {showEntryText ? "Hide entry text" : "View entry text"}
            </button>
            {showEntryText && (
              <div className="mt-2 rounded-lg bg-surface-3 p-3">
                <p className="text-micro leading-relaxed text-secondary">
                  {entry.raw_text}
                </p>
              </div>
            )}
          </div>

          {/* Linked CiP suggestions — always visible */}
          <section>
            <h4 className="mb-2 text-micro font-semibold uppercase tracking-wide text-muted">
              Linked CiP suggestions
            </h4>
            {entry.linked_cip_suggestions.length === 0 ? (
              <p className="text-micro italic text-muted">
                No linked CiP matches.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {entry.linked_cip_suggestions.map((s) => (
                  <SuggestionRow
                    key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}`}
                    suggestion={s}
                    entryId={entry.id}
                    source="linked_cip"
                    onUpdate={onUpdateSuggestion}
                    disabled={disabled}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Fix 7: Cross-CiP behind a secondary toggle */}
          {crossCipCount > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowCrossCip((v) => !v)}
                className="flex items-center gap-1.5 text-micro font-medium text-accent-purple hover:underline"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showCrossCip ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {showCrossCip ? "Hide" : "Show"} {crossCipCount} cross-CiP suggestion{crossCipCount !== 1 ? "s" : ""}
              </button>
              {showCrossCip && (
                <ul className="mt-2 space-y-1.5">
                  {entry.cross_cip_suggestions.map((s) => (
                    <SuggestionRow
                      key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}`}
                      suggestion={s}
                      entryId={entry.id}
                      source="cross_cip"
                      onUpdate={onUpdateSuggestion}
                      disabled={disabled}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {hasCoverage && (
            <DescriptorCoveragePanel coverage={entry.descriptor_coverage!} />
          )}
        </div>
      )}
    </article>
  );
}
