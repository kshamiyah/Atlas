"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeySkillCoverage,
  ReviewEntry,
  SkillSuggestion,
} from "@/lib/types/key-skill-review";
import type {
  AuditEntryResult,
  AuditFinding,
  AuditCandidateRecommendation,
  AuditLinkedSkillQuality,
  AuditLinkPlanSkill,
} from "@/lib/types/audit-entry-result";
import type { AuditReviewDecisionBody } from "@/lib/types/key-skill-review-api";
import {
  buildCurrentAuditDecisionMap,
  findLatestPriorDecision,
} from "@/lib/key-skill-review/audit-review-decisions";

type ReviewCardProps = {
  entry: ReviewEntry;
  onUpdateSuggestion: (
    entryId: string,
    suggestionId: string,
    source: SkillSuggestion["source"],
    nextStatus: SkillSuggestion["status"],
  ) => void | Promise<void>;
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
  auditResult?: AuditEntryResult;
  onApplyAuditRecommendation?: (
    entryId: string,
    recommendation: AuditCandidateRecommendation,
  ) => Promise<void> | void;
  onRecordAuditReviewDecision?: (
    body: AuditReviewDecisionBody,
  ) => Promise<void> | void;
  pendingRemovalCount?: number;
  onUnlinkKaizenSkill?: (
    entryId: string,
    keySkillId: string,
    kaizenSkillId: string,
    keySkillTitle: string,
  ) => Promise<void> | void;
};

const STATUS_PRIORITY: Record<SkillSuggestion["status"], number> = {
  suggested: 0,
  confirmed: 1,
  rejected: 2,
};

type StructuredEntrySection = {
  title: string;
  paragraphs: string[];
};

type RebalanceRecommendationRow = {
  rowKey: string;
  action: "remove" | "replace";
  keySkillId: string;
  replaceSkillId?: string | null;
  title: string;
  subtitle?: string;
  rationale: string;
  confidence: number | null;
  recommendation: AuditCandidateRecommendation | null;
  canKeepPersistently: boolean;
  priorDecisionNote?: string | null;
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
  const editTitlePrefix = new RegExp(`^Edit\\s+${escapedTitle}\\s*`, "i");
  const duplicatedTitlePrefix = new RegExp(
    `^${escapedTitle}\\s+Edit\\s+${escapedTitle}\\s*`,
    "i",
  );
  text = text.replace(editTitlePrefix, "");
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

function sortSuggestionsForReview<T extends SkillSuggestion>(
  suggestions: T[],
): T[] {
  return [...suggestions].sort((a, b) => {
    const statusDelta = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDelta !== 0) return statusDelta;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.key_skill_title.localeCompare(b.key_skill_title);
  });
}

function findSuggestionForSkill(
  entry: ReviewEntry,
  keySkillId: string | null | undefined,
): SkillSuggestion | null {
  if (!keySkillId) return null;
  const all = [
    ...entry.linked_cip_suggestions.map((s) => ({ ...s, source: "linked_cip" as const })),
    ...entry.cross_cip_suggestions.map((s) => ({ ...s, source: "cross_cip" as const })),
  ]
    .filter(
      (s) =>
        s.key_skill_id === keySkillId &&
        typeof s.suggestion_id === "string" &&
        s.suggestion_id.length > 0,
    )
    .sort((a, b) => {
      const statusRank = (status: typeof a.status) =>
        status === "suggested" ? 0 : status === "confirmed" ? 1 : 2;
      const byStatus = statusRank(a.status) - statusRank(b.status);
      if (byStatus !== 0) return byStatus;
      const sourceRank = (value: typeof a.source) => (value === "linked_cip" ? 0 : 1);
      const bySource = sourceRank(a.source) - sourceRank(b.source);
      if (bySource !== 0) return bySource;
      return b.confidence - a.confidence;
    });

  return all[0] ?? null;
}

