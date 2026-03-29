"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  expandedByDefault?: boolean;
  /** Highlight matching skill rows (Progress deep-link). */
  highlightSkillId?: string | null;
  /** Highlight descriptor row + scroll into view when card is open. */
  highlightDescriptorId?: string | null;
  /** Open descriptor coverage `<details>` by default (e.g. descriptor deep-link). */
  descriptorPanelInitialOpen?: boolean;
  /** Focus-mode optimization: hide already reviewed suggestions. */
  suggestedOnly?: boolean;
};

const PRIMARY_VISIBLE_SUGGESTIONS = 3;
const STATUS_PRIORITY: Record<SkillSuggestion["status"], number> = {
  suggested: 0,
  confirmed: 1,
  rejected: 2,
};

type StructuredEntrySection = {
  title: string;
  paragraphs: string[];
};

const PARAGRAPH_STARTERS = [
  "Patient",
  "Compared",
  "My consultant",
  "Outpatient management",
  "The discussion reinforced",
  "I plan",
  "This discussion was invaluable",
  "I feel",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanEntryNarrative(rawText: string, title: string): string {
  let text = rawText.replace(/\s+/g, " ").trim();
  const cleanTitle = title.trim();
  if (!text || !cleanTitle) return text;

  const escapedTitle = escapeRegex(cleanTitle);
  const duplicatedTitlePrefix = new RegExp(
    `^${escapedTitle}\\s+Edit\\s+${escapedTitle}\\s*`,
    "i",
  );
  text = text.replace(duplicatedTitlePrefix, "");

  const singleTitlePrefix = new RegExp(`^${escapedTitle}\\s+`, "i");
  text = text.replace(singleTitlePrefix, "");

  return text.trim();
}

function sectionTitleForParagraph(paragraph: string): string {
  const p = paragraph.toLowerCase();
  if (
    p.includes("i plan") ||
    p.includes("further study") ||
    p.includes("guideline") ||
    p.includes("observe cases")
  ) {
    return "Learning plan";
  }
  if (
    p.includes("i feel") ||
    p.includes("invaluable") ||
    p.includes("reinforcing my understanding") ||
    p.includes("shared decision-making")
  ) {
    return "Reflection";
  }
  if (
    p.includes("inpatient") ||
    p.includes("outpatient") ||
    p.includes("monitoring") ||
    p.includes("discharged") ||
    p.includes("consultant") ||
    p.includes("individualised") ||
    p.includes("risk")
  ) {
    return "Decision-making and risk balance";
  }
  if (
    p.includes("patient") ||
    p.includes("diagnosed") ||
    p.includes("admitted") ||
    p.includes("commenced") ||
    p.includes("stabilised")
  ) {
    return "Clinical summary";
  }
  return "Entry notes";
}

function structureEntryNarrative(rawText: string, title: string): StructuredEntrySection[] {
  const cleaned = cleanEntryNarrative(rawText, title);
  if (!cleaned) return [];

  const starterPattern = new RegExp(
    `\\s+(?=(?:${PARAGRAPH_STARTERS.map(escapeRegex).join("|")}))`,
    "g",
  );
  const paragraphs = cleaned
    .replace(starterPattern, "\n\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: StructuredEntrySection[] = [];
  for (const paragraph of paragraphs) {
    const sectionTitle = sectionTitleForParagraph(paragraph);
    const previous = sections[sections.length - 1];
    if (previous && previous.title === sectionTitle) {
      previous.paragraphs.push(paragraph);
      continue;
    }
    sections.push({ title: sectionTitle, paragraphs: [paragraph] });
  }

  return sections;
}

function sortSuggestionsForReview(
  suggestions: SkillSuggestion[],
): SkillSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const statusDelta = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDelta !== 0) return statusDelta;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.key_skill_title.localeCompare(b.key_skill_title);
  });
}

function splitPrimarySuggestions(suggestions: SkillSuggestion[]) {
  const ordered = sortSuggestionsForReview(suggestions);
  return {
    primary: ordered.slice(0, PRIMARY_VISIBLE_SUGGESTIONS),
    overflow: ordered.slice(PRIMARY_VISIBLE_SUGGESTIONS),
  };
}

