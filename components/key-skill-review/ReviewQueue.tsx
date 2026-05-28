"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewEntry } from "@/lib/types/key-skill-review";
import type {
  AuditCandidateRecommendation,
  AuditEntryResult,
} from "@/lib/types/audit-entry-result";
import { ReviewCard } from "./ReviewCard";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "./ReviewFilters";
import type { AuditReviewDecisionBody } from "@/lib/types/key-skill-review-api";
import {
  filterSuggestionsForEntry,
} from "@/lib/key-skill-review/filter-suggestions";
import { buildCurrentAuditDecisionMap } from "@/lib/key-skill-review/audit-review-decisions";
import { RECOMMENDED_SKILLS_PER_ENTRY_TARGET } from "@/lib/key-skill-review/entry-skill-target";

const PAGE_SIZE = 25;
export type ReviewQueueMode = "focus" | "list";
export type FocusReviewMode = "classic" | "swipe";
type AuditItemFilter = "overlinked" | "awaiting_sync" | "replace" | "flag" | "all";
const SWIPE_THRESHOLD_PX = 96;

type ReviewQueueProps = {
  entries: ReviewEntry[];
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
  confidenceFilter: ConfidenceFilter;
  query: string;
  mode: ReviewQueueMode;
  focusReviewMode?: FocusReviewMode;
  onUpdateSuggestion: (
    entryId: string,
    suggestionId: string,
    source: "linked_cip" | "cross_cip",
    nextStatus: "suggested" | "confirmed" | "rejected",
  ) => void;
  disabled?: boolean;
  /** Progress hub deep-link: scroll focus mode to this entry when it appears in the filtered list. */
  progressFocusEntryId?: string | null;
  progressFocusSkillId?: string | null;
  progressFocusDescriptorId?: string | null;
  onUndoLastAction?: (() => void) | null;
  canUndoLastAction?: boolean;
  onRequestExitSwipeMode?: (() => void) | null;
  auditResultsByEntryId?: Record<string, AuditEntryResult>;
  onApplyAuditRecommendation?: (
    entryId: string,
    recommendation: AuditCandidateRecommendation,
  ) => Promise<void> | void;
  pendingRemovalCountByEntryId?: Record<string, number>;
  onUnlinkKaizenSkill?: (
    entryId: string,
    keySkillId: string,
    kaizenSkillId: string,
    keySkillTitle: string,
  ) => Promise<void> | void;
  reviewWorkstream?: "audit" | "suggestions";
  auditItemFilter?: AuditItemFilter;
  appliedAuditRecommendationKeys?: Record<string, true>;
  onRecordAuditReviewDecision?: (
    body: AuditReviewDecisionBody,
  ) => Promise<void> | void;
};

type PendingSuggestionCandidate = ReviewEntry["linked_cip_suggestions"][number] & {
  source: "linked_cip" | "cross_cip";
};

type UnifiedReviewItem = {
  itemKey: string;
  kind: "suggestion" | "remove" | "replace";
  entryId: string;
  title: string;
  subtitle: string;
  rationale: string;
  confidence: number | null;
  recommendation: AuditCandidateRecommendation | null;
  suggestionId: string | null;
  suggestionSource: "linked_cip" | "cross_cip" | null;
  swipeRightLabel: string;
  swipeLeftLabel: string;
  reviewDecisionKey?: string | null;
};

type StructuredEntrySection = {
  title: string;
  paragraphs: string[];
};