function StatusBadge({ status }: { status: SkillSuggestion["status"] }) {
  const labels: Record<SkillSuggestion["status"], string> = {
    suggested: "Pending",
    confirmed: "Confirmed",
    rejected: "Rejected",
  };
  const colours: Record<SkillSuggestion["status"], string> = {
    suggested: "bg-surface-3 text-secondary border-subtle",
    confirmed: "border-accent-blue/35 bg-accent-blue/12 text-accent-blue",
    rejected: "border-subtle bg-surface-2 text-muted opacity-85",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colours[status]}`}
    >
      {status === "rejected" ? <span className="line-through">{labels[status]}</span> : labels[status]}
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

function formatEvidencePercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function canSurfaceAdditionalLinks(auditResult: AuditEntryResult | undefined): boolean {
  if (!auditResult) return true;
  if (auditResult.overlinked === true) return false;
  return Number(auditResult.slots_remaining ?? 0) > 0;
}

function isUnscorableQuality(item: AuditLinkedSkillQuality): boolean {
  return Number(item.total_descriptors ?? 0) <= 0;
}

function qualitySortRank(item: AuditLinkedSkillQuality): number {
  if (isUnscorableQuality(item)) return 2;
  if (item.verdict === "weak") return 0;
  if (item.verdict === "moderate") return 1;
  return 1;
}

function findingSummaryLine(finding: AuditFinding): string {
  if (finding.type === "replace") {
    const oldSkill = finding.replace_skill_title || finding.replace_skill_id;
    return `Replace "${oldSkill}" with "${finding.key_skill_title}" (${Math.round(
      finding.confidence * 100,
    )}%)`;
  }
  if (finding.type === "remove") {
    return `Remove "${finding.key_skill_title}" (${Math.round(
      finding.confidence * 100,
    )}%)`;
  }
  if (finding.type === "add") {
    return `Add "${finding.key_skill_title}" (${Math.round(
      finding.confidence * 100,
    )}%)`;
  }
  if (finding.type === "flag") {
    return `Flag "${finding.key_skill_title}" (${formatEvidencePercent(
      finding.evidence_score,
    )} evidenced)`;
  }
  if (finding.type === "overlinked") {
    return `Overlinked by ${finding.overlinked_by} (target ${finding.effective_target})`;
  }
  return finding.rationale;
}

function qualityLine(item: AuditLinkedSkillQuality): string {
  if (isUnscorableQuality(item)) {
    return `${item.key_skill_title}: Unscorable (no descriptors configured)`;
  }
  return `${item.key_skill_title}: ${formatEvidencePercent(
    item.evidence_score,
  )} (${item.covered_descriptors_count}/${item.total_descriptors}) ${item.verdict}`;
}

function warningSummaryLabel(warning: string): string {
  const normalized = warning.trim().toLowerCase();
  if (normalized === "descriptor_analysis_failed") {
    return "Descriptor analysis did not complete";
  }
  if (normalized === "candidate_analysis_failed") {
    return "Candidate analysis did not complete";
  }
  if (normalized === "plan_review_failed") {
    return "Final plan review did not complete";
  }
  return warning
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  ) => void | Promise<void>;
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
  auditResult,
  onApplyAuditRecommendation,
  onRecordAuditReviewDecision,
  pendingRemovalCount = 0,
  onUnlinkKaizenSkill,
}: ReviewCardProps) {
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [descriptorPanelOpen, setDescriptorPanelOpen] = useState(descriptorPanelInitialOpen);
  const [pendingAuditActionKey, setPendingAuditActionKey] = useState<string | null>(null);
  const [stripDismissed, setStripDismissed] = useState(false);
  const [pendingKeepCurrent, setPendingKeepCurrent] = useState(false);
  const [pendingUnlinkSkillId, setPendingUnlinkSkillId] = useState<string | null>(null);
  const [reviewedRebalanceRows, setReviewedRebalanceRows] = useState<
    Record<string, "acted" | "kept" | "dismissed">
  >({});
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
    setStripDismissed(false);
    setPendingKeepCurrent(false);
    setReviewedRebalanceRows({});
  }, [
    entry.id,
    auditResult?.review_entry_id,
    auditResult?.primary_finding?.type,
    auditResult?.overlinked_by,
    auditResult?.audit_link_plan?.summary,
  ]);

  const currentAuditDecisionMap = useMemo(
    () =>
      buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        auditResult?.audit_input_fingerprint ?? null,
      ),
    [auditResult?.audit_input_fingerprint, entry.audit_review_decisions],
  );

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
  const crossCipCount = entry.cross_cip_suggestions.length;
  const allSuggestionsWithSource = sortSuggestionsForReview([
    ...entry.linked_cip_suggestions.map((s) => ({
      ...s,
      source: "linked_cip" as SkillSuggestion["source"],
    })),
    ...entry.cross_cip_suggestions.map((s) => ({
      ...s,
      source: "cross_cip" as SkillSuggestion["source"],
    })),
  ]);
  const decisionPendingSuggestions = allSuggestionsWithSource.filter(
    (s) => s.status === "suggested",
  );
  const surfacedAdditionalLinks = canSurfaceAdditionalLinks(auditResult)
    ? decisionPendingSuggestions
    : [];
  const pendingCount = surfacedAdditionalLinks.length;
  const crossCipPendingCount = surfacedAdditionalLinks.filter(
    (s) => s.source === "cross_cip",
  ).length;
  const decisionConfirmedSuggestions = allSuggestionsWithSource.filter(
    (s) => s.status === "confirmed",
  );
  const decisionRejectedSuggestions = allSuggestionsWithSource.filter(
    (s) => s.status === "rejected",
  );
  const structuredEntrySections = useMemo(
    () => structureEntryNarrative(entry.raw_text, entry.title),
    [entry.raw_text, entry.title],
  );
  const cleanedNarrative = useMemo(
    () => cleanEntryNarrative(entry.raw_text, entry.title),
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

  const auditBadgeLabel =
    auditResult?.overlinked === true
      ? `Overlinked (+${Math.max(0, Number(auditResult.overlinked_by ?? 0))})`
      : auditResult?.primary_finding?.type &&
          auditResult.primary_finding.type !== "ok"
        ? auditResult.primary_finding.type === "replace"
          ? "Replace"
          : auditResult.primary_finding.type === "remove"
            ? "Remove"
          : auditResult.primary_finding.type === "add"
            ? "Add"
            : auditResult.primary_finding.type === "flag"
              ? "Flag"
              : null
        : null;
  const auditBadgeClass =
    auditResult?.overlinked === true
      ? "border-amber-400/40 bg-amber-400/15 text-amber-700"
      : auditResult?.primary_finding?.type === "replace"
        ? "border-accent-blue/35 bg-accent-blue/10 text-accent-blue"
        : auditResult?.primary_finding?.type === "remove"
          ? "border-rose-300/45 bg-rose-300/12 text-rose-700"
        : auditResult?.primary_finding?.type === "add"
          ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-700"
          : auditResult?.primary_finding?.type === "flag"
            ? "border-amber-300/45 bg-amber-300/14 text-amber-700"
            : "border-subtle bg-surface-3 text-secondary";
  const hasAuditWarning =
    Array.isArray(auditResult?.audit_warning) && auditResult.audit_warning.length > 0;
  const auditFindings = Array.isArray(auditResult?.audit_findings)
    ? auditResult.audit_findings
    : [];
  const removeFindingCount = auditFindings.filter((finding) => finding.type === "remove").length;
  const replaceFindingCount = auditFindings.filter((finding) => finding.type === "replace").length;
  const addFindingCount = auditFindings.filter((finding) => finding.type === "add").length;
  const candidateRecommendations = useMemo(
    () =>
      Array.isArray(auditResult?.candidate_recommendations)
        ? auditResult.candidate_recommendations
        : [],
    [auditResult?.candidate_recommendations],
  );
  const linkedSkillQuality = useMemo(
    () =>
      Array.isArray(auditResult?.current_linked_skill_quality)
        ? auditResult.current_linked_skill_quality
        : [],
    [auditResult?.current_linked_skill_quality],
  );
  const warningDetails = Array.isArray(auditResult?.audit_warning_details)
    ? auditResult.audit_warning_details
    : [];
  const auditLinkPlan = auditResult?.audit_link_plan ?? null;
  const unresolvedLinkedSkills = Array.isArray(auditResult?.unresolved_linked_skills)
    ? auditResult.unresolved_linked_skills
    : [];
  const kaizenLinkedSkills = Array.isArray(entry.kaizen_linked_skills)
    ? entry.kaizen_linked_skills
    : Array.isArray(auditResult?.current_linked_skills)
      ? auditResult.current_linked_skills
      : [];
  const kaizenLinkedRaw = Array.isArray(auditResult?.linked_key_skills_parsed)
    ? auditResult.linked_key_skills_parsed
    : [];
  const hasAuditData = auditResult != null;
  const sortedQuality = useMemo(
    () =>
      [...linkedSkillQuality].sort((a, b) => {
        const rankDelta = qualitySortRank(a) - qualitySortRank(b);
        if (rankDelta !== 0) return rankDelta;
        if (!isUnscorableQuality(a) && !isUnscorableQuality(b)) {
          if (a.evidence_score !== b.evidence_score) {
            return a.evidence_score - b.evidence_score;
          }
        }
        return a.key_skill_title.localeCompare(b.key_skill_title);
      }),
    [linkedSkillQuality],
  );
  const scorableQualityCount = sortedQuality.filter((item) => !isUnscorableQuality(item)).length;
  const unscorableQualityCount = sortedQuality.length - scorableQualityCount;
  const primaryActionRecommendation = useMemo(() => {
    const actionable = candidateRecommendations.filter(
      (candidate) =>
        candidate.action === "replace" ||
        candidate.action === "remove" ||
        candidate.action === "add",
    );
    if (actionable.length === 0) return null;
    const sorted = [...actionable].sort((a, b) => {
      const actionRank = (value: "add" | "replace" | "remove") =>
        value === "remove" ? 0 : value === "replace" ? 1 : 2;
      const rankDelta = actionRank(a.action) - actionRank(b.action);
      if (rankDelta !== 0) return rankDelta;
      return b.confidence - a.confidence;
    });
    return sorted[0] ?? null;
  }, [candidateRecommendations]);
  const additionalActionRecommendations = useMemo(() => {
    if (!primaryActionRecommendation) return [];
    let removedPrimary = false;
    return candidateRecommendations.filter((candidate) => {
      const isPrimary =
        !removedPrimary &&
        candidate.key_skill_id === primaryActionRecommendation.key_skill_id &&
        candidate.action === primaryActionRecommendation.action &&
        candidate.replace_skill_id === primaryActionRecommendation.replace_skill_id;
      if (isPrimary) {
        removedPrimary = true;
        return false;
      }
      return true;
    });
  }, [candidateRecommendations, primaryActionRecommendation]);
  const recommendedRemovals = useMemo(() => {
    return candidateRecommendations
      .filter((candidate) => candidate.action === "remove")
      .sort((a, b) => b.confidence - a.confidence);
  }, [candidateRecommendations]);
  const plannedKeeps = useMemo(
    () =>
      (auditLinkPlan?.skills ?? []).filter(
        (skill): skill is AuditLinkPlanSkill => skill.decision === "keep",
      ),
    [auditLinkPlan],
  );
  const plannedRemovals = useMemo(
    () =>
      (auditLinkPlan?.skills ?? []).filter(
        (skill): skill is AuditLinkPlanSkill => skill.decision === "remove",
      ),
    [auditLinkPlan],
  );
  const plannedReplacementsIn = useMemo(
    () =>
      (auditLinkPlan?.skills ?? []).filter(
        (skill): skill is AuditLinkPlanSkill => skill.decision === "replace_in",
      ),
    [auditLinkPlan],
  );
  const plannedIgnoredPending = useMemo(
    () =>
      (auditLinkPlan?.skills ?? []).filter(
        (skill): skill is AuditLinkPlanSkill => skill.decision === "ignore_pending",
      ),
    [auditLinkPlan],
  );
  const plannedOptionalReplacements = useMemo(
    () => auditLinkPlan?.optional_replacements ?? [],
    [auditLinkPlan],
  );
  const rebalanceRecommendationRows = useMemo<RebalanceRecommendationRow[]>(() => {
    if (auditLinkPlan?.mode !== "rebalance") return [];

    const rows: RebalanceRecommendationRow[] = [];

    plannedRemovals.forEach((skill) => {
      const matchingRecommendation =
        candidateRecommendations.find(
          (candidate) =>
            candidate.action === "remove" &&
            candidate.key_skill_id === skill.key_skill_id,
        ) ?? null;
      const kaizenSkillId =
        kaizenLinkedSkills.find((linked) => linked.key_skill_id === skill.key_skill_id)
          ?.kaizen_id ?? null;
      const recommendation =
        matchingRecommendation ??
        (kaizenSkillId
          ? {
              key_skill_id: skill.key_skill_id,
              key_skill_title: skill.key_skill_title,
              cip_number: skill.cip_number,
              action: "remove" as const,
              replace_skill_id: null,
              replace_skill_title: null,
              confidence:
                typeof skill.confidence === "number" ? skill.confidence : 0,
              rationale: skill.rationale,
              target_kaizen_skill_id: kaizenSkillId,
              logic_points: skill.logic_points,
            }
          : null);
      const rowKey = `remove:${skill.key_skill_id}`;
      const priorDecision = findLatestPriorDecision(
        entry.audit_review_decisions,
        rowKey,
        auditResult?.audit_input_fingerprint ?? null,
      );

      rows.push({
        rowKey,
        action: "remove",
        keySkillId: skill.key_skill_id,
        replaceSkillId: null,
        title: skill.key_skill_title,
        subtitle: `CiP ${skill.cip_number}`,
        rationale: skill.rationale,
        confidence:
          typeof skill.confidence === "number" && skill.confidence > 0
            ? skill.confidence
            : null,
        recommendation,
        canKeepPersistently:
          typeof matchingRecommendation?.suggestion_id === "string" &&
          matchingRecommendation.suggestion_id.length > 0,
        priorDecisionNote:
          priorDecision?.decision === "kept"
            ? `Previously kept on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
            : priorDecision?.decision === "dismissed"
              ? `Previously dismissed on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
              : null,
      });
    });

    plannedReplacementsIn.forEach((skill) => {
      const matchingRecommendation =
        candidateRecommendations.find(
          (candidate) =>
            candidate.action === "replace" &&
            candidate.key_skill_id === skill.key_skill_id &&
            candidate.replace_skill_id === skill.replace_skill_id,
        ) ?? null;
      const backingSuggestion = findSuggestionForSkill(entry, skill.key_skill_id);
      const recommendation =
        matchingRecommendation ??
        (backingSuggestion
          ? {
              key_skill_id: skill.key_skill_id,
              key_skill_title: skill.key_skill_title,
              cip_number: skill.cip_number,
              action: "replace" as const,
              replace_skill_id: skill.replace_skill_id ?? null,
              replace_skill_title: skill.replace_skill_title ?? null,
              confidence:
                typeof skill.confidence === "number" ? skill.confidence : 0,
              rationale: skill.rationale,
              suggestion_id: backingSuggestion.suggestion_id,
              logic_points: skill.logic_points,
            }
          : null);
      const rowKey = `replace:${skill.key_skill_id}:${skill.replace_skill_id ?? ""}`;
      const priorDecision = findLatestPriorDecision(
        entry.audit_review_decisions,
        rowKey,
        auditResult?.audit_input_fingerprint ?? null,
      );

      rows.push({
        rowKey,
        action: "replace",
        keySkillId: skill.key_skill_id,
        replaceSkillId: skill.replace_skill_id ?? null,
        title: skill.key_skill_title,
        subtitle: `Instead of ${skill.replace_skill_title ?? "the current linked skill"}`,
        rationale: skill.rationale,
        confidence:
          typeof skill.confidence === "number" && skill.confidence > 0
            ? skill.confidence
            : null,
        recommendation,
        canKeepPersistently:
          typeof recommendation?.suggestion_id === "string" &&
          recommendation.suggestion_id.length > 0,
        priorDecisionNote:
          priorDecision?.decision === "kept"
            ? `Previously kept on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
            : priorDecision?.decision === "dismissed"
              ? `Previously dismissed on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
              : null,
      });
    });

    return rows.filter(
      (row) =>
        !(row.rowKey in reviewedRebalanceRows) &&
        !(row.rowKey in currentAuditDecisionMap),
    );
  }, [
    auditLinkPlan,
    candidateRecommendations,
    currentAuditDecisionMap,
    entry.audit_review_decisions,
    kaizenLinkedSkills,
    plannedRemovals,
    plannedReplacementsIn,
    reviewedRebalanceRows,
  ]);
  const fallbackOverlinkedRecommendationRows = useMemo<RebalanceRecommendationRow[]>(() => {
    if (auditLinkPlan?.mode === "rebalance" || auditResult?.overlinked !== true) return [];

    const actionable = candidateRecommendations
      .filter(
        (
          candidate,
        ): candidate is AuditCandidateRecommendation & {
          action: "remove" | "replace";
        } => candidate.action === "remove" || candidate.action === "replace",
      )
      .sort((a, b) => {
        const rank = (action: "remove" | "replace") => (action === "remove" ? 0 : 1);
        const rankDelta = rank(a.action) - rank(b.action);
        if (rankDelta !== 0) return rankDelta;
        return b.confidence - a.confidence;
      });

    return actionable
      .map((candidate) => {
        const rowKey = `${candidate.action}:${candidate.key_skill_id}:${candidate.replace_skill_id ?? ""}`;
        const priorDecision = findLatestPriorDecision(
          entry.audit_review_decisions,
          rowKey,
          auditResult?.audit_input_fingerprint ?? null,
        );

        return {
          rowKey,
          action: candidate.action,
          keySkillId: candidate.key_skill_id,
          replaceSkillId: candidate.replace_skill_id ?? null,
          title: candidate.key_skill_title,
          subtitle:
            candidate.action === "replace"
              ? `Instead of ${candidate.replace_skill_title ?? "the current linked skill"}`
              : `CiP ${candidate.cip_number}`,
          rationale:
            Array.isArray(candidate.logic_points) && candidate.logic_points.length > 0
              ? candidate.logic_points.slice(0, 3).join(". ")
              : candidate.rationale,
          confidence:
            typeof candidate.confidence === "number" && candidate.confidence > 0
              ? candidate.confidence
              : null,
          recommendation: candidate,
          canKeepPersistently:
            typeof candidate.suggestion_id === "string" && candidate.suggestion_id.length > 0,
          priorDecisionNote:
            priorDecision?.decision === "kept"
              ? `Previously kept on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
              : priorDecision?.decision === "dismissed"
                ? `Previously dismissed on ${new Date(priorDecision.reviewed_at).toLocaleDateString("en-GB")}`
                : null,
        };
      })
      .filter(
        (row) =>
          !(row.rowKey in reviewedRebalanceRows) &&
          !(row.rowKey in currentAuditDecisionMap),
      );
  }, [
    auditLinkPlan?.mode,
    auditResult?.overlinked,
    candidateRecommendations,
    currentAuditDecisionMap,
    reviewedRebalanceRows,
  ]);
  const activeRebalanceRows =
    auditLinkPlan?.mode === "rebalance"
      ? rebalanceRecommendationRows
      : fallbackOverlinkedRecommendationRows;
  const hasPendingRemovalSync = pendingRemovalCount > 0;
  const isRecommendationReviewMode =
    hasPendingRemovalSync ||
    auditLinkPlan?.mode === "rebalance" ||
    (auditResult?.overlinked === true && activeRebalanceRows.length > 0);
  const reviewedRebalanceCount = Object.keys(reviewedRebalanceRows).length;

  async function applyAuditRecommendation(
    actionKey: string,
    recommendation: AuditCandidateRecommendation,
  ) {
    if (!onApplyAuditRecommendation) return;
    setPendingAuditActionKey(actionKey);
    try {
      await onApplyAuditRecommendation(entry.id, recommendation);
    } finally {
      setPendingAuditActionKey((current) =>
        current === actionKey ? null : current,
      );
    }
  }

  async function keepCurrentRecommendation(
    recommendation: AuditCandidateRecommendation,
  ) {
    const suggestionId =
      typeof recommendation.suggestion_id === "string"
        ? recommendation.suggestion_id.trim()
        : "";
    if (!suggestionId) {
      setStripDismissed(true);
      return;
    }
    // Derive the correct source from the actual suggestion rather than assuming cross_cip
    const matchedSource =
      allSuggestionsWithSource.find((s) => s.suggestion_id === suggestionId)?.source ??
      "cross_cip";
    setPendingKeepCurrent(true);
    try {
      await onUpdateSuggestion(entry.id, suggestionId, matchedSource, "rejected");
      // Only dismiss after the API call resolves successfully
      setStripDismissed(true);
    } finally {
      setPendingKeepCurrent(false);
    }
  }

  async function unlinkKaizenSkill(
    keySkillId: string,
    kaizenSkillId: string,
    keySkillTitle: string,
  ) {
    if (!onUnlinkKaizenSkill) return;
    const actionKey = `${keySkillId}:${kaizenSkillId}`;
    setPendingUnlinkSkillId(actionKey);
    try {
      await onUnlinkKaizenSkill(entry.id, keySkillId, kaizenSkillId, keySkillTitle);
    } finally {
      setPendingUnlinkSkillId((current) => (current === actionKey ? null : current));
    }
  }

  async function applyRebalanceRecommendation(row: RebalanceRecommendationRow) {
    if (!row.recommendation) return;
    const actionKey = `rebalance:${row.rowKey}`;
    await applyAuditRecommendation(actionKey, row.recommendation);
    setReviewedRebalanceRows((current) => ({
      ...current,
      [row.rowKey]: "acted",
    }));
  }

  async function keepRebalanceRecommendation(row: RebalanceRecommendationRow) {
    if (row.recommendation && row.canKeepPersistently) {
      const suggestionId =
        typeof row.recommendation.suggestion_id === "string"
          ? row.recommendation.suggestion_id.trim()
          : "";
      const matchedSource =
        suggestionId.length > 0
          ? allSuggestionsWithSource.find((s) => s.suggestion_id === suggestionId)?.source ??
            "cross_cip"
          : null;

      if (suggestionId && matchedSource) {
        setPendingKeepCurrent(true);
        try {
          await onUpdateSuggestion(entry.id, suggestionId, matchedSource, "rejected");
        } finally {
          setPendingKeepCurrent(false);
        }
      }
    }

    const auditFingerprint = auditResult?.audit_input_fingerprint ?? null;
    if (auditFingerprint && onRecordAuditReviewDecision) {
      await onRecordAuditReviewDecision({
        review_entry_id: entry.id,
        recommendation_key: row.rowKey,
        decision: "kept",
        audit_input_fingerprint: auditFingerprint,
        action: row.action,
        key_skill_id: row.keySkillId,
        replace_skill_id: row.replaceSkillId ?? null,
        key_skill_title: row.title,
        replace_skill_title:
          row.action === "replace" ? row.recommendation?.replace_skill_title ?? null : null,
      });
    }

    setReviewedRebalanceRows((current) => ({
      ...current,
      [row.rowKey]: "kept",
    }));
  }

  async function dismissRebalanceRecommendation(row: RebalanceRecommendationRow) {
    const auditFingerprint = auditResult?.audit_input_fingerprint ?? null;
    if (auditFingerprint && onRecordAuditReviewDecision) {
      await onRecordAuditReviewDecision({
        review_entry_id: entry.id,
        recommendation_key: row.rowKey,
        decision: "dismissed",
        audit_input_fingerprint: auditFingerprint,
        action: row.action,
        key_skill_id: row.keySkillId,
        replace_skill_id: row.replaceSkillId ?? null,
        key_skill_title: row.title,
        replace_skill_title:
          row.action === "replace" ? row.recommendation?.replace_skill_title ?? null : null,
      });
    }

    setReviewedRebalanceRows((current) => ({
      ...current,
      [row.rowKey]: "dismissed",
    }));
  }

  const stripRecommendation = primaryActionRecommendation;
  const stripActionKey = stripRecommendation
    ? `strip:${stripRecommendation.suggestion_id ?? stripRecommendation.key_skill_id}:${stripRecommendation.action}:${stripRecommendation.replace_skill_id ?? ""}`
    : null;
  const stripIsApplying =
    stripActionKey != null && pendingAuditActionKey === stripActionKey;
  const stripCanApply =
    stripRecommendation != null &&
    Boolean(onApplyAuditRecommendation) &&
    (stripRecommendation.action === "remove"
      ? typeof stripRecommendation.key_skill_id === "string" &&
        stripRecommendation.key_skill_id.length > 0
      : typeof stripRecommendation.suggestion_id === "string" &&
        stripRecommendation.suggestion_id.length > 0) &&
    !stripIsApplying &&
    !disabled &&
    !pendingKeepCurrent;

  return (
    <article className="card card-interactive p-4 md:p-5">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left space-y-2"
      >
        {/* Row 1 — title + chevron */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="text-small font-semibold text-primary truncate">
              {entry.title}
            </h3>
            {auditBadgeLabel && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${auditBadgeClass}`}
              >
                {auditBadgeLabel}
              </span>
            )}
            {hasAuditWarning && (
              <span
                title="Audit warning"
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/15 px-1 text-[10px] font-semibold text-amber-700 shrink-0"
              >
                !
              </span>
            )}
          </div>
          <ChevronIcon open={isOpen} />
        </div>
        {/* Row 2 — meta */}
        <p className="text-micro text-muted">{metaLine}</p>
        {/* Row 3 — status pills */}
        <div className="flex flex-wrap gap-1.5 text-micro text-secondary">
          {confirmedCount > 0 && (
            <span className="rounded-full bg-surface-4 px-2 py-0.5 font-medium">
              ✓ {confirmedCount} confirmed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-surface-4 px-2 py-0.5 font-medium">
              {pendingCount} pending
              {crossCipPendingCount > 0 ? ` (${crossCipPendingCount} cross-CiP)` : ""}
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4 border-t border-subtle pt-3">
          <details className="rounded-xl border border-subtle bg-surface-1 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-primary">
              Entry evidence
            </summary>
            <div className="mt-3 rounded-lg border border-subtle bg-surface-2 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Entry
              </p>
              <h4 className="mt-1 text-sm font-semibold leading-snug text-primary">
                {entry.title}
              </h4>
              <p className="mt-1 text-[11px] text-secondary">{metaLine}</p>
            </div>

            <div className="mt-3 rounded-lg border border-subtle bg-surface-2 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Currently linked in Kaizen
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Official links currently present on the Kaizen entry.
              </p>
              {kaizenLinkedSkills.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {kaizenLinkedSkills.map((skill, index) => {
                    const skillKaizenId = skill.kaizen_id;
                    return (
                      <li
                        key={`${entry.id}-evidence-kaizen-linked-${skill.key_skill_id}-${index}`}
                        className="rounded-md border border-subtle bg-surface-1 px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium leading-snug text-primary">
                              {skill.key_skill_title}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted">
                              CiP {skill.cip_number}
                              {skillKaizenId ? ` · Kaizen ID ${skillKaizenId}` : ""}
                            </p>
                          </div>
                          {skillKaizenId && onUnlinkKaizenSkill && (
                            <button
                              type="button"
                              disabled={
                                disabled ||
                                pendingUnlinkSkillId ===
                                  `${skill.key_skill_id}:${skillKaizenId}`
                              }
                              onClick={() =>
                                void unlinkKaizenSkill(
                                  skill.key_skill_id,
                                skillKaizenId,
                                skill.key_skill_title,
                              )
                            }
                              className="inline-flex min-h-6 items-center rounded-md border border-rose-300/45 bg-rose-300/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Queue removal of this link for Kaizen sync"
                            >
                              {pendingUnlinkSkillId ===
                              `${skill.key_skill_id}:${skillKaizenId}`
                                ? "Removing..."
                                : "Remove link"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : kaizenLinkedRaw.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {kaizenLinkedRaw.map((rawSkill, index) => (
                    <li
                      key={`${entry.id}-evidence-kaizen-raw-${index}`}
                      className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-secondary"
                    >
                      {rawSkill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] italic text-muted">
                  No skills currently linked in Kaizen for this entry.
                </p>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-subtle bg-surface-2 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Entry notes
              </p>
              {structuredEntrySections.length === 0 ? (
                <p className="mt-2 text-micro leading-relaxed text-secondary">
                  {cleanedNarrative}
                </p>
              ) : (
                <div className="mt-2 space-y-2.5">
                  {structuredEntrySections.map((section, index) => (
                    <section
                      key={`${section.title}-${index}`}
                      className="rounded-lg border border-subtle bg-surface-1 px-3 py-2.5"
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
            </div>
          </details>

          {hasAuditData && !stripDismissed && (
            <section className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                Next Action
              </p>
              <p className="mt-1 text-xs font-semibold text-primary">
                {auditLinkPlan?.mode === "rebalance"
                  ? `This entry is over cap by ${Math.max(
                      0,
                      Number(auditResult.overlinked_by ?? 0),
                    )}.`
                  : auditResult.overlinked
                  ? `This entry is over cap by ${Math.max(
                      0,
                      Number(auditResult.overlinked_by ?? 0),
                    )}.`
                  : `This entry has ${
                      Number(auditResult.slots_remaining ?? 0)
                    } open skill slot${
                      Number(auditResult.slots_remaining ?? 0) === 1 ? "" : "s"
                    }.`}
              </p>
              {auditLinkPlan?.mode === "rebalance" || auditResult.overlinked ? (
                <div className="mt-3 space-y-3">
                  {hasPendingRemovalSync && (
                    <div className="rounded-lg border border-accent-amber/25 bg-accent-amber/10 px-3 py-2">
                      <p className="text-[11px] font-medium text-secondary">
                        {pendingRemovalCount} queued change
                        {pendingRemovalCount === 1 ? "" : "s"} already waiting for Kaizen sync.
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        You can keep reviewing the remaining recommendations for this entry, then
                        run Background Sync and Audit when you are ready.
                      </p>
                    </div>
                  )}
                  {activeRebalanceRows.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                            Review recommendations
                          </p>
                          <p className="mt-1 text-[11px] text-secondary">
                            Review these one at a time. Each recommendation includes its own reason and can be actioned, kept, or dismissed before you rerun Audit.
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-accent-blue/25 bg-accent-blue/10 px-2.5 py-1 text-[11px] font-semibold text-accent-blue">
                          {activeRebalanceRows.length} to review
                        </span>
                      </div>

                      <ul className="space-y-2">
                        {activeRebalanceRows.map((row) => {
                          const rowActionKey = `rebalance:${row.rowKey}`;
                          const isApplying = pendingAuditActionKey === rowActionKey;
                          const canApply =
                            row.recommendation != null &&
                            Boolean(onApplyAuditRecommendation) &&
                            !disabled &&
                            !pendingKeepCurrent &&
                            !isApplying &&
                            (row.recommendation.action === "remove"
                              ? typeof row.recommendation.key_skill_id === "string" &&
                                row.recommendation.key_skill_id.length > 0
                              : typeof row.recommendation.suggestion_id === "string" &&
                                row.recommendation.suggestion_id.length > 0);

                          return (
                            <li
                              key={`${entry.id}-${row.rowKey}`}
                              className="rounded-xl border border-accent-blue/20 bg-white/70 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                        row.action === "remove"
                                          ? "bg-rose-300/12 text-rose-700"
                                          : "bg-accent-blue/10 text-accent-blue"
                                      }`}
                                    >
                                      {row.action === "remove" ? "Remove" : "Replace"}
                                    </span>
                                    {row.confidence != null && (
                                      <span className="inline-flex items-center rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-secondary">
                                        {Math.round(row.confidence * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-2 text-[13px] font-semibold leading-snug text-primary">
                                    {row.title}
                                  </p>
                                  {row.subtitle ? (
                                    <p className="mt-0.5 text-[11px] text-secondary">
                                      {row.subtitle}
                                    </p>
                                  ) : null}
                                  <div className="mt-2 rounded-lg border border-subtle/70 bg-surface-1 px-2.5 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                                      Why this recommendation
                                    </p>
                                    <p className="mt-1 text-[11px] text-secondary">
                                      {row.rationale}
                                    </p>
                                    {row.priorDecisionNote ? (
                                      <p className="mt-1.5 text-[10px] font-medium text-muted">
                                        {row.priorDecisionNote}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={!canApply}
                                  onClick={() => void applyRebalanceRecommendation(row)}
                                  className="inline-flex min-h-8 items-center rounded-lg border border-accent-blue/30 bg-surface-1 px-2.5 py-1 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isApplying ? "Applying..." : "Action"}
                                </button>
                                <button
                                  type="button"
                                  disabled={pendingKeepCurrent || disabled}
                                  onClick={() => void keepRebalanceRecommendation(row)}
                                  className="inline-flex min-h-8 items-center rounded-lg border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  title={
                                    row.canKeepPersistently
                                      ? "Record that you want to keep the current link setup for this recommendation."
                                      : "Keep this recommendation out of your current review pass."
                                  }
                                >
                                  {pendingKeepCurrent ? "Saving..." : "Keep current"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void dismissRebalanceRecommendation(row)}
                                  className="inline-flex min-h-8 items-center rounded-lg border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-2"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-secondary">
                        No remaining rebalance recommendations in this review pass.
                      </p>
                    </div>
                  )}

                  {reviewedRebalanceCount > 0 && (
                    <p className="text-[11px] text-secondary">
                      {reviewedRebalanceCount} recommendation
                      {reviewedRebalanceCount === 1 ? "" : "s"} reviewed on this audit pass. Run
                      Audit when you are ready to refresh this entry.
                    </p>
                  )}

                  {auditLinkPlan?.mode === "rebalance" && plannedIgnoredPending.length > 0 && (
                    <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-secondary">
                        Not recommended now
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        These pending suggestions are being held back by the current rebalance plan.
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {plannedIgnoredPending.slice(0, 4).map((skill, index) => (
                          <li
                            key={`${entry.id}-ignore-pending-${skill.key_skill_id}-${index}`}
                            className="text-[11px] text-secondary"
                          >
                            {skill.key_skill_title}
                            {typeof skill.confidence === "number"
                              ? ` (${Math.round(skill.confidence * 100)}%)`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {auditLinkPlan?.mode === "rebalance" && plannedOptionalReplacements.length > 0 && (
                    <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-medium text-secondary">
                            Optional portfolio-broadening swaps
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            These are optional ideas to improve wider portfolio coverage. You do
                            not need to make these swaps to get this entry back under the cap.
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-secondary">
                          Optional
                        </span>
                      </div>
                      <ul className="mt-2 space-y-2">
                        {plannedOptionalReplacements.map((replacement, index) => (
                          <li
                            key={`${entry.id}-optional-replacement-${replacement.incoming_key_skill_id}-${replacement.outgoing_key_skill_id}-${index}`}
                            className="rounded-lg border border-subtle/80 bg-surface-2 px-3 py-2"
                          >
                            <p className="text-[11px] font-medium text-primary">
                              Swap in {replacement.incoming_key_skill_title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-secondary">
                              Instead of{" "}
                              {replacement.outgoing_key_skill_title ??
                                replacement.outgoing_key_skill_id}
                              {typeof replacement.confidence === "number"
                                ? ` (${Math.round(replacement.confidence * 100)}%)`
                                : ""}
                            </p>
                            {Array.isArray(replacement.logic_points) &&
                            replacement.logic_points.length > 0 ? (
                              <ul className="mt-1 space-y-1">
                                {replacement.logic_points.slice(0, 2).map((point, pointIndex) => (
                                  <li
                                    key={`${entry.id}-optional-replacement-logic-${replacement.incoming_key_skill_id}-${pointIndex}`}
                                    className="text-[11px] text-muted"
                                  >
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            ) : replacement.rationale ? (
                              <p className="mt-1 text-[11px] text-muted">
                                {replacement.rationale}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-secondary">
                  {stripRecommendation
                    ? stripRecommendation.action === "replace"
                      ? `Recommended action: replace "${
                          stripRecommendation.replace_skill_title ||
                          stripRecommendation.replace_skill_id
                        }" with "${stripRecommendation.key_skill_title}".`
                      : stripRecommendation.action === "remove"
                        ? `Recommended action: remove "${stripRecommendation.key_skill_title}" from the Kaizen entry.`
                        : `Recommended action: link "${stripRecommendation.key_skill_title}".`
                    : "No automatic add/remove/replace recommendation yet. Review the current Kaizen links below."}
                </p>
              )}
              {!isRecommendationReviewMode &&
              stripRecommendation &&
              Array.isArray(stripRecommendation.logic_points) &&
              stripRecommendation.logic_points.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {stripRecommendation.logic_points.slice(0, 3).map((point, index) => (
                    <li
                      key={`${entry.id}-strip-logic-${index}`}
                      className="text-[11px] text-secondary"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {!isRecommendationReviewMode && stripRecommendation && (
                  <button
                    type="button"
                    disabled={!stripCanApply}
                    onClick={() =>
                      stripRecommendation &&
                      stripActionKey &&
                      void applyAuditRecommendation(stripActionKey, stripRecommendation)
                    }
                    className="inline-flex min-h-8 items-center rounded-lg border border-accent-blue/30 bg-surface-1 px-2.5 py-1 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {stripIsApplying
                      ? "Applying..."
                      : stripRecommendation.action === "remove"
                        ? recommendedRemovals.length > 1
                          ? "Apply first removal"
                          : "Action"
                      : stripRecommendation.action === "replace"
                        ? "Action"
                        : "Action"}
                  </button>
                )}
                {!isRecommendationReviewMode && stripRecommendation != null ? (
                  <button
                    type="button"
                    disabled={pendingKeepCurrent || disabled}
                    onClick={() => void keepCurrentRecommendation(stripRecommendation)}
                    title="Marks this AI recommendation as not needed and keeps your current linked skills."
                    className="inline-flex min-h-8 items-center rounded-lg border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingKeepCurrent ? "Saving..." : "Keep current"}
                  </button>
                ) : null}
                {!isRecommendationReviewMode && (
                  <button
                    type="button"
                    onClick={() => setStripDismissed(true)}
                    className="inline-flex min-h-8 items-center rounded-lg border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-secondary transition hover:bg-surface-2"
                    >
                      Dismiss (until next audit)
                    </button>
                )}
                </div>
                {!isRecommendationReviewMode && (
                <details className="mt-2 rounded-lg border border-subtle bg-surface-2 px-2.5 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                  Why this recommendation
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-secondary sm:grid-cols-4">
                  <p>
                    Target:{" "}
                    <span className="font-medium text-primary">
                      {auditResult.effective_target ?? "-"}
                    </span>
                  </p>
                  <p>
                    Linked:{" "}
                    <span className="font-medium text-primary">
                      {auditResult.effective_linked_skill_count ??
                        auditResult.current_linked_skill_count ??
                        "-"}
                    </span>
                  </p>
                  <p>
                    Slots:{" "}
                    <span className="font-medium text-primary">
                      {auditResult.slots_remaining ?? "-"}
                    </span>
                  </p>
                  <p>
                    Status:{" "}
                    <span className="font-medium text-primary">
                      {auditResult.status_hint ?? "-"}
                    </span>
                  </p>
                </div>

                {auditLinkPlan?.mode === "rebalance" && (
                    <div className="mt-2">
                      <p className="text-[11px] font-medium text-secondary">
                        Rebalance summary
                      </p>
                      <p className="mt-1 text-[11px] text-secondary">
                        {auditLinkPlan.summary}
                      </p>
                      {plannedKeeps.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted">
                          Keep: {plannedKeeps.map((skill) => skill.key_skill_title).join(" · ")}
                        </p>
                      )}
                      {reviewedRebalanceCount > 0 && (
                        <p className="mt-1 text-[11px] text-muted">
                          Reviewed in this pass: {reviewedRebalanceCount}
                        </p>
                      )}
                      {plannedOptionalReplacements.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted">
                          Optional swaps available: {plannedOptionalReplacements.length}
                      </p>
                    )}
                  </div>
                )}

                {additionalActionRecommendations.length > 0 &&
                !(auditResult.overlinked && recommendedRemovals.length > 1) ? (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-secondary">
                      Alternative
                    </p>
                    <ul className="mt-1 space-y-1">
                      {additionalActionRecommendations.slice(0, 1).map((candidate, index) => (
                        <li
                          key={`${entry.id}-strip-alt-${candidate.key_skill_id}-${index}`}
                          className="text-[11px] text-secondary"
                        >
                          {candidate.action === "replace"
                            ? "Replace"
                            : candidate.action === "remove"
                              ? "Remove"
                              : "Add"}{" "}
                          {candidate.key_skill_title} ({Math.round(candidate.confidence * 100)}%)
                          {Array.isArray(candidate.logic_points) &&
                          candidate.logic_points.length > 0
                            ? ` — ${candidate.logic_points[0]}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    {additionalActionRecommendations.length > 1 && (
                      <p className="mt-1 text-[11px] text-muted">
                        {additionalActionRecommendations.length - 1} more alternative
                        {additionalActionRecommendations.length - 1 === 1 ? "" : "s"} available in
                        a future audit pass if needed.
                      </p>
                    )}
                  </div>
                ) : null}

                {(removeFindingCount > 0 || replaceFindingCount > 0 || addFindingCount > 0) && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-secondary">
                      Audit summary
                    </p>
                    <p className="mt-1 text-[11px] text-secondary">
                      {removeFindingCount > 0
                        ? `Audit found ${removeFindingCount} recommended removal${
                            removeFindingCount === 1 ? "" : "s"
                          }.`
                        : replaceFindingCount > 0
                          ? `Audit found ${replaceFindingCount} recommended replacement${
                              replaceFindingCount === 1 ? "" : "s"
                            }.`
                          : `Audit found ${addFindingCount} recommended addition${
                              addFindingCount === 1 ? "" : "s"
                            }.`}
                    </p>
                  </div>
                )}
              </details>
                )}
              {(hasAuditWarning ||
                warningDetails.length > 0 ||
                sortedQuality.length > 0 ||
                unresolvedLinkedSkills.length > 0) && (
                <details className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-amber-800">
                    System issues
                  </summary>

                  {hasAuditWarning && (
                    <div className="mt-2">
                      <p className="text-[11px] text-secondary">
                        Some audit analysis could not be completed.
                      </p>
                      <ul className="mt-1 space-y-1">
                        {(auditResult.audit_warning ?? []).map((warning, index) => (
                          <li
                            key={`${entry.id}-warning-summary-${index}`}
                            className="text-[11px] text-secondary"
                          >
                            {warningSummaryLabel(warning)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <details className="mt-2 rounded-md border border-subtle bg-surface-1 p-2.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                      Technical details
                    </summary>

                    {warningDetails.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-secondary">
                          Warning details ({warningDetails.length})
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {warningDetails.map((detail, index) => (
                            <li
                              key={`${entry.id}-warning-detail-${index}`}
                              className="text-[11px] text-secondary"
                            >
                              [{detail.stage}] {detail.warning}: {detail.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sortedQuality.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-secondary">
                          Linked skill quality ({scorableQualityCount} scorable
                          {unscorableQualityCount > 0
                            ? `, ${unscorableQualityCount} unscorable`
                            : ""}
                          )
                        </p>
                        <ul className="mt-1 space-y-1">
                          {sortedQuality.map((quality, index) => (
                            <li
                              key={`${entry.id}-quality-${quality.key_skill_id}-${index}`}
                              className="text-[11px] text-secondary"
                            >
                              {qualityLine(quality)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {unresolvedLinkedSkills.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-secondary">
                          Unresolved linked skills ({unresolvedLinkedSkills.length})
                        </p>
                        <ul className="mt-1 space-y-1">
                          {unresolvedLinkedSkills.map((skill, index) => (
                            <li
                              key={`${entry.id}-unresolved-skill-${index}`}
                              className="text-[11px] text-secondary"
                            >
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </details>
                </details>
              )}
            </section>
          )}

          {/* ── 3. Your review decisions ──────────────────────────────────── */}
          <section className="rounded-xl border border-subtle bg-surface-1 p-3">
            <div className="mb-2">
              <h4 className="text-xs font-semibold text-primary">
                {isRecommendationReviewMode ? "Review history" : "Suggested additional links"}
              </h4>
              <p className="text-[11px] text-muted">
                {isRecommendationReviewMode
                  ? "Pending suggestions are folded into Next Action while this entry is being reviewed."
                  : canSurfaceAdditionalLinks(auditResult)
                    ? "These are extra links the entry could support because it still has capacity."
                    : "This entry is full or over cap, so extra add-style suggestions are hidden here. Review replacements or over-cap actions instead."}
              </p>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {!isRecommendationReviewMode && (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-secondary">
                  Pending {surfacedAdditionalLinks.length}
                </span>
              )}
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-secondary">
                Cross-CiP {crossCipCount}
              </span>
              {(decisionConfirmedSuggestions.length > 0 || decisionRejectedSuggestions.length > 0) && (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-secondary">
                  History {decisionConfirmedSuggestions.length + decisionRejectedSuggestions.length}
                </span>
              )}
            </div>

            {isRecommendationReviewMode ? (
              <p className="text-[11px] italic text-muted">
                No separate confirm/reject queue while this entry is in recommendation review mode. Use the unified recommendations above.
              </p>
            ) : !canSurfaceAdditionalLinks(auditResult) ? (
              <p className="text-[11px] italic text-muted">
                Additional-link suggestions are hidden while this entry is full or over cap.
              </p>
            ) : surfacedAdditionalLinks.length === 0 ? (
              <p className="text-[11px] italic text-muted">No suggested additional links.</p>
            ) : (
              <div>
                <p className="text-[11px] font-medium text-secondary">Suggested additional links</p>
                <ul className="mt-1.5 space-y-1.5">
                  {surfacedAdditionalLinks.map((s) => (
                    <SuggestionRow
                      key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}-pending`}
                      suggestion={s}
                      entryId={entry.id}
                      source={s.source}
                      onUpdate={onUpdateSuggestion}
                      disabled={disabled}
                      isHighlighted={highlightSkillId != null && s.key_skill_id === highlightSkillId}
                    />
                  ))}
                </ul>
              </div>
            )}

            {(decisionConfirmedSuggestions.length > 0 || decisionRejectedSuggestions.length > 0) && (
              <details className="mt-2 rounded-lg border border-subtle bg-surface-2 p-2.5">
                <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                  Review history ({decisionConfirmedSuggestions.length} confirmed,{" "}
                  {decisionRejectedSuggestions.length} rejected)
                </summary>

                {decisionConfirmedSuggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-secondary">
                      Confirmed ({decisionConfirmedSuggestions.length})
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {decisionConfirmedSuggestions.map((s) => (
                        <SuggestionRow
                          key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}-confirmed`}
                          suggestion={s}
                          entryId={entry.id}
                          source={s.source}
                          onUpdate={onUpdateSuggestion}
                          disabled={disabled}
                          isHighlighted={
                            highlightSkillId != null && s.key_skill_id === highlightSkillId
                          }
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {decisionRejectedSuggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-secondary">
                      Rejected ({decisionRejectedSuggestions.length})
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {decisionRejectedSuggestions.map((s) => (
                        <SuggestionRow
                          key={s.suggestion_id ?? `${s.key_skill_id}-${entry.id}-rejected`}
                          suggestion={s}
                          entryId={entry.id}
                          source={s.source}
                          onUpdate={onUpdateSuggestion}
                          disabled={disabled}
                          isHighlighted={
                            highlightSkillId != null && s.key_skill_id === highlightSkillId
                          }
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </details>
            )}

            {suggestedOnly && (
              <p className="mt-2 text-[11px] text-muted">
                Focus mode keeps pending work in front and tucks older decisions into review history.
              </p>
            )}
          </section>

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