function StatusBadge({ status }: { status: SkillSuggestion["status"] }) {
  const labels: Record<SkillSuggestion["status"], string> = {
    suggested: "Pending",
    confirmed: "Confirmed",
    rejected: "Rejected",
  };
  const colours: Record<SkillSuggestion["status"], string> = {
    suggested: "bg-surface-3 text-secondary border-subtle",
    confirmed: "bg-surface-3 text-primary border-subtle",
    rejected: "bg-surface-3 text-muted border-subtle",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colours[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// Fix 8: Human-readable confidence labels with raw number on hover
function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const { label, colour } =
    value >= 0.8
      ? { label: "High", colour: "bg-surface-3 text-primary" }
      : value >= 0.7
        ? { label: "Medium", colour: "bg-surface-3 text-secondary" }
        : { label: "Low", colour: "bg-surface-3 text-muted" };

  return (
    <span
      title={`Confidence score: ${pct}%`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default ${colour}`}
    >
      {label} {pct}%
    </span>
  );
}

function SuggestionRow({
  suggestion,
  entryId,
  source,
  onUpdate,
  disabled: rowDisabled,
  isHighlighted,
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
  isHighlighted?: boolean;
}) {
  const actionId = suggestion.suggestion_id;
  const buttonDisabled = !actionId || rowDisabled;
  const showReset = suggestion.status !== "suggested";

  return (
    <li
      className={[
        "space-y-2 rounded-xl border bg-surface-1 p-3",
        isHighlighted ? "border-accent-blue ring-2 ring-accent-blue/35" : "border-subtle",
      ].join(" ")}
      data-key-skill-id={suggestion.key_skill_id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-primary">
            {suggestion.key_skill_title}
          </p>
          <p className="text-[11px] text-muted">
            CiP {suggestion.cip_number}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidencePill value={suggestion.confidence} />
          <StatusBadge status={suggestion.status} />
        </div>
      </div>
      {suggestion.rationale && (
        <p className="text-[11px] leading-relaxed text-secondary">
          {suggestion.rationale}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={buttonDisabled}
          onClick={() =>
            actionId && onUpdate(entryId, actionId, source, "confirmed")
          }
          className="inline-flex min-h-8 items-center rounded-lg border border-accent-blue/25 bg-surface-2 px-2.5 py-1 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={buttonDisabled}
          onClick={() =>
            actionId && onUpdate(entryId, actionId, source, "rejected")
          }
          className="inline-flex min-h-8 items-center rounded-lg border border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-3 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
        {showReset && (
          <button
            type="button"
            disabled={buttonDisabled}
            onClick={() =>
              actionId && onUpdate(entryId, actionId, source, "suggested")
            }
            className="text-[11px] font-medium text-muted underline-offset-2 transition hover:text-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Undo decision
          </button>
        )}
      </div>
    </li>
  );
}

function DescriptorCoveragePanel({
  coverage,
  highlightSkillId,
  highlightDescriptorId,
}: {
  coverage: KeySkillCoverage[];
  highlightSkillId?: string | null;
  highlightDescriptorId?: string | null;
}) {
  const nonEmpty = coverage.filter((ks) => ks.descriptors.length > 0);
  if (nonEmpty.length === 0) return null;

  const sortedSkills = [...nonEmpty].sort((a, b) => {
    const aGap = a.descriptors.filter((d) => !d.covered).length;
    const bGap = b.descriptors.filter((d) => !d.covered).length;
    if (bGap !== aGap) return bGap - aGap;
    return a.key_skill_title.localeCompare(b.key_skill_title);
  });
  const totalDescriptors = sortedSkills.reduce((acc, ks) => acc + ks.descriptors.length, 0);
  const coveredDescriptors = sortedSkills.reduce(
    (acc, ks) => acc + ks.descriptors.filter((d) => d.covered).length,
    0,
  );
  const fullyEvidencedSkills = sortedSkills.filter((ks) =>
    ks.descriptors.every((d) => d.covered),
  ).length;
  const topGaps = sortedSkills
    .map((ks) => ({
      title: ks.key_skill_title,
      missing: ks.descriptors.filter((d) => !d.covered).length,
    }))
    .filter((x) => x.missing > 0)
    .slice(0, 3);

  return (
    <section className="space-y-2.5">
      <div className="rounded-lg border border-subtle bg-surface-2 px-3 py-2.5">
        <p className="text-[11px] text-secondary">
          {coveredDescriptors}/{totalDescriptors} descriptors evidenced ·{" "}
          {fullyEvidencedSkills}/{sortedSkills.length} skills fully evidenced
        </p>
        {topGaps.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            Top gaps: {topGaps.map((x) => `${x.title} (${x.missing})`).join(" · ")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        {sortedSkills.map((ks) => {
          const coveredCount = ks.descriptors.filter((d) => d.covered).length;
          const total = ks.descriptors.length;
          const skillHighlighted = highlightSkillId != null && ks.key_skill_id === highlightSkillId;
          const hasHighlightedDescriptor =
            highlightDescriptorId != null &&
            ks.descriptors.some((d) => d.descriptor_id === highlightDescriptorId);
          const sortedDescriptors = [...ks.descriptors].sort((a, b) => {
            if (a.covered !== b.covered) return a.covered ? 1 : -1;
            return a.sort_order - b.sort_order;
          });
          return (
            <details
              key={ks.key_skill_id}
              className={[
                "rounded-lg border bg-surface-3 p-3",
                skillHighlighted ? "border-accent-blue/50 bg-surface-2" : "border-subtle bg-surface-3",
              ].join(" ")}
              open={skillHighlighted || hasHighlightedDescriptor ? true : undefined}
            >
              <summary className="cursor-pointer">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-primary">
                      {ks.key_skill_title}
                    </p>
                    <p className="text-[11px] text-muted">CiP {ks.cip_number}</p>
                  </div>
                  <span className="text-[11px] tabular-nums text-secondary">
                    {coveredCount}/{total}
                  </span>
                </div>
              </summary>
              <ul className="mt-2 space-y-1.5">
                {sortedDescriptors.map((d) => {
                  const descHi =
                    highlightDescriptorId != null && d.descriptor_id === highlightDescriptorId;
                  return (
                  <li
                    key={d.descriptor_id}
                    id={`ksr-desc-${d.descriptor_id}`}
                    className={[
                      "flex items-start gap-2 rounded-md",
                      descHi ? "bg-accent-blue/10 p-1.5 ring-1 ring-accent-blue/30" : "",
                    ].join(" ")}
                  >
                    <span
                      className={`mt-0.5 shrink-0 text-[11px] font-bold leading-none ${
                        d.covered ? "text-accent-blue" : "text-muted"
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
                              &ldquo;{d.evidence_quote}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </details>
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
  expandedByDefault = false,
  highlightSkillId = null,
  highlightDescriptorId = null,
  descriptorPanelInitialOpen = false,
  suggestedOnly = false,
}: ReviewCardProps) {
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [descriptorPanelOpen, setDescriptorPanelOpen] = useState(descriptorPanelInitialOpen);
  const scrolledDescriptor = useRef(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setDescriptorPanelOpen(descriptorPanelInitialOpen);
    });
    return () => window.cancelAnimationFrame(id);
  }, [descriptorPanelInitialOpen, entry.id]);

  useEffect(() => {
    scrolledDescriptor.current = false;
  }, [entry.id, highlightDescriptorId]);

  useEffect(() => {
    if (!isOpen || !highlightDescriptorId || scrolledDescriptor.current) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`ksr-desc-${highlightDescriptorId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      scrolledDescriptor.current = true;
    }, 120);
    return () => window.clearTimeout(t);
  }, [isOpen, highlightDescriptorId]);

  const hasCoverage =
    entry.descriptor_coverage != null && entry.descriptor_coverage.length > 0;

  const confirmedCount =
    entry.linked_cip_suggestions.filter((s) => s.status === "confirmed").length +
    entry.cross_cip_suggestions.filter((s) => s.status === "confirmed").length;
  const pendingCount =
    entry.linked_cip_suggestions.filter((s) => s.status === "suggested").length +
    entry.cross_cip_suggestions.filter((s) => s.status === "suggested").length;
  const visibleLinkedSuggestions = suggestedOnly
    ? entry.linked_cip_suggestions.filter((s) => s.status === "suggested")
    : entry.linked_cip_suggestions;
  const visibleCrossSuggestions = suggestedOnly
    ? entry.cross_cip_suggestions.filter((s) => s.status === "suggested")
    : entry.cross_cip_suggestions;
  const crossCipCount = visibleCrossSuggestions.length;
  const linkedSplit = splitPrimarySuggestions(visibleLinkedSuggestions);
  const crossSplit = splitPrimarySuggestions(visibleCrossSuggestions);
  const structuredEntrySections = useMemo(
    () => structureEntryNarrative(entry.raw_text, entry.title),
    [entry.raw_text, entry.title],
  );

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
    <article className="card card-interactive p-4 md:p-5">
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
            <span className="rounded-full bg-surface-4 px-2 py-0.5 text-micro font-medium text-secondary">
              ✓ {confirmedCount} confirmed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-surface-4 px-2 py-0.5 text-micro font-medium text-secondary">
              {pendingCount} pending
            </span>
          )}
          {crossCipCount > 0 && (
            <span className="rounded-full bg-surface-4 px-2 py-0.5 text-micro font-medium text-secondary">
              {crossCipCount} cross-CiP
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4 border-t border-subtle pt-3">
          <details className="rounded-xl border border-subtle bg-surface-1 p-3">
            <summary className="cursor-pointer text-micro font-medium text-secondary">
              View full entry text
            </summary>
            {structuredEntrySections.length === 0 ? (
              <p className="mt-2 text-micro leading-relaxed text-secondary">
                {entry.raw_text}
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {structuredEntrySections.map((section, index) => (
                  <section
                    key={`${section.title}-${index}`}
                    className="rounded-lg border border-subtle bg-surface-2 px-3 py-2.5"
                  >
                    <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {section.title}
                    </h5>
                    <div className="mt-1.5 space-y-1.5">
                      {section.paragraphs.map((paragraph, paragraphIndex) => (
                        <p
                          key={`${section.title}-${index}-${paragraphIndex}`}
                          className="text-micro leading-relaxed text-secondary"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </details>

          <section>
            <div className="mb-2">
              <h4 className="text-xs font-semibold text-primary">
                Linked suggestions
              </h4>
              {suggestedOnly && (
                <p className="text-[11px] text-muted">
                  Pending only in focus mode.
                </p>
              )}
            </div>
            {visibleLinkedSuggestions.length === 0 ? (
              <p className="text-micro italic text-muted">
                No linked suggestions.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {linkedSplit.primary.map((s) => (
                    <SuggestionRow
                      key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}`}
                      suggestion={s}
                      entryId={entry.id}
                      source="linked_cip"
                      onUpdate={onUpdateSuggestion}
                      disabled={disabled}
                      isHighlighted={highlightSkillId != null && s.key_skill_id === highlightSkillId}
                    />
                  ))}
                </ul>

                {linkedSplit.overflow.length > 0 && (
                  <details className="mt-2 rounded-xl border border-subtle bg-surface-2 p-3">
                    <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                      Show more linked suggestions ({linkedSplit.overflow.length})
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {linkedSplit.overflow.map((s) => (
                        <SuggestionRow
                          key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}-more`}
                          suggestion={s}
                          entryId={entry.id}
                          source="linked_cip"
                          onUpdate={onUpdateSuggestion}
                          disabled={disabled}
                          isHighlighted={highlightSkillId != null && s.key_skill_id === highlightSkillId}
                        />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>

          {crossCipCount > 0 && (
            <section className="rounded-xl border border-subtle bg-surface-1 p-3">
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-primary">
                  Additional opportunities
                </h4>
                <p className="text-[11px] text-muted">Cross-CiP suggestions.</p>
              </div>
              <ul className="space-y-1.5">
                {crossSplit.primary.map((s) => (
                  <SuggestionRow
                    key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}`}
                    suggestion={s}
                    entryId={entry.id}
                    source="cross_cip"
                    onUpdate={onUpdateSuggestion}
                    disabled={disabled}
                    isHighlighted={highlightSkillId != null && s.key_skill_id === highlightSkillId}
                  />
                ))}
              </ul>

              {crossSplit.overflow.length > 0 && (
                <details className="mt-2 rounded-xl border border-subtle bg-surface-2 p-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                    Show more cross-CiP suggestions ({crossSplit.overflow.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {crossSplit.overflow.map((s) => (
                      <SuggestionRow
                        key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}-cross-more`}
                        suggestion={s}
                        entryId={entry.id}
                        source="cross_cip"
                        onUpdate={onUpdateSuggestion}
                        disabled={disabled}
                        isHighlighted={highlightSkillId != null && s.key_skill_id === highlightSkillId}
                      />
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          {hasCoverage && (
            <details
              className="rounded-xl border border-subtle bg-surface-1 p-3"
              open={descriptorPanelOpen}
              onToggle={(e) => setDescriptorPanelOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-micro font-medium text-secondary">
                View coverage details
              </summary>
              <div className="mt-3">
                <DescriptorCoveragePanel
                  coverage={entry.descriptor_coverage!}
                  highlightSkillId={highlightSkillId}
                  highlightDescriptorId={highlightDescriptorId}
                />
              </div>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