const ENTRY_PARAGRAPH_STARTERS = [
  "Patient",
  "Compared",
  "My consultant",
  "Outpatient management",
  "The discussion reinforced",
  "I plan",
  "This discussion was invaluable",
  "I feel",
  "Throughout the shift",
  "What challenged me",
  "Looking back",
  "Next time",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntryTextEntities(text: string): string {
  return text
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanEntryNarrative(rawText: string, title: string): string {
  let text = decodeEntryTextEntities(rawText).replace(/\s+/g, " ").trim();
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
    p.includes("next time") ||
    p.includes("what i would develop") ||
    p.includes("further study") ||
    p.includes("guideline")
  ) {
    return "Learning plan";
  }
  if (
    p.includes("i feel") ||
    p.includes("what challenged me") ||
    p.includes("looking back") ||
    p.includes("this discussion was invaluable") ||
    p.includes("the key learning")
  ) {
    return "Reflection";
  }
  if (
    p.includes("risk") ||
    p.includes("monitoring") ||
    p.includes("decision") ||
    p.includes("escalat") ||
    p.includes("pathway")
  ) {
    return "Decision-making and risk balance";
  }
  if (
    p.includes("communicat") ||
    p.includes("handover") ||
    p.includes("team") ||
    p.includes("staff") ||
    p.includes("partner")
  ) {
    return "Communication and teamworking";
  }
  return "Entry notes";
}

function structureEntryNarrative(rawText: string, title: string): StructuredEntrySection[] {
  const cleaned = cleanEntryNarrative(rawText, title);
  if (!cleaned) return [];

  const starterPattern = new RegExp(
    `\\s+(?=(?:${ENTRY_PARAGRAPH_STARTERS.map(escapeRegex).join("|")}))`,
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

function reviewItemKindLabel(kind: UnifiedReviewItem["kind"]): string {
  if (kind === "suggestion") return "New suggestion";
  if (kind === "remove") return "Remove link";
  return "Swap skill";
}

function buildEntryReviewReason(
  entry: ReviewEntry,
  auditResult: AuditEntryResult | undefined,
  reviewItemCount: number,
  reviewItems: UnifiedReviewItem[],
  reviewWorkstream: "audit" | "suggestions",
  auditItemFilter: AuditItemFilter,
): string {
  const itemCounts = reviewItems.reduce(
    (acc, item) => {
      acc[item.kind] += 1;
      return acc;
    },
    { suggestion: 0, remove: 0, replace: 0 },
  );

  if (reviewWorkstream === "audit" && auditItemFilter === "replace") {
    return `${itemCounts.replace} replacement recommendation${itemCounts.replace === 1 ? "" : "s"} still need review`;
  }
  if (reviewWorkstream === "audit" && auditItemFilter === "overlinked") {
    const overlinkedBy = Number(auditResult?.overlinked_by ?? 0);
    const base =
      auditResult?.overlinked && overlinkedBy > 0
        ? `Too many skills linked (over by ${overlinkedBy})`
        : `${itemCounts.remove + itemCounts.replace} overlinked recommendation${
            itemCounts.remove + itemCounts.replace === 1 ? "" : "s"
          } still need review`;
    if (itemCounts.replace > 0) {
      return `${base} · ${itemCounts.replace} replacement recommendation${
        itemCounts.replace === 1 ? "" : "s"
      } included`;
    }
    return base;
  }

  const parts: string[] = [];
  const overlinkedBy = Number(auditResult?.overlinked_by ?? 0);
  const findings = Array.isArray(auditResult?.audit_findings) ? auditResult.audit_findings : [];
  const replaceCount = findings.filter((finding) => finding.type === "replace").length;
  const pendingSuggestionCount = pendingSuggestionsForEntry(entry, auditResult).length;

  if (auditResult?.overlinked && overlinkedBy > 0) {
    parts.push(`Too many skills linked (over by ${overlinkedBy})`);
  }
  if (replaceCount > 0) {
    parts.push(`${replaceCount} replacement recommendation${replaceCount === 1 ? "" : "s"} need review`);
  }
  if (pendingSuggestionCount > 0) {
    parts.push(`${pendingSuggestionCount} pending suggestion${pendingSuggestionCount === 1 ? "" : "s"} still need a decision`);
  }
  if (parts.length === 0) {
    parts.push(`${reviewItemCount} review item${reviewItemCount === 1 ? "" : "s"} on this entry`);
  }

  return parts.join(" · ");
}

function isEditableTarget(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  if (target.isContentEditable) return true;
  return false;
}

function canSurfaceAdditionalLinks(auditResult: AuditEntryResult | undefined): boolean {
  if (!auditResult) return true;
  if (auditResult.overlinked === true) return false;
  return Number(auditResult.slots_remaining ?? 0) > 0;
}

function pendingSuggestionsForEntry(
  entry: ReviewEntry,
  auditResult: AuditEntryResult | undefined,
): PendingSuggestionCandidate[] {
  if (!canSurfaceAdditionalLinks(auditResult)) return [];
  const all = [
    ...entry.linked_cip_suggestions.map((s) => ({ ...s, source: "linked_cip" as const })),
    ...entry.cross_cip_suggestions.map((s) => ({ ...s, source: "cross_cip" as const })),
  ]
    .filter((s) => s.status === "suggested" && typeof s.suggestion_id === "string" && s.suggestion_id.length > 0)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.key_skill_title.localeCompare(b.key_skill_title);
    });
  return all;
}

function findSuggestionSource(
  entry: ReviewEntry,
  suggestionId: string | null | undefined,
): "linked_cip" | "cross_cip" | null {
  if (!suggestionId) return null;
  if (entry.linked_cip_suggestions.some((s) => s.suggestion_id === suggestionId)) {
    return "linked_cip";
  }
  if (entry.cross_cip_suggestions.some((s) => s.suggestion_id === suggestionId)) {
    return "cross_cip";
  }
  return null;
}

function findSuggestionForSkill(
  entry: ReviewEntry,
  keySkillId: string | null | undefined,
): PendingSuggestionCandidate | null {
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

function buildUnifiedReviewItemsForEntry(
  entry: ReviewEntry,
  auditResult: AuditEntryResult | undefined,
  reviewWorkstream: "audit" | "suggestions",
  auditItemFilter: AuditItemFilter,
  currentAuditDecisionMap: Record<string, { decision: string }> = {},
): UnifiedReviewItem[] {
  const suggestionItems: UnifiedReviewItem[] = pendingSuggestionsForEntry(
    entry,
    auditResult,
  ).map((suggestion) => ({
    itemKey: `suggestion:${suggestion.suggestion_id}`,
    kind: "suggestion",
    entryId: entry.id,
    title: suggestion.key_skill_title,
    subtitle: `CiP ${suggestion.cip_number} · ${suggestion.source === "cross_cip" ? "From another CiP" : "Same CiP"}`,
    rationale: suggestion.rationale,
    confidence:
      typeof suggestion.confidence === "number" && suggestion.confidence > 0
        ? suggestion.confidence
        : null,
    recommendation: null,
    suggestionId: suggestion.suggestion_id ?? null,
    suggestionSource: suggestion.source,
    swipeRightLabel: "Accept",
    swipeLeftLabel: "Skip",
  }));

  const candidateRecommendations = Array.isArray(auditResult?.candidate_recommendations)
    ? auditResult.candidate_recommendations
    : [];
  const currentLinkedSkills = Array.isArray(auditResult?.current_linked_skills)
    ? auditResult.current_linked_skills
    : [];
  const rebalanceItems: UnifiedReviewItem[] = [];

  if (auditResult?.audit_link_plan?.mode === "rebalance") {
    const planSkills = Array.isArray(auditResult.audit_link_plan.skills)
      ? auditResult.audit_link_plan.skills
      : [];

    for (const skill of planSkills) {
      if (skill.decision !== "remove" && skill.decision !== "replace_in") continue;

      if (skill.decision === "remove") {
        const matchingRecommendation =
          candidateRecommendations.find(
            (candidate) =>
              candidate.action === "remove" &&
              candidate.key_skill_id === skill.key_skill_id,
          ) ?? null;
        const kaizenSkillId =
          currentLinkedSkills.find((linked) => linked.key_skill_id === skill.key_skill_id)
            ?.kaizen_id ??
          entry.kaizen_linked_skills?.find((linked) => linked.key_skill_id === skill.key_skill_id)
            ?.kaizen_id ??
          null;

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

        rebalanceItems.push({
          itemKey: `remove:${skill.key_skill_id}`,
          kind: "remove",
          entryId: entry.id,
          title: skill.key_skill_title,
          subtitle: `CiP ${skill.cip_number}`,
          rationale: skill.rationale,
          confidence:
            typeof skill.confidence === "number" && skill.confidence > 0
              ? skill.confidence
              : null,
          recommendation,
          suggestionId:
            recommendation && typeof recommendation.suggestion_id === "string"
              ? recommendation.suggestion_id
              : null,
          suggestionSource:
            recommendation && typeof recommendation.suggestion_id === "string"
              ? findSuggestionSource(entry, recommendation.suggestion_id)
              : null,
          swipeRightLabel: "Apply",
          swipeLeftLabel: "Keep as is",
          reviewDecisionKey: `remove:${skill.key_skill_id}`,
        });
        continue;
      }

      const matchingRecommendation =
        candidateRecommendations.find(
          (candidate) =>
            candidate.action === "replace" &&
            candidate.key_skill_id === skill.key_skill_id &&
            candidate.replace_skill_id === skill.replace_skill_id,
        ) ?? null;
      const backingSuggestion =
        findSuggestionForSkill(entry, skill.key_skill_id) ??
        (typeof matchingRecommendation?.suggestion_id === "string"
          ? {
              suggestion_id: matchingRecommendation.suggestion_id,
              source:
                findSuggestionSource(entry, matchingRecommendation.suggestion_id) ?? "cross_cip",
            }
          : null);
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

      rebalanceItems.push({
        itemKey: `replace:${skill.key_skill_id}:${skill.replace_skill_id ?? ""}`,
        kind: "replace",
        entryId: entry.id,
        title: skill.key_skill_title,
        subtitle: `Instead of ${skill.replace_skill_title ?? "the current linked skill"}`,
        rationale: skill.rationale,
        confidence:
          typeof skill.confidence === "number" && skill.confidence > 0
            ? skill.confidence
            : null,
        recommendation,
        suggestionId:
          recommendation && typeof recommendation.suggestion_id === "string"
            ? recommendation.suggestion_id
            : null,
        suggestionSource:
          recommendation && typeof recommendation.suggestion_id === "string"
            ? findSuggestionSource(entry, recommendation.suggestion_id)
            : null,
        swipeRightLabel: "Apply",
        swipeLeftLabel: "Keep as is",
        reviewDecisionKey: `replace:${skill.key_skill_id}:${skill.replace_skill_id ?? ""}`,
      });
    }
  } else if (auditResult?.overlinked === true) {
    const fallbackRows = candidateRecommendations
      .filter(
        (
          candidate,
        ): candidate is AuditCandidateRecommendation & {
          action: "remove" | "replace";
        } => candidate.action === "remove" || candidate.action === "replace",
      )
      .sort((a, b) => {
        const actionRank = (value: "remove" | "replace") => (value === "remove" ? 0 : 1);
        const rankDelta = actionRank(a.action) - actionRank(b.action);
        if (rankDelta !== 0) return rankDelta;
        return b.confidence - a.confidence;
      });

    for (const candidate of fallbackRows) {
      rebalanceItems.push({
        itemKey: `${candidate.action}:${candidate.key_skill_id}:${candidate.replace_skill_id ?? ""}`,
        kind: candidate.action,
        entryId: entry.id,
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
        suggestionId:
          typeof candidate.suggestion_id === "string" ? candidate.suggestion_id : null,
        suggestionSource:
          typeof candidate.suggestion_id === "string"
            ? findSuggestionSource(entry, candidate.suggestion_id)
            : null,
        swipeRightLabel: "Apply",
        swipeLeftLabel: "Keep as is",
        reviewDecisionKey:
          candidate.action === "replace"
            ? `replace:${candidate.key_skill_id}:${candidate.replace_skill_id ?? ""}`
            : `remove:${candidate.key_skill_id}`,
      });
    }
  }

  const filteredRebalanceItems = rebalanceItems.filter((item) => {
    const key = item.reviewDecisionKey;
    return !key || !(key in currentAuditDecisionMap);
  });

  if (reviewWorkstream === "audit") {
    if (auditItemFilter === "overlinked") {
      return filteredRebalanceItems;
    }
    if (auditItemFilter === "replace") {
      return filteredRebalanceItems.filter((item) => item.kind === "replace");
    }
    if (auditItemFilter === "awaiting_sync" || auditItemFilter === "flag") {
      return [];
    }
  }

  return reviewWorkstream === "audit"
    ? [...filteredRebalanceItems, ...suggestionItems]
    : [...suggestionItems, ...filteredRebalanceItems];
}

export function ReviewQueue({
  entries,
  statusFilter,
  sourceFilter,
  confidenceFilter,
  query,
  mode,
  focusReviewMode = "classic",
  onUpdateSuggestion,
  disabled,
  progressFocusEntryId = null,
  progressFocusSkillId = null,
  progressFocusDescriptorId = null,
  onUndoLastAction = null,
  canUndoLastAction = false,
  onRequestExitSwipeMode = null,
  auditResultsByEntryId = {},
  onApplyAuditRecommendation,
  pendingRemovalCountByEntryId = {},
  onUnlinkKaizenSkill,
  reviewWorkstream = "suggestions",
  auditItemFilter = "all",
  appliedAuditRecommendationKeys = {},
  onRecordAuditReviewDecision,
}: ReviewQueueProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [focusIndex, setFocusIndex] = useState(0);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [navigationDirection, setNavigationDirection] = useState<"next" | "prev">("next");
  const [swipeDragX, setSwipeDragX] = useState(0);
  const [swipeAnimating, setSwipeAnimating] = useState<"confirm" | "reject" | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [reviewedItemDecisions, setReviewedItemDecisions] = useState<Record<string, "acted" | "declined">>({});
  const swipeStartX = useRef<number | null>(null);

  const visibleEntries = useMemo(() => {
    return entries
      .map((entry) => {
        const { linked, cross } = filterSuggestionsForEntry(entry, {
          query,
          status: statusFilter,
          source: sourceFilter,
          confidence: confidenceFilter,
        });

        const filteredEntry = {
          ...entry,
          linked_cip_suggestions: linked,
          cross_cip_suggestions: cross,
        };
        const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
          filteredEntry.audit_review_decisions,
          auditResultsByEntryId[entry.id]?.audit_input_fingerprint ?? null,
        );
        const hasReviewItems =
          buildUnifiedReviewItemsForEntry(
            filteredEntry,
            auditResultsByEntryId[entry.id],
            reviewWorkstream,
            auditItemFilter,
            currentAuditDecisionMap,
          ).length > 0;

        if (!hasReviewItems) return null;

        return filteredEntry;
      })
      .filter((e): e is ReviewEntry => e !== null);
  }, [
    entries,
    statusFilter,
    sourceFilter,
    confidenceFilter,
    query,
    auditResultsByEntryId,
    reviewWorkstream,
    auditItemFilter,
  ]);

  const reviewItemsByEntryId = useMemo(() => {
    const out = new Map<string, UnifiedReviewItem[]>();
    for (const entry of visibleEntries) {
      const currentAuditDecisionMap = buildCurrentAuditDecisionMap(
        entry.audit_review_decisions,
        auditResultsByEntryId[entry.id]?.audit_input_fingerprint ?? null,
      );
      const items = buildUnifiedReviewItemsForEntry(
        entry,
        auditResultsByEntryId[entry.id],
        reviewWorkstream,
        auditItemFilter,
        currentAuditDecisionMap,
      ).filter(
        (item) =>
          !(item.itemKey in reviewedItemDecisions) &&
          !(item.itemKey in appliedAuditRecommendationKeys),
      );
      out.set(entry.id, items);
    }
    return out;
  }, [
    appliedAuditRecommendationKeys,
    auditResultsByEntryId,
    reviewWorkstream,
    auditItemFilter,
    reviewedItemDecisions,
    visibleEntries,
  ]);

  const reviewItemCountsByEntryId = useMemo(() => {
    const out = new Map<string, number>();
    for (const [entryId, items] of reviewItemsByEntryId.entries()) {
      out.set(entryId, items.length);
    }
    return out;
  }, [reviewItemsByEntryId]);

  const reviewableEntryIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < visibleEntries.length; i += 1) {
      const entry = visibleEntries[i];
      if (!entry) continue;
      if ((reviewItemCountsByEntryId.get(entry.id) ?? 0) > 0) out.push(i);
    }
    return out;
  }, [reviewItemCountsByEntryId, visibleEntries]);

  const totalReviewItemsAcrossVisible = useMemo(
    () => [...reviewItemCountsByEntryId.values()].reduce((acc, n) => acc + n, 0),
    [reviewItemCountsByEntryId],
  );

  const activeIndex = Math.min(focusIndex, Math.max(visibleEntries.length - 1, 0));
  const activeEntry = visibleEntries[activeIndex] ?? null;
  const activeEntryReviewCount = activeEntry ? reviewItemCountsByEntryId.get(activeEntry.id) ?? 0 : 0;
  const activeAuditResult = activeEntry ? auditResultsByEntryId[activeEntry.id] : undefined;
  const activeReviewItems = useMemo(
    () => (activeEntry ? reviewItemsByEntryId.get(activeEntry.id) ?? [] : []),
    [activeEntry, reviewItemsByEntryId],
  );
  const activeAllReviewItems = useMemo(
    () =>
      activeEntry
        ? buildUnifiedReviewItemsForEntry(
            activeEntry,
            auditResultsByEntryId[activeEntry.id],
            reviewWorkstream,
            auditItemFilter,
            buildCurrentAuditDecisionMap(
              activeEntry.audit_review_decisions,
              auditResultsByEntryId[activeEntry.id]?.audit_input_fingerprint ?? null,
            ),
          )
        : [],
    [activeEntry, auditItemFilter, auditResultsByEntryId, reviewWorkstream],
  );
  const activeReviewItem = activeReviewItems[0] ?? null;
  const nextReviewItem = activeReviewItems[1] ?? null;
  const activeEntryNarrativeSections = useMemo(
    () =>
      activeEntry
        ? structureEntryNarrative(activeEntry.raw_text ?? "", activeEntry.title ?? "")
        : [],
    [activeEntry],
  );
  const activeEntryReviewReason = useMemo(
    () =>
      activeEntry
        ? buildEntryReviewReason(
            activeEntry,
            auditResultsByEntryId[activeEntry.id],
            activeEntryReviewCount,
            activeReviewItems,
            reviewWorkstream,
            auditItemFilter,
          )
        : "",
    [
      activeEntry,
      activeEntryReviewCount,
      activeReviewItems,
      auditItemFilter,
      auditResultsByEntryId,
      reviewWorkstream,
    ],
  );

  const nextReviewableIndex = useMemo(() => {
    if (reviewableEntryIndices.length === 0) return null;
    for (const idx of reviewableEntryIndices) {
      if (idx > activeIndex) return idx;
    }
    return reviewableEntryIndices[0] ?? null;
  }, [activeIndex, reviewableEntryIndices]);

  const prevReviewableIndex = useMemo(() => {
    if (reviewableEntryIndices.length === 0) return null;
    for (let i = reviewableEntryIndices.length - 1; i >= 0; i -= 1) {
      const idx = reviewableEntryIndices[i];
      if (idx < activeIndex) return idx;
    }
    return reviewableEntryIndices[reviewableEntryIndices.length - 1] ?? null;
  }, [activeIndex, reviewableEntryIndices]);

  const navigateToIndex = useCallback(
    (targetIndex: number) => {
      if (targetIndex === focusIndex) return;
      setSwipeDragX(0);
      setIsSwiping(false);
      setSwipeAnimating(null);
      swipeStartX.current = null;
      setNavigationDirection(targetIndex > focusIndex ? "next" : "prev");
      setFocusIndex(targetIndex);
    },
    [focusIndex],
  );

  const goToNextReviewable = useCallback(() => {
    if (nextReviewableIndex == null) return;
    navigateToIndex(nextReviewableIndex);
  }, [navigateToIndex, nextReviewableIndex]);

  const goToPrevReviewable = useCallback(() => {
    if (prevReviewableIndex == null) return;
    navigateToIndex(prevReviewableIndex);
  }, [navigateToIndex, prevReviewableIndex]);

  const updateSuggestionWithAutoAdvance = useCallback(
    (
      entryId: string,
      suggestionId: string,
      source: "linked_cip" | "cross_cip",
      nextStatus: "suggested" | "confirmed" | "rejected",
    ) => {
      onUpdateSuggestion(entryId, suggestionId, source, nextStatus);
    },
    [onUpdateSuggestion],
  );

  const findNextReviewableIndexFrom = useCallback(
    (entryIndex: number) => {
      for (let i = entryIndex + 1; i < visibleEntries.length; i += 1) {
        const candidate = visibleEntries[i];
        if (!candidate) continue;
        if ((reviewItemCountsByEntryId.get(candidate.id) ?? 0) > 0) return i;
      }
      for (let i = 0; i < entryIndex; i += 1) {
        const candidate = visibleEntries[i];
        if (!candidate) continue;
        if ((reviewItemCountsByEntryId.get(candidate.id) ?? 0) > 0) return i;
      }
      return null;
    },
    [reviewItemCountsByEntryId, visibleEntries],
  );

  const completeReviewItem = useCallback(
    async (item: UnifiedReviewItem, direction: "right" | "left") => {
      const entryIndex = visibleEntries.findIndex((entry) => entry.id === item.entryId);
      const currentCount = reviewItemCountsByEntryId.get(item.entryId) ?? 0;
      const shouldAdvance =
        mode === "focus" && autoAdvanceEnabled && currentCount <= 1 && entryIndex >= 0;

      if (item.kind === "suggestion") {
        if (!item.suggestionId || !item.suggestionSource) return;
        updateSuggestionWithAutoAdvance(
          item.entryId,
          item.suggestionId,
          item.suggestionSource,
          direction === "right" ? "confirmed" : "rejected",
        );
      } else if (direction === "right") {
        if (item.recommendation && onApplyAuditRecommendation) {
          await onApplyAuditRecommendation(item.entryId, item.recommendation);
        } else {
          return;
        }
      } else {
        if (item.suggestionId && item.suggestionSource) {
          updateSuggestionWithAutoAdvance(
            item.entryId,
            item.suggestionId,
            item.suggestionSource,
            "rejected",
          );
        }
        if (
          item.reviewDecisionKey &&
          item.recommendation &&
          onRecordAuditReviewDecision
        ) {
          const auditFingerprint =
            auditResultsByEntryId[item.entryId]?.audit_input_fingerprint ?? null;
          if (auditFingerprint) {
            await onRecordAuditReviewDecision({
              review_entry_id: item.entryId,
              recommendation_key: item.reviewDecisionKey,
              decision: "kept",
              audit_input_fingerprint: auditFingerprint,
              action: item.kind,
              key_skill_id: item.recommendation.key_skill_id,
              replace_skill_id: item.recommendation.replace_skill_id ?? null,
              key_skill_title: item.recommendation.key_skill_title,
              replace_skill_title: item.recommendation.replace_skill_title ?? null,
            });
          }
        }
      }

      setReviewedItemDecisions((current) => ({
        ...current,
        [item.itemKey]: direction === "right" ? "acted" : "declined",
      }));

      if (shouldAdvance) {
        const nextIndex = findNextReviewableIndexFrom(entryIndex);
        if (nextIndex != null) {
          navigateToIndex(nextIndex);
        }
      }
    },
    [
      autoAdvanceEnabled,
      findNextReviewableIndexFrom,
      mode,
      navigateToIndex,
      onRecordAuditReviewDecision,
      onApplyAuditRecommendation,
      auditResultsByEntryId,
      reviewItemCountsByEntryId,
      updateSuggestionWithAutoAdvance,
      visibleEntries,
    ],
  );

  const applyDecisionToActiveItem = useCallback(
    (direction: "right" | "left") => {
      if (!activeReviewItem || disabled || swipeAnimating) return;
      void completeReviewItem(activeReviewItem, direction);
    },
    [activeReviewItem, completeReviewItem, disabled, swipeAnimating],
  );

  const commitSpotlightDecision = useCallback(
    (direction: "right" | "left") => {
      if (!activeReviewItem) return;
      if (swipeAnimating) return;

      setSwipeAnimating(direction === "right" ? "confirm" : "reject");
      setSwipeDragX(0);
      setIsSwiping(false);
      swipeStartX.current = null;

      window.setTimeout(() => {
        void completeReviewItem(activeReviewItem, direction);
        setSwipeAnimating(null);
        setSwipeDragX(0);
        setIsSwiping(false);
      }, 280);
    },
    [activeReviewItem, completeReviewItem, swipeAnimating],
  );

  const handleSpotlightPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeReviewItem || disabled || swipeAnimating) return;
    swipeStartX.current = e.clientX;
    setIsSwiping(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [activeReviewItem, disabled, swipeAnimating]);

  const handleSpotlightPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSwiping) return;
    const startX = swipeStartX.current;
    if (startX == null) return;
    const delta = e.clientX - startX;
    const clamped = Math.max(-180, Math.min(180, delta));
    setSwipeDragX(clamped);
  }, [isSwiping]);

  const finishSpotlightSwipe = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);
    swipeStartX.current = null;
    if (swipeDragX >= SWIPE_THRESHOLD_PX) {
      commitSpotlightDecision("right");
      return;
    }
    if (swipeDragX <= -SWIPE_THRESHOLD_PX) {
      commitSpotlightDecision("left");
      return;
    }
    setSwipeDragX(0);
  }, [commitSpotlightDecision, isSwiping, swipeDragX]);

  useEffect(() => {
    if (!progressFocusEntryId || mode !== "focus") return;
    const idx = visibleEntries.findIndex((e) => e.id === progressFocusEntryId);
    if (idx < 0) return;
    const id = window.requestAnimationFrame(() => {
      navigateToIndex(idx);
    });
    return () => window.cancelAnimationFrame(id);
  }, [navigateToIndex, progressFocusEntryId, mode, visibleEntries]);

  useEffect(() => {
    if (mode !== "focus") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const active = document.activeElement;
      if (isEditableTarget(active)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && focusReviewMode === "swipe" && onRequestExitSwipeMode) {
        e.preventDefault();
        onRequestExitSwipeMode();
        return;
      }
      const key = e.key.toLowerCase();
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (focusReviewMode === "swipe") {
          commitSpotlightDecision("right");
        } else {
          applyDecisionToActiveItem("right");
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (focusReviewMode === "swipe") {
          commitSpotlightDecision("left");
        } else {
          applyDecisionToActiveItem("left");
        }
        return;
      }
      if (key === "n") {
        e.preventDefault();
        goToNextReviewable();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        goToPrevReviewable();
        return;
      }
      if (key === "u" && canUndoLastAction && onUndoLastAction) {
        e.preventDefault();
        onUndoLastAction();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    applyDecisionToActiveItem,
    commitSpotlightDecision,
    canUndoLastAction,
    focusReviewMode,
    goToNextReviewable,
    goToPrevReviewable,
    mode,
    onRequestExitSwipeMode,
    onUndoLastAction,
  ]);

  useEffect(() => {
    if (mode !== "focus" || focusReviewMode !== "swipe") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [focusReviewMode, mode]);

  const cardFocusProps = (entryId: string) => {
    if (!progressFocusEntryId || entryId !== progressFocusEntryId) {
      return {
        highlightSkillId: null as string | null,
        highlightDescriptorId: null as string | null,
        descriptorPanelInitialOpen: false,
        expandedByDefault: false,
      };
    }
    return {
      highlightSkillId: progressFocusSkillId,
      highlightDescriptorId: progressFocusDescriptorId,
      descriptorPanelInitialOpen: Boolean(progressFocusDescriptorId && progressFocusSkillId),
      expandedByDefault: true,
    };
  };

  if (visibleEntries.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="text-small font-semibold text-primary mb-1.5">Review queue</h2>
        <p className="text-micro text-muted">
          No entries match your filters. Try clearing a filter or broadening your search.
        </p>
      </section>
    );
  }

  if (mode === "focus") {
    if (!activeEntry) return null;

    const activeEntryTarget = Math.max(
      1,
      Number(
        activeAuditResult?.effective_target ??
          RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
      ) || RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
    );
    const activeEntryConfirmedSuggestions = [
      ...activeEntry.linked_cip_suggestions,
      ...activeEntry.cross_cip_suggestions,
    ].filter((suggestion) => suggestion.status === "confirmed");
    const activeEntryConfirmedCount = activeEntryConfirmedSuggestions.length;
    const activeEntryLinkedTitles = activeEntryConfirmedSuggestions
      .map((suggestion) => suggestion.key_skill_title.trim())
      .filter(Boolean);
    const activeEntrySlotsRemaining = Math.max(0, activeEntryTarget - activeEntryConfirmedCount);
    const activeSuggestionProjectedCount =
      activeReviewItem?.kind === "suggestion" ? activeEntryConfirmedCount + 1 : activeEntryConfirmedCount;
    const actedAuditItemsForEntry = activeAllReviewItems.filter(
      (item) =>
        item.kind !== "suggestion" &&
        reviewedItemDecisions[item.itemKey] === "acted",
    );
    const baseCurrentLinkedSkills =
      Array.isArray(activeAuditResult?.current_linked_skills) &&
      activeAuditResult.current_linked_skills.length > 0
        ? activeAuditResult.current_linked_skills.map((skill) => ({
            key_skill_id: skill.key_skill_id,
            key_skill_title: skill.key_skill_title,
          }))
        : Array.isArray(activeEntry.kaizen_linked_skills)
          ? activeEntry.kaizen_linked_skills.map((skill) => ({
              key_skill_id: skill.key_skill_id,
              key_skill_title: skill.key_skill_title,
            }))
          : [];
    const effectiveCurrentLinkedSkills = [...baseCurrentLinkedSkills];
    for (const item of actedAuditItemsForEntry) {
      if (item.kind === "remove") {
        const removeIndex = effectiveCurrentLinkedSkills.findIndex(
          (skill) => skill.key_skill_id === item.recommendation?.key_skill_id,
        );
        if (removeIndex >= 0) {
          effectiveCurrentLinkedSkills.splice(removeIndex, 1);
        }
      }
      if (item.kind === "replace") {
        const outgoingSkillId = item.recommendation?.replace_skill_id ?? null;
        const outgoingIndex = effectiveCurrentLinkedSkills.findIndex(
          (skill) => skill.key_skill_id === outgoingSkillId,
        );
        if (outgoingIndex >= 0) {
          effectiveCurrentLinkedSkills.splice(outgoingIndex, 1);
        }
        if (item.recommendation?.key_skill_id && item.recommendation.key_skill_title) {
          effectiveCurrentLinkedSkills.push({
            key_skill_id: item.recommendation.key_skill_id,
            key_skill_title: item.recommendation.key_skill_title,
          });
        }
      }
    }
    const effectiveCurrentLinkedCount = effectiveCurrentLinkedSkills.length;
    const effectiveCurrentLinkedTitles = effectiveCurrentLinkedSkills
      .map((skill) => skill.key_skill_title.trim())
      .filter(Boolean);
    const effectiveOverCapBy = Math.max(0, effectiveCurrentLinkedCount - activeEntryTarget);
    const projectedAuditLinkedCount =
      activeReviewItem?.kind === "remove"
        ? Math.max(0, effectiveCurrentLinkedCount - 1)
        : effectiveCurrentLinkedCount;
    const projectedAuditOverCapBy = Math.max(0, projectedAuditLinkedCount - activeEntryTarget);

    const totalSuggestions =
      activeEntry.linked_cip_suggestions.length +
      activeEntry.cross_cip_suggestions.length;
    const pendingSuggestions =
      activeEntry.linked_cip_suggestions.filter((s) => s.status === "suggested")
        .length +
      activeEntry.cross_cip_suggestions.filter((s) => s.status === "suggested")
        .length;
    const reviewedPct =
      totalSuggestions === 0
        ? 0
        : Math.round(((totalSuggestions - pendingSuggestions) / totalSuggestions) * 100);
    const progressPct =
      visibleEntries.length === 1
        ? 100
        : Math.round((activeIndex / (visibleEntries.length - 1)) * 100);

    const quickActionDisabled = activeEntryReviewCount <= 0 || disabled || swipeAnimating !== null;
    const swipeAbs = Math.abs(swipeDragX);
    const swipeProgress = Math.min(1, swipeAbs / SWIPE_THRESHOLD_PX);
    const swipeTrackX = Math.max(-52, Math.min(52, swipeDragX * 0.35));
    const swipeScale = 1 - Math.min(0.015, swipeAbs / 4200);
    const swipeTiltStyle = {
      transform: swipeAnimating
        ? "scale(0.985)"
        : `translateX(${swipeTrackX}px) scale(${swipeScale})`,
      opacity: swipeAnimating ? 0 : 1,
      boxShadow:
        swipeAnimating === "confirm"
          ? "0 0 0 3px rgba(52, 199, 89, 0.28)"
          : swipeAnimating === "reject"
            ? "0 0 0 3px rgba(255, 69, 58, 0.24)"
            : swipeDragX >= 18
              ? "0 0 0 2px rgba(52, 199, 89, 0.18)"
              : swipeDragX <= -18
                ? "0 0 0 2px rgba(255, 69, 58, 0.16)"
                : undefined,
      transition: isSwiping
        ? "none"
        : swipeAnimating
          ? "background-color 90ms ease, border-color 90ms ease, box-shadow 90ms ease, opacity 200ms ease 70ms, transform 200ms ease 70ms"
          : "transform 180ms cubic-bezier(0.2, 0.75, 0.2, 1), opacity 180ms cubic-bezier(0.2, 0.75, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.75, 0.2, 1)",
    } as const;
    const stackedCardStyle = {
      transform: `translateY(${swipeAnimating ? 0 : Math.max(0, 10 - swipeProgress * 10)}px) scale(${swipeAnimating ? 1 : 0.97 + swipeProgress * 0.03})`,
      opacity: nextReviewItem
        ? swipeAnimating
          ? 0.96
          : 0.62 + swipeProgress * 0.28
        : swipeAnimating
          ? 0.62
          : 0.5,
      transition: isSwiping
        ? "none"
        : "transform 220ms cubic-bezier(0.2, 0.75, 0.2, 1), opacity 220ms cubic-bezier(0.2, 0.75, 0.2, 1)",
    } as const;
    const swipeTintClass =
      swipeAnimating === "confirm"
        ? "border-accent-green/55 bg-accent-green/18"
        : swipeAnimating === "reject"
          ? "border-accent-red/55 bg-accent-red/18"
          : swipeDragX >= 18
        ? "border-accent-green/35 bg-accent-green/6"
        : swipeDragX <= -18
          ? "border-accent-red/35 bg-accent-red/6"
          : "border-subtle bg-surface-1";

    return (
      <section className="space-y-3">
        {focusReviewMode !== "swipe" && (
          <div className="sticky top-3 z-10 space-y-3 rounded-xl border border-subtle bg-surface-2/95 p-3 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Focus mode
                </p>
                <h2 className="text-small font-semibold text-primary">
                  Entry {activeIndex + 1} of {visibleEntries.length}
                  <span className="font-normal text-muted"> · </span>
                  {activeEntryReviewCount} decision
                  {activeEntryReviewCount === 1 ? "" : "s"} left on this entry
                </h2>
                <p className="text-[11px] text-secondary">
                  {totalReviewItemsAcrossVisible} left in queue
                  {activeEntryReviewReason ? (
                    <>
                      {" "}
                      · {activeEntryReviewReason}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPrevReviewable}
                  disabled={prevReviewableIndex == null}
                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: P"
                >
                  Previous (P)
                </button>
                <button
                  type="button"
                  onClick={goToNextReviewable}
                  disabled={nextReviewableIndex == null}
                  className="btn-primary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: N"
                >
                  Next (N)
                </button>
                <button
                  type="button"
                  onClick={onUndoLastAction ?? undefined}
                  disabled={!canUndoLastAction || !onUndoLastAction}
                  className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Shortcut: U"
                >
                  Undo (U)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-2">
              <label className="inline-flex items-center gap-2 text-[11px] text-secondary">
                <input
                  type="checkbox"
                  checked={autoAdvanceEnabled}
                  onChange={(e) => setAutoAdvanceEnabled(e.target.checked)}
                />
                Auto-advance when an entry is finished
              </label>
            </div>

            <details className="rounded-lg border border-subtle bg-surface-1 p-3">
              <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                More navigation and progress
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateToIndex(Math.max(activeIndex - 1, 0))}
                  disabled={activeIndex === 0}
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous entry
                </button>
                <button
                  type="button"
                  onClick={() => navigateToIndex(Math.min(activeIndex + 1, visibleEntries.length - 1))}
                  disabled={activeIndex >= visibleEntries.length - 1}
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next entry
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg border border-subtle bg-surface-2 px-3 py-2 text-[11px] text-secondary">
                  {reviewedPct}% reviewed for this entry
                </p>
                <p className="rounded-lg border border-subtle bg-surface-2 px-3 py-2 text-[11px] text-secondary">
                  {totalSuggestions - pendingSuggestions} decision
                  {totalSuggestions - pendingSuggestions === 1 ? "" : "s"} already made
                </p>
              </div>
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-4">
                  <div
                    className="h-full rounded-full bg-surface-5 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </details>
          </div>
        )}

        {focusReviewMode !== "swipe" && totalReviewItemsAcrossVisible === 0 && (
          <div className="relative overflow-hidden rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-xs text-accent-green">
            <div className="pointer-events-none absolute -top-8 right-6 h-16 w-16 rounded-full bg-accent-green/15 blur-2xl" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">Queue complete</p>
	            <p className="mt-1 text-sm font-semibold text-primary">
	              {reviewWorkstream === "audit"
                  ? "Audit review complete."
                  : "Every review item in this filtered queue has been reviewed."}
	            </p>
            <p className="mt-1 text-xs text-secondary">
              {reviewWorkstream === "audit"
                ? "Run Kaizen Sync, then Audit again when you want a fresh pass."
                : "Strong finish. You can switch filters for another pass or move to list mode for final cleanup."}
            </p>
          </div>
        )}

        {focusReviewMode === "swipe" ? (
          <div className="fixed inset-0 z-[70] overflow-y-auto">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-md"
              onClick={onRequestExitSwipeMode ?? undefined}
              aria-hidden
            />
            <div className="relative z-[71] flex min-h-full items-start justify-center p-4 md:p-6">
              <article
                role="dialog"
                aria-modal="true"
                aria-label="Swipe spotlight review"
                className="my-2 w-full max-w-2xl rounded-2xl border border-subtle bg-surface-2/95 p-4 shadow-2xl md:my-4 md:p-5"
              >
                <div
                  key={`${activeEntry.id}:${activeReviewItem?.itemKey ?? "none"}:${navigationDirection}`}
                  className={
                    navigationDirection === "next"
                      ? "animate-entry-in-next"
                      : "animate-entry-in-prev"
                  }
                >
                  {!(totalReviewItemsAcrossVisible === 0 && !activeReviewItem) && (
                    <header className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                      <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                            Swipe spotlight
                          </p>
	                          <h3 className="text-small font-semibold text-primary">{activeEntry.title}</h3>
	                          <p className="text-[11px] text-secondary">
	                            Entry {activeIndex + 1} of {visibleEntries.length} · {activeEntryReviewCount}{" "}
                              decision{activeEntryReviewCount === 1 ? "" : "s"} on this entry ·{" "}
                              {totalReviewItemsAcrossVisible} left in queue
	                          </p>
	                          {activeEntryReviewReason ? (
	                            <p className="mt-1 text-[11px] text-muted">{activeEntryReviewReason}</p>
	                          ) : null}
	                        </div>
                        {onRequestExitSwipeMode && (
                          <button
                            type="button"
                            onClick={onRequestExitSwipeMode}
                            className="btn-secondary text-[11px]"
                            title="Shortcut: Esc"
                          >
                            Exit (Esc)
                          </button>
                        )}
                      </div>
                    </header>
                  )}

                  {activeReviewItem ? (
                    <div className="mt-4 space-y-2.5">
                      <div className="relative min-h-[200px]">
                        <div
                          className="pointer-events-none absolute inset-x-2 top-2 rounded-2xl border border-subtle bg-surface-1/80 p-4"
                          style={stackedCardStyle}
                          aria-hidden
                        >
                          {nextReviewItem ? (
                            <div className="space-y-2">
                              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                                Up next
                              </p>
	                              <div className="flex items-start justify-between gap-2">
	                                <div>
	                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
	                                    {reviewItemKindLabel(nextReviewItem.kind)}
	                                  </p>
	                                  <p className="text-xs font-semibold text-primary">
	                                    {nextReviewItem.title}
	                                  </p>
                                  <p className="text-[11px] text-muted">
                                    {nextReviewItem.subtitle}
                                  </p>
                                </div>
                                <span className="rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-secondary">
                                  {nextReviewItem.confidence != null
                                    ? `${Math.round(nextReviewItem.confidence * 100)}%`
                                    : "Queued"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted">No more review items after this one.</p>
                          )}
                        </div>

                        <div
                          className={`relative touch-pan-y rounded-2xl border p-4 shadow-sm ${swipeTintClass}`}
                          style={swipeTiltStyle}
                          onPointerDown={handleSpotlightPointerDown}
                          onPointerMove={handleSpotlightPointerMove}
                          onPointerUp={finishSpotlightSwipe}
                          onPointerCancel={finishSpotlightSwipe}
                        >
                            <div className="space-y-3">
	                            <div className="flex items-start justify-between gap-2">
	                              <div>
	                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
	                                  {reviewItemKindLabel(activeReviewItem.kind)}
	                                </p>
	                                <p className="text-xs font-semibold text-primary">
	                                  {activeReviewItem.title}
	                                </p>
                                <p className="text-[11px] text-muted">
                                  {activeReviewItem.subtitle}
                                </p>
                              </div>
                              <span className="rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-secondary">
                                {activeReviewItem.confidence != null
                                  ? `${Math.round(activeReviewItem.confidence * 100)}%`
                                  : "Review"}
                              </span>
                            </div>
                            {activeReviewItem.kind === "suggestion" && (
                              <div className="rounded-xl border border-subtle bg-surface-2/85 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                                    Current links
                                  </p>
                                  <p className="text-[11px] font-medium text-primary">
                                    {activeEntryConfirmedCount} of {activeEntryTarget} linked
                                  </p>
                                  <p className="text-[11px] text-secondary">
                                    {activeEntrySlotsRemaining} slot{activeEntrySlotsRemaining === 1 ? "" : "s"} left
                                  </p>
                                </div>
                                <p className="mt-1 text-[11px] text-secondary">
                                  Accepting this would make it {activeSuggestionProjectedCount} of {activeEntryTarget}.
                                </p>
                                {activeEntryLinkedTitles.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {activeEntryLinkedTitles.map((title, index) => (
                                      <span
                                        key={`active-linked-${activeEntry.id}-${index}-${title}`}
                                        className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-secondary"
                                      >
                                        {title}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-[11px] text-muted">
                                    No links confirmed on this entry yet.
                                  </p>
                                )}
                              </div>
                            )}
                            {activeReviewItem.kind !== "suggestion" && (
                              <div className="rounded-xl border border-subtle bg-surface-2/85 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                                    Current links
                                  </p>
                                  <p className="text-[11px] font-medium text-primary">
                                    {effectiveCurrentLinkedCount} of {activeEntryTarget} linked
                                  </p>
                                  <p className="text-[11px] text-secondary">
                                    {effectiveOverCapBy > 0
                                      ? `${effectiveOverCapBy} over limit`
                                      : "Within target"}
                                  </p>
                                </div>
                                <p className="mt-1 text-[11px] text-secondary">
                                  {activeReviewItem.kind === "remove"
                                    ? `Acting on this would make it ${projectedAuditLinkedCount} of ${activeEntryTarget}${
                                        projectedAuditOverCapBy > 0 ? `, still ${projectedAuditOverCapBy} over limit` : ""
                                      }.`
                                    : `Replacing this would keep it at ${projectedAuditLinkedCount} of ${activeEntryTarget}${
                                        projectedAuditOverCapBy > 0 ? `, still ${projectedAuditOverCapBy} over limit` : ""
                                      }.`}
                                </p>
                                {effectiveCurrentLinkedTitles.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {effectiveCurrentLinkedTitles.map((title, index) => (
                                      <span
                                        key={`active-current-linked-${activeEntry.id}-${index}-${title}`}
                                        className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-secondary"
                                      >
                                        {title}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-[11px] text-muted">
                                    No current links found on this entry.
                                  </p>
                                )}
                              </div>
                            )}
                            {activeReviewItem.rationale && (
                              <p className="text-[12px] leading-relaxed text-secondary">
                                {activeReviewItem.rationale}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted">
                          Swipe left to {activeReviewItem.swipeLeftLabel.toLowerCase()}, right to {activeReviewItem.swipeRightLabel.toLowerCase()}.
                        </p>
                        {nextReviewItem ? (
                          <p className="text-[11px] text-secondary">
                            Up next: {nextReviewItem.title}
                          </p>
                        ) : (
                          <p className="text-[11px] text-secondary">Last review item for this entry.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => commitSpotlightDecision("left")}
                          disabled={quickActionDisabled}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: Left Arrow"
                        >
                          {activeReviewItem.swipeLeftLabel} (Left Arrow)
                        </button>
                        <button
                          type="button"
                          onClick={() => commitSpotlightDecision("right")}
                          disabled={quickActionDisabled}
                          className="btn-primary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: Right Arrow"
                        >
                          {activeReviewItem.swipeRightLabel} (Right Arrow)
                        </button>
                        <button
                          type="button"
                          onClick={goToNextReviewable}
                          disabled={nextReviewableIndex == null}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: N"
                        >
                          Next to review (N)
                        </button>
                        <button
                          type="button"
                          onClick={onUndoLastAction ?? undefined}
                          disabled={!canUndoLastAction || !onUndoLastAction}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: U"
                        >
                          Undo (U)
                        </button>
                      </div>

                      <details className="rounded-xl border border-subtle bg-surface-1 p-3">
                        <summary className="cursor-pointer text-[11px] font-medium text-secondary">
                          Entry notes
                        </summary>
                        <div className="mt-3 max-h-72 overflow-y-auto pr-1">
                          {activeEntryNarrativeSections.length > 0 ? (
                            <div className="space-y-3">
                              {activeEntryNarrativeSections.map((section, sectionIndex) => (
                                <section
                                  key={`${section.title}:${sectionIndex}`}
                                  className={sectionIndex === 0 ? "" : "border-t border-subtle pt-3"}
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                                    {section.title}
                                  </p>
                                  <div className="mt-1.5 space-y-2">
                                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                                      <p
                                        key={`${section.title}:${paragraphIndex}`}
                                        className="text-[12px] leading-6 text-secondary"
                                      >
                                        {paragraph}
                                      </p>
                                    ))}
                                  </div>
                                </section>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px] leading-6 text-secondary">
                              {cleanEntryNarrative(activeEntry.raw_text ?? "", activeEntry.title ?? "")}
                            </p>
                          )}
                        </div>
                      </details>
                    </div>
                  ) : totalReviewItemsAcrossVisible === 0 ? (
                    <div className="relative overflow-hidden rounded-2xl border border-accent-green/45 bg-accent-green/10 p-5 animate-fade-up">
                      <div className="pointer-events-none absolute -top-10 -right-6 h-24 w-24 rounded-full bg-accent-green/18 blur-2xl" aria-hidden />
                      <div className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-accent-blue/15 blur-2xl" aria-hidden />
                      <div className="pointer-events-none absolute right-5 top-4 flex items-center gap-1" aria-hidden>
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-dot" />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse-dot [animation-delay:140ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-amber animate-pulse-dot [animation-delay:280ms]" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-green">
                        Milestone reached
                      </p>
                      <p className="mt-1 text-base font-semibold text-primary">
                        You reviewed every queued item.
                      </p>
                      <p className="mt-1 text-xs text-secondary">
                        Queue complete. Great work keeping your portfolio evidence clean and current.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {onRequestExitSwipeMode && (
                          <button
                            type="button"
                            onClick={onRequestExitSwipeMode}
                            className="btn-primary text-[11px]"
                          >
                            Finish spotlight
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onUndoLastAction ?? undefined}
                          disabled={!canUndoLastAction || !onUndoLastAction}
                          className="btn-secondary text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Shortcut: U"
                        >
                          Undo last action
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-xs text-secondary">
                      No review items on this entry. Use Next to review to continue.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </div>
        ) : (
          <div
            key={`${activeEntry.id}:${navigationDirection}`}
            className={
              navigationDirection === "next"
                ? "animate-entry-in-next"
                : "animate-entry-in-prev"
            }
          >
            <ReviewCard
              entry={activeEntry}
              onUpdateSuggestion={updateSuggestionWithAutoAdvance}
              disabled={disabled}
              auditResult={auditResultsByEntryId[activeEntry.id]}
              onApplyAuditRecommendation={onApplyAuditRecommendation}
              onRecordAuditReviewDecision={onRecordAuditReviewDecision}
              pendingRemovalCount={pendingRemovalCountByEntryId[activeEntry.id] ?? 0}
              onUnlinkKaizenSkill={onUnlinkKaizenSkill}
              expandedByDefault
              highlightSkillId={cardFocusProps(activeEntry.id).highlightSkillId}
              highlightDescriptorId={cardFocusProps(activeEntry.id).highlightDescriptorId}
              descriptorPanelInitialOpen={cardFocusProps(activeEntry.id).descriptorPanelInitialOpen}
              suggestedOnly
            />
          </div>
        )}
      </section>
    );
  }

  const shownEntries = visibleEntries.slice(
    0,
    Math.min(visibleCount, visibleEntries.length),
  );
  const remaining = visibleEntries.length - shownEntries.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-subtle bg-surface-2 px-4 py-3">
        <div>
          <h2 className="text-small font-semibold text-primary">Review queue</h2>
          <p className="text-xs text-muted">
            Showing {shownEntries.length} of {visibleEntries.length} entries
          </p>
        </div>
        <p className="text-xs text-muted">List view</p>
      </div>

      <div className="space-y-3">
        {shownEntries.map((entry) => {
          const fp = cardFocusProps(entry.id);
          return (
            <ReviewCard
              key={entry.id}
              entry={entry}
              onUpdateSuggestion={onUpdateSuggestion}
              disabled={disabled}
              auditResult={auditResultsByEntryId[entry.id]}
              onApplyAuditRecommendation={onApplyAuditRecommendation}
              onRecordAuditReviewDecision={onRecordAuditReviewDecision}
              pendingRemovalCount={pendingRemovalCountByEntryId[entry.id] ?? 0}
              onUnlinkKaizenSkill={onUnlinkKaizenSkill}
              expandedByDefault={fp.expandedByDefault}
              highlightSkillId={fp.highlightSkillId}
              highlightDescriptorId={fp.highlightDescriptorId}
              descriptorPanelInitialOpen={fp.descriptorPanelInitialOpen}
            />
          );
        })}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="btn-secondary text-xs"
          >
            Load {Math.min(remaining, PAGE_SIZE)} more
            <span className="ml-1 text-muted">({remaining} remaining)</span>
          </button>
        </div>
      )}
    </section>
  );
}
