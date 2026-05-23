import type {
  AuditCandidateRecommendation,
  AuditLinkPlan,
  AuditLinkPlanSkill,
  AuditLinkPlanOptionalReplacement,
} from "@/lib/types/audit-entry-result";

export type EntryLinkPlanCurrentSkill = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  removal_cost: number;
  rationale: string;
  logic_points?: string[];
};

export type EntryLinkPlanPendingSuggestion = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  confidence: number;
  rationale: string;
  suggestion_source: "linked_cip" | "cross_cip";
  suggested_action?: "add" | "replace" | null;
};

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clampScore(value: number, min = 0, max = 10): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildPendingScore(params: {
  pending: EntryLinkPlanPendingSuggestion;
  recommendation: AuditCandidateRecommendation | null;
}): number {
  const recommendation = params.recommendation;
  const sourceBoost = params.pending.suggestion_source === "linked_cip" ? 0.2 : 0;
  const actionBoost =
    recommendation?.action === "replace"
      ? 0.45
      : recommendation?.action === "add"
        ? 0.2
        : 0;
  const recommendationBoost = recommendation
    ? recommendation.confidence * 1.8 +
      (recommendation.portfolio_need_score ?? 0) * 0.4
    : 0;

  return clampScore(
    params.pending.confidence * 2.6 + recommendationBoost + sourceBoost + actionBoost,
  );
}

export function buildEntryLinkPlan(params: {
  effectiveTarget: number;
  currentLinkedCount: number;
  currentSkills: EntryLinkPlanCurrentSkill[];
  pendingSuggestions: EntryLinkPlanPendingSuggestion[];
  candidateRecommendations: AuditCandidateRecommendation[];
}): AuditLinkPlan | null {
  const { effectiveTarget, currentLinkedCount, currentSkills, pendingSuggestions } = params;
  if (currentLinkedCount <= effectiveTarget) return null;

  const currentById = new Map(
    currentSkills.map((skill) => [skill.key_skill_id, skill] as const),
  );
  const recommendationById = new Map(
    params.candidateRecommendations.map((recommendation) => [
      recommendation.key_skill_id,
      recommendation,
    ] as const),
  );

  const currentSorted = [...currentSkills].sort((a, b) => {
    if (b.removal_cost !== a.removal_cost) {
      return b.removal_cost - a.removal_cost;
    }
    return a.key_skill_title.localeCompare(b.key_skill_title);
  });

  const keptCurrent = currentSorted.slice(0, effectiveTarget);
  const removedCurrent = currentSorted.slice(effectiveTarget);
  const keepIds = new Set(keptCurrent.map((skill) => skill.key_skill_id));
  const removeIds = new Set(removedCurrent.map((skill) => skill.key_skill_id));

  const uniquePending = pendingSuggestions.filter(
    (suggestion, index, all) =>
      all.findIndex((candidate) => candidate.key_skill_id === suggestion.key_skill_id) ===
      index,
  );

  const replacePairs: Array<{
    incoming: EntryLinkPlanPendingSuggestion;
    outgoing: EntryLinkPlanCurrentSkill;
    score: number;
    recommendation: AuditCandidateRecommendation | null;
  }> = [];

  const keptPool = [...keptCurrent];
  const rankedPending = uniquePending
    .filter((suggestion) => !currentById.has(suggestion.key_skill_id))
    .filter((pending) => {
      const recommendation = recommendationById.get(pending.key_skill_id);
      return recommendation?.action === "replace";
    })
    .map((pending) => {
      const recommendation = recommendationById.get(pending.key_skill_id) ?? null;
      return {
        pending,
        recommendation,
        score: buildPendingScore({ pending, recommendation }),
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const candidate of rankedPending) {
    const weakestCurrent = [...keptPool].sort((a, b) => {
      if (a.removal_cost !== b.removal_cost) return a.removal_cost - b.removal_cost;
      return a.key_skill_title.localeCompare(b.key_skill_title);
    })[0];
    if (!weakestCurrent) break;
    if (candidate.score <= weakestCurrent.removal_cost + 0.35) continue;

    const weakestIndex = keptPool.findIndex(
      (skill) => skill.key_skill_id === weakestCurrent.key_skill_id,
    );
    if (weakestIndex >= 0) {
      keptPool.splice(weakestIndex, 1);
      keepIds.delete(weakestCurrent.key_skill_id);
      removeIds.add(weakestCurrent.key_skill_id);
    }

    replacePairs.push({
      incoming: candidate.pending,
      outgoing: weakestCurrent,
      score: candidate.score,
      recommendation: candidate.recommendation,
    });
  }

  const replaceInIds = new Set(replacePairs.map((pair) => pair.incoming.key_skill_id));
  const replaceOutIds = new Set(replacePairs.map((pair) => pair.outgoing.key_skill_id));
  replaceOutIds.forEach((id) => keepIds.delete(id));

  const recommendedFinalSkillIds = [
    ...currentSorted
      .filter((skill) => keepIds.has(skill.key_skill_id) && !replaceOutIds.has(skill.key_skill_id))
      .map((skill) => skill.key_skill_id),
    ...replacePairs.map((pair) => pair.incoming.key_skill_id),
  ].slice(0, effectiveTarget);

  const planSkills: AuditLinkPlanSkill[] = [];

  currentSorted.forEach((skill) => {
    if (replaceOutIds.has(skill.key_skill_id)) {
      const pair = replacePairs.find((item) => item.outgoing.key_skill_id === skill.key_skill_id);
      planSkills.push({
        key_skill_id: skill.key_skill_id,
        key_skill_title: skill.key_skill_title,
        cip_number: skill.cip_number,
        decision: "replace_out",
        source: "current_kaizen",
        confidence: pair?.recommendation?.confidence ?? null,
        rationale:
          pair?.recommendation?.rationale ??
          "A stronger pending suggestion is a better fit for this entry.",
        replace_skill_id: pair?.incoming.key_skill_id ?? null,
        replace_skill_title: pair?.incoming.key_skill_title ?? null,
        logic_points: skill.logic_points,
      });
      return;
    }

    if (removeIds.has(skill.key_skill_id)) {
      const normalizedRationale =
        skill.rationale.trim() === "Strongly evidenced on this entry"
          ? "Strongly evidenced on this entry, but less central than the kept links under the entry cap"
          : skill.rationale;
      planSkills.push({
        key_skill_id: skill.key_skill_id,
        key_skill_title: skill.key_skill_title,
        cip_number: skill.cip_number,
        decision: "remove",
        source: "current_kaizen",
        confidence: recommendationById.get(skill.key_skill_id)?.confidence ?? null,
        rationale: normalizedRationale,
        logic_points: skill.logic_points,
      });
      return;
    }

    if (keepIds.has(skill.key_skill_id)) {
      planSkills.push({
        key_skill_id: skill.key_skill_id,
        key_skill_title: skill.key_skill_title,
        cip_number: skill.cip_number,
        decision: "keep",
        source: "current_kaizen",
        confidence: null,
        rationale: "This is one of the strongest current links for the entry.",
        logic_points: skill.logic_points,
      });
    }
  });

  uniquePending.forEach((pending) => {
    const pair = replacePairs.find((item) => item.incoming.key_skill_id === pending.key_skill_id);
    if (pair) {
      planSkills.push({
        key_skill_id: pending.key_skill_id,
        key_skill_title: pending.key_skill_title,
        cip_number: pending.cip_number,
        decision: "replace_in",
        source: "pending_suggestion",
        confidence: pair.recommendation?.confidence ?? pending.confidence,
        rationale:
          pair.recommendation?.rationale ??
          pending.rationale ??
          "This pending suggestion is a better fit than one of the current links.",
        suggestion_source: pending.suggestion_source,
        replace_skill_id: pair.outgoing.key_skill_id,
        replace_skill_title: pair.outgoing.key_skill_title,
        logic_points: pair.recommendation?.logic_points,
      });
      return;
    }

    planSkills.push({
      key_skill_id: pending.key_skill_id,
      key_skill_title: pending.key_skill_title,
      cip_number: pending.cip_number,
      decision: "ignore_pending",
      source: "pending_suggestion",
      confidence: pending.confidence,
      rationale:
        "Do not confirm this while the entry is over cap unless it clearly beats a current link.",
      suggestion_source: pending.suggestion_source,
    });
  });

  const keepCount = planSkills.filter((skill) => skill.decision === "keep").length;
  const removeCount = planSkills.filter((skill) => skill.decision === "remove").length;
  const replaceCount = planSkills.filter((skill) => skill.decision === "replace_in").length;
  const ignorePendingCount = planSkills.filter(
    (skill) => skill.decision === "ignore_pending",
  ).length;
  const optionalReplacements: AuditLinkPlanOptionalReplacement[] = params.candidateRecommendations
    .filter((recommendation) => recommendation.action === "replace")
    .filter((recommendation) => !replaceInIds.has(recommendation.key_skill_id))
    .filter(
      (recommendation) =>
        !removeIds.has(recommendation.replace_skill_id ?? "") &&
        !replaceOutIds.has(recommendation.replace_skill_id ?? ""),
    )
    .slice(0, 2)
    .map((recommendation) => ({
      incoming_key_skill_id: recommendation.key_skill_id,
      incoming_key_skill_title: recommendation.key_skill_title,
      incoming_cip_number: recommendation.cip_number,
      outgoing_key_skill_id: recommendation.replace_skill_id ?? "",
      outgoing_key_skill_title: recommendation.replace_skill_title ?? null,
      confidence: recommendation.confidence,
      rationale: recommendation.rationale,
      logic_points: recommendation.logic_points,
    }))
    .filter((recommendation) => recommendation.outgoing_key_skill_id.length > 0);

  const summaryParts = [
    keepCount > 0 ? `keep ${keepCount}` : null,
    removeCount > 0 ? `remove ${removeCount}` : null,
    replaceCount > 0 ? `replace ${replaceCount}` : null,
    ignorePendingCount > 0 ? `ignore ${ignorePendingCount} pending` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    mode: "rebalance",
    effective_target: effectiveTarget,
    current_linked_count: currentLinkedCount,
    recommended_final_skill_ids: recommendedFinalSkillIds,
    keep_count: keepCount,
    remove_count: removeCount,
    replace_count: replaceCount,
    ignore_pending_count: ignorePendingCount,
    summary: summaryParts.length > 0 ? summaryParts.join(" · ") : "No rebalance actions",
    skills: planSkills.sort((a, b) => {
      const rank = (decision: AuditLinkPlanSkill["decision"]) =>
        decision === "remove"
          ? 0
          : decision === "replace_out"
            ? 1
            : decision === "replace_in"
              ? 2
              : decision === "keep"
                ? 3
                : 4;
      const decisionDelta = rank(a.decision) - rank(b.decision);
      if (decisionDelta !== 0) return decisionDelta;
      const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.key_skill_title.localeCompare(b.key_skill_title);
    }),
    ...(optionalReplacements.length > 0
      ? { optional_replacements: optionalReplacements }
      : {}),
  };
}
