import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import {
  RECOMMENDED_SKILLS_PER_ENTRY_TARGET,
  resolveEffectiveSkillsPerEntryTarget,
} from "@/lib/key-skill-review/entry-skill-target";
import {
  extractKaizenIdFromLinkedSkillRaw,
  normalizeSkillTitle,
  stripCipPrefixAndId,
} from "@/lib/key-skill-review/linked-skill-resolver";
import {
  analyzeDescriptorsWithMetrics,
  type AnalyzerEntry,
  type AnalyzerKeySkill,
} from "@/lib/key-skill-review/descriptor-analyzer";
import {
  suggestAuditCandidatesWithMetrics,
  type AuditCandidateInput,
} from "@/lib/key-skill-review/audit-candidate-suggester";
import { buildEntryLinkPlan } from "@/lib/key-skill-review/entry-link-plan";
import {
  buildSupervisorMeetingKey,
  isSupervisorMeetingReviewEntry,
  isSupervisorMeetingTitle,
} from "@/lib/key-skill-review/supervisor-meetings";
import { callLiveModel, LIVE_AUDIT_MODEL } from "@/lib/ai/live-models";
import {
  estimateLlmCostUsd,
  resolveKeySkillReviewLlmPricing,
} from "@/lib/key-skill-review/llm-cost";

type AuditBody = {
  entry_ids?: unknown;
  force_full_refresh?: unknown;
  use_llm?: unknown;
};

type ReviewEntryRow = {
  id: string;
  source_entry_key: string;
  title: string;
  entry_type: string;
  linked_cip_number: number;
  event_date: string | null;
  entry_text: string;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

type SuggestionStateRow = {
  review_entry_id: string;
  key_skill_id: string;
  suggestion_source: string;
  status: string;
  confidence: number | null;
  rationale: string | null;
  suggested_action: "add" | "replace" | null;
  replace_key_skill_id: string | null;
};

type KaizenEntryRow = {
  source_entry_id: string | null;
  extracted_fields: Record<string, unknown> | null;
};

type DescriptorRow = {
  id: string;
  key_skill_id: string;
  text: string;
  sort_order: number;
};

type KeySkillRow = {
  id: string;
  title: string;
  cip_id: string | null;
  kaizen_ids?: string[] | null;
};

type CipRow = {
  id: string;
  number: number;
};

type CoverageRow = {
  descriptor_id: string;
  key_skill_id: string;
  covered: boolean;
};

type ResolvedCurrentLinkedSkill = {
  raw: string;
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  kaizen_id: string | null;
  descriptor_count: number;
  match_method: "kaizen_id" | "kaizen_id_alias" | "title_exact";
};

type LinkedSkillQuality = {
  key_skill_id: string;
  key_skill_title: string;
  evidence_score: number;
  verdict: "weak" | "moderate" | "strong";
  total_descriptors: number;
  covered_descriptors_count: number;
  covered_descriptor_ids: string[];
  weak_descriptor_ids: string[];
};

type CandidateRecommendation = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number;
  action: "add" | "replace" | "remove";
  replace_skill_id: string | null;
  replace_skill_title: string | null;
  confidence: number;
  rationale: string;
  suggestion_id?: string;
  portfolio_need_score?: number;
  removal_cost?: number;
  target_kaizen_skill_id?: string | null;
  logic_points?: string[];
};

type SuggestionRow = {
  id: string;
  key_skill_id: string;
  suggestion_source: string;
  status: string;
  suggested_action: "add" | "replace" | null;
  replace_key_skill_id: string | null;
};

type AuditWarningCode =
  | "descriptor_analysis_failed"
  | "candidate_analysis_failed"
  | "plan_review_failed"
  | "audit_suggestion_upsert_failed"
  | "audit_structured_action_columns_unavailable"
  | "audit_marker_update_failed";

type AuditWarningStage =
  | "descriptor_analysis"
  | "candidate_analysis"
  | "plan_review"
  | "suggestion_persistence"
  | "marker_update";

type AuditWarningDetail = {
  warning: AuditWarningCode;
  stage: AuditWarningStage;
  message: string;
  code?: string;
  status?: number;
  name?: string;
};

type LlmUsageTotals = {
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
};

type PortfolioNeedSignal = {
  portfolio_need_score: number;
  missing_descriptor_count: number;
  total_descriptor_count: number;
  confirmed_portfolio_count: number;
  cip_confirmed_portfolio_count: number;
  portfolio_need_reasons: string[];
};

type RemovalSignal = {
  removal_cost: number;
  confirmed_portfolio_count: number;
  cip_confirmed_portfolio_count: number;
  missing_descriptor_count: number;
  total_descriptor_count: number;
  removal_reasons: string[];
};

type PlanReviewResult = {
  protected_current_skill_ids: string[];
  notes?: string[];
};

const KAIZEN_ID_TITLE_ALIASES: Record<string, string> = {
  "948883": "Aware of and adheres to legal principles and professional requirements",
};

function entryMentionsProtectedThemes(entryText: string): boolean {
  return /deaf|bsl|interpreter|bias|equity|inclusion|discrimin|autonomy|consent|choice|communication breakdown|patient safety|human factors|human error/i.test(
    entryText,
  );
}

function skillIsProtectedTheme(skillTitle: string): boolean {
  return /non.?discrimin|inclusion|ethical|decision making|facilitates women|facilitat(e|es) discussions?|communication|legal principles|professional requirements|human performance|human factors|safeguard|consent/i.test(
    skillTitle,
  );
}

function isProtectedCurrentSkill(entryText: string, skillTitle: string): boolean {
  return entryMentionsProtectedThemes(entryText) && skillIsProtectedTheme(skillTitle);
}

function needsPlanReview(params: {
  entryText: string;
  draftPlan: ReturnType<typeof buildEntryLinkPlan>;
  unresolvedLinkedSkills: string[];
  qualityBySkillId: Map<string, LinkedSkillQuality>;
}): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const draftPlan = params.draftPlan;
  if (!draftPlan) return { needed: false, reasons };

  const hasReplacements = draftPlan.skills.some(
    (skill) =>
      skill.decision === "replace_in" || skill.decision === "replace_out",
  );
  if (hasReplacements) {
    reasons.push("Draft plan contains replacements");
  }

  if (params.unresolvedLinkedSkills.length > 0) {
    reasons.push("Current ePortfolio links include unresolved skills");
  }

  const riskyOutgoing = draftPlan.skills.filter(
    (skill) => skill.decision === "remove" || skill.decision === "replace_out",
  );

  if (
    entryMentionsProtectedThemes(params.entryText) &&
    riskyOutgoing.some((skill) => skillIsProtectedTheme(skill.key_skill_title))
  ) {
    reasons.push("Draft plan removes or replaces a protected-theme skill");
  }

  if (
    riskyOutgoing.some((skill) => {
      const quality = params.qualityBySkillId.get(skill.key_skill_id);
      return quality?.verdict === "strong";
    })
  ) {
    reasons.push("Draft plan touches a strongly evidenced current skill");
  }

  return { needed: reasons.length > 0, reasons };
}

async function reviewPlanForProtectedSkills(params: {
  entryText: string;
  currentSkills: ResolvedCurrentLinkedSkill[];
  draftPlan: NonNullable<ReturnType<typeof buildEntryLinkPlan>>;
  reviewReasons: string[];
}): Promise<{ result: PlanReviewResult; usage: LlmUsageTotals }> {
  const reviewTargets = params.draftPlan.skills
    .filter((skill) => skill.decision === "remove" || skill.decision === "replace_out")
    .map((skill) => ({
      key_skill_id: skill.key_skill_id,
      key_skill_title: skill.key_skill_title,
      cip_number: skill.cip_number,
      decision: skill.decision,
      replacement: skill.replace_skill_title ?? null,
      rationale: skill.rationale,
      logic_points: skill.logic_points ?? [],
    }));

  const currentSkills = params.currentSkills.map((skill) => ({
    key_skill_id: skill.key_skill_id,
    key_skill_title: skill.key_skill_title,
    cip_number: skill.cip_number,
  }));

  const system = [
    "You are reviewing a draft portfolio key-skill rebalance plan.",
    "Your only job is to protect current Kaizen-linked skills that are clearly central to the entry or obviously unsafe to remove.",
    "Do not optimize for portfolio gaps if that would displace a clearly core current skill.",
    "Be conservative. Return an empty protected_current_skill_ids array unless there is a strong reason to intervene.",
    "Return JSON with keys protected_current_skill_ids (array of ids) and notes (array of short strings).",
  ].join("\n");

  const userMessage = JSON.stringify({
    review_reasons: params.reviewReasons,
    entry_text: params.entryText,
    current_skills: currentSkills,
    draft_outgoing_changes: reviewTargets,
  });

  const response = await callLiveModel(LIVE_AUDIT_MODEL, {
    system,
    userMessage,
    maxTokens: 500,
    temperature: 0,
    timeoutMs: 30_000,
  });

  let parsed: PlanReviewResult = { protected_current_skill_ids: [], notes: [] };
  try {
    const json = JSON.parse(response.rawText) as Partial<PlanReviewResult>;
    parsed = {
      protected_current_skill_ids: Array.isArray(json.protected_current_skill_ids)
        ? json.protected_current_skill_ids
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        : [],
      notes: Array.isArray(json.notes)
        ? json.notes.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
    };
  } catch {
    parsed = { protected_current_skill_ids: [], notes: [] };
  }

  return {
    result: parsed,
    usage: {
      api_calls: 1,
      input_tokens: response.inputTokens,
      output_tokens: response.outputTokens,
    },
  };
}

type AuditFinding =
  | {
      type: "overlinked";
      current_linked_skill_count: number;
      raw_linked_skill_count: number;
      effective_linked_skill_count: number;
      effective_target: number;
      overlinked_by: number;
      rationale: string;
    }
  | {
      type: "replace";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      replace_skill_id: string;
      replace_skill_title: string | null;
      confidence: number;
      rationale: string;
    }
  | {
      type: "add";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      confidence: number;
      rationale: string;
    }
  | {
      type: "remove";
      key_skill_id: string;
      key_skill_title: string;
      cip_number: number;
      confidence: number;
      rationale: string;
      removal_cost?: number;
    }
  | {
      type: "flag";
      key_skill_id: string;
      key_skill_title: string;
      reason: "weak_unreplaced";
      evidence_score: number;
      rationale: string;
    }
  | {
      type: "ok";
      rationale: string;
    };

const AUDIT_LAST_RUN_AT_KEY = "audit_last_run_at";
const AUDIT_LAST_INPUT_FINGERPRINT_KEY = "audit_last_input_fingerprint";
const AUDIT_LAST_RESULT_KEY = "audit_last_result";

function isMissingProfileTargetColumnError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    String(error.message ?? "").includes("default_skills_per_entry_target")
  );
}

function isMissingStructuredSuggestionColumnsError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const message = String(error.message ?? "");
  return (
    message.includes("suggested_action") ||
    message.includes("replace_key_skill_id")
  );
}

function parseLinkedKeySkillsRaw(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split("|")
    .map((segment) => segment.trim())
    .map((segment) =>
      segment.startsWith('"') && segment.endsWith('"')
        ? segment.slice(1, -1).trim()
        : segment,
    )
    .filter(Boolean);
}

function buildAuditInputFingerprint(input: {
  entry_text: string;
  entry_type: string | null;
  effective_target: number;
  linked_key_skills_raw: string;
  gap_skill_ids: string[];
  current_linked_key_skill_ids: string[];
  confirmed_linked_key_skill_ids: string[];
  suggestion_state_signature: string;
}): string {
  const payload = JSON.stringify({
    entry_text: input.entry_text,
    entry_type: input.entry_type,
    effective_target: input.effective_target,
    linked_key_skills_raw: input.linked_key_skills_raw,
    gap_skill_ids: [...input.gap_skill_ids].sort(),
    current_linked_key_skill_ids: [...input.current_linked_key_skill_ids].sort(),
    confirmed_linked_key_skill_ids: [
      ...input.confirmed_linked_key_skill_ids,
    ].sort(),
    suggestion_state_signature: input.suggestion_state_signature,
  });
  return createHash("sha1").update(payload).digest("hex");
}

function buildAuditWarningDetail(
  warning: AuditWarningCode,
  stage: AuditWarningStage,
  err: unknown,
): AuditWarningDetail {
  if (err && typeof err === "object") {
    const raw = err as Record<string, unknown>;
    const message =
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim().slice(0, 500)
        : err instanceof Error && err.message
          ? err.message.trim().slice(0, 500)
          : "Unknown error";
    const code =
      raw.code == null ? undefined : String(raw.code).trim() || undefined;
    const statusRaw = raw.status;
    const status =
      typeof statusRaw === "number" && Number.isFinite(statusRaw)
        ? statusRaw
        : undefined;
    const name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : err instanceof Error && err.name
          ? err.name
          : undefined;

    return {
      warning,
      stage,
      message,
      ...(code ? { code } : {}),
      ...(typeof status === "number" ? { status } : {}),
      ...(name ? { name } : {}),
    };
  }

  if (err instanceof Error) {
    return {
      warning,
      stage,
      message: err.message.trim().slice(0, 500) || "Unknown error",
      ...(err.name ? { name: err.name } : {}),
    };
  }

  return {
    warning,
    stage,
    message: String(err ?? "Unknown error").slice(0, 500),
  };
}

function extractLlmUsageFromError(err: unknown): LlmUsageTotals {
  if (!err || typeof err !== "object") {
    return { api_calls: 0, input_tokens: 0, output_tokens: 0 };
  }
  const raw = (err as { metrics?: unknown }).metrics;
  if (!raw || typeof raw !== "object") {
    return { api_calls: 0, input_tokens: 0, output_tokens: 0 };
  }
  const metrics = raw as Record<string, unknown>;
  const apiCalls = Number(metrics.api_calls ?? 0);
  const inputTokens = Number(metrics.input_tokens ?? 0);
  const outputTokens = Number(metrics.output_tokens ?? 0);
  return {
    api_calls: Number.isFinite(apiCalls) ? Math.max(0, apiCalls) : 0,
    input_tokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
    output_tokens: Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0,
  };
}

function addUsage(acc: LlmUsageTotals, usage: LlmUsageTotals): LlmUsageTotals {
  return {
    api_calls: acc.api_calls + usage.api_calls,
    input_tokens: acc.input_tokens + usage.input_tokens,
    output_tokens: acc.output_tokens + usage.output_tokens,
  };
}

function roundAuditScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampAuditConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.98, Math.max(0.5, value));
}

const AUDIT_TEXT_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "through",
  "within",
  "effective",
  "effectively",
  "demonstrates",
  "demonstrate",
  "able",
  "work",
  "works",
  "working",
  "understanding",
  "understands",
  "promotes",
  "supports",
  "delivers",
  "provides",
  "manages",
  "using",
  "used",
  "use",
]);

function normalizeAuditTextForMatch(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAuditText(value: string): string[] {
  return normalizeAuditTextForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 && !AUDIT_TEXT_STOP_WORDS.has(token),
    );
}

function computeLexicalOverlapScore(entryText: string, skillTitle: string): number {
  const entryTokens = new Set(tokenizeAuditText(entryText));
  const skillTokens = Array.from(new Set(tokenizeAuditText(skillTitle)));
  if (entryTokens.size === 0 || skillTokens.length === 0) return 0;

  const overlapCount = skillTokens.filter((token) => entryTokens.has(token)).length;
  if (overlapCount === 0) return 0;

  return overlapCount / skillTokens.length;
}

function buildEntrySemanticSignal(params: {
  entryText: string;
  keySkillTitle: string;
}): {
  centrality_boost: number;
  generic_penalty: number;
  reasons: string[];
} {
  const entryText = normalizeAuditTextForMatch(params.entryText);
  const skillTitle = normalizeAuditTextForMatch(params.keySkillTitle);
  const reasons: string[] = [];

  let centralityBoost = 0;
  let genericPenalty = 0;

  const semanticFamilies: Array<{
    skillPattern: RegExp;
    entryPattern: RegExp;
    boost: number;
    reason: string;
  }> = [
    {
      skillPattern:
        /teach|educat|stakeholder|supervis|apprais|excellence/,
      entryPattern:
        /teach|educat|newsletter|journal club|guideline|learning|colleague|departmental|presentation/,
      boost: 1.35,
      reason: "Entry strongly centers on education or teaching activity",
    },
    {
      skillPattern: /innovat|research/,
      entryPattern:
        /innovat|research|journal|guideline|newsletter|designed|built|created|coded|html|css/,
      boost: 1.05,
      reason: "Entry directly evidences innovation or research-related work",
    },
    {
      skillPattern: /digital environment/,
      entryPattern: /html|css|code|coded|digital|software|platform|automation/,
      boost: 0.45,
      reason: "Entry includes direct digital-work evidence",
    },
    {
      skillPattern: /resources|time management|prioritis|organisation/,
      entryPattern:
        /time management|workload|organis|prioritis|monthly|production|distribution|resource/,
      boost: 0.35,
      reason: "Entry mentions operational planning or resource use",
    },
  ];

  semanticFamilies.forEach((family) => {
    if (family.skillPattern.test(skillTitle) && family.entryPattern.test(entryText)) {
      centralityBoost += family.boost;
      reasons.push(family.reason);
    }
  });

  const genericPenaltyRules: Array<{
    pattern: RegExp;
    penalty: number;
    reason: string;
  }> = [
    {
      pattern: /time management|effective use of resources|resources/,
      penalty: 0.85,
      reason: "This skill is broad and often secondary to the core event",
    },
    {
      pattern: /digital environment/,
      penalty: 0.55,
      reason: "This skill can be technically true while still being secondary",
    },
    {
      pattern: /continued learning|demonstrates insight/,
      penalty: 0.3,
      reason: "This skill is reflective and often less central than the main event",
    },
  ];

  genericPenaltyRules.forEach((rule) => {
    if (rule.pattern.test(skillTitle)) {
      genericPenalty += rule.penalty;
      reasons.push(rule.reason);
    }
  });

  return {
    centrality_boost: roundAuditScore(centralityBoost),
    generic_penalty: roundAuditScore(genericPenalty),
    reasons,
  };
}

function buildPortfolioNeedSignal(params: {
  keySkillId: string;
  cipNumber: number;
  descriptorCountByKeySkillId: Map<string, number>;
  uncoveredDescriptorCountByKeySkillId: Map<string, number>;
  confirmedPortfolioCountByKeySkillId: Map<string, number>;
  confirmedPortfolioCountByCipNumber: Map<number, number>;
}): PortfolioNeedSignal {
  const totalDescriptorCount =
    params.descriptorCountByKeySkillId.get(params.keySkillId) ?? 0;
  const missingDescriptorCount =
    params.uncoveredDescriptorCountByKeySkillId.get(params.keySkillId) ?? 0;
  const confirmedPortfolioCount =
    params.confirmedPortfolioCountByKeySkillId.get(params.keySkillId) ?? 0;
  const cipConfirmedPortfolioCount =
    params.confirmedPortfolioCountByCipNumber.get(params.cipNumber) ?? 0;

  const score =
    Math.min(3, missingDescriptorCount) * 0.6 +
    (confirmedPortfolioCount === 0 ? 1.4 : confirmedPortfolioCount === 1 ? 0.7 : 0) +
    (params.cipNumber > 0
      ? cipConfirmedPortfolioCount === 0
        ? 1
        : cipConfirmedPortfolioCount <= 2
          ? 0.4
          : 0
      : 0);

  const reasons: string[] = [];
  if (confirmedPortfolioCount === 0) {
    reasons.push("No confirmed evidence elsewhere in the portfolio");
  } else if (confirmedPortfolioCount === 1) {
    reasons.push("Only one confirmed portfolio entry currently supports this skill");
  }
  if (missingDescriptorCount > 0) {
    reasons.push(
      `${missingDescriptorCount}/${Math.max(
        totalDescriptorCount,
        missingDescriptorCount,
      )} descriptors remain uncovered across the portfolio`,
    );
  }
  if (params.cipNumber > 0) {
    if (cipConfirmedPortfolioCount === 0) {
      reasons.push(`CiP ${params.cipNumber} has no confirmed evidence yet`);
    } else if (cipConfirmedPortfolioCount <= 2) {
      reasons.push(`CiP ${params.cipNumber} has limited confirmed evidence`);
    }
  }

  return {
    portfolio_need_score: roundAuditScore(score),
    missing_descriptor_count: missingDescriptorCount,
    total_descriptor_count: totalDescriptorCount,
    confirmed_portfolio_count: confirmedPortfolioCount,
    cip_confirmed_portfolio_count: cipConfirmedPortfolioCount,
    portfolio_need_reasons: reasons,
  };
}

function buildRemovalSignal(params: {
  keySkillId: string;
  keySkillTitle: string;
  entryText: string;
  cipNumber: number;
  quality: LinkedSkillQuality | null;
  descriptorCountByKeySkillId: Map<string, number>;
  uncoveredDescriptorCountByKeySkillId: Map<string, number>;
  confirmedPortfolioCountByKeySkillId: Map<string, number>;
  confirmedPortfolioCountByCipNumber: Map<number, number>;
}): RemovalSignal {
  const totalDescriptorCount =
    params.descriptorCountByKeySkillId.get(params.keySkillId) ?? 0;
  const missingDescriptorCount =
    params.uncoveredDescriptorCountByKeySkillId.get(params.keySkillId) ?? 0;
  const confirmedPortfolioCount =
    params.confirmedPortfolioCountByKeySkillId.get(params.keySkillId) ?? 0;
  const cipConfirmedPortfolioCount =
    params.confirmedPortfolioCountByCipNumber.get(params.cipNumber) ?? 0;
  const evidenceScore = params.quality?.evidence_score ?? 0.5;
  const verdict = params.quality?.verdict ?? "moderate";
  const lexicalOverlapScore = computeLexicalOverlapScore(
    params.entryText,
    params.keySkillTitle,
  );
  const semanticSignal = buildEntrySemanticSignal({
    entryText: params.entryText,
    keySkillTitle: params.keySkillTitle,
  });
  const protectedThemeBoost = isProtectedCurrentSkill(
    params.entryText,
    params.keySkillTitle,
  )
    ? 3.2
    : 0;

  const score =
    evidenceScore * 1.6 +
    lexicalOverlapScore * 0.9 +
    semanticSignal.centrality_boost -
    semanticSignal.generic_penalty +
    protectedThemeBoost +
    (confirmedPortfolioCount <= 1 ? 0.9 : confirmedPortfolioCount === 2 ? 0.4 : 0) +
    (missingDescriptorCount > 0 ? 0.5 : 0) +
    (params.cipNumber > 0 && cipConfirmedPortfolioCount <= 2 ? 0.4 : 0) +
    (verdict === "strong" ? 0.4 : verdict === "weak" ? -0.35 : 0);

  const reasons: string[] = [];
  if (verdict === "weak") {
    reasons.push("Weakly evidenced on this entry");
  } else if (verdict === "moderate") {
    reasons.push("Only moderately evidenced on this entry");
  } else {
    reasons.push("Strongly evidenced on this entry");
  }
  if (lexicalOverlapScore >= 0.5) {
    reasons.push("Skill wording closely matches the entry narrative");
  } else if (lexicalOverlapScore > 0) {
    reasons.push("Skill has some direct wording overlap with the entry");
  }
  if (protectedThemeBoost > 0) {
    reasons.push(
      "Entry directly evidences inclusion, communication, consent, or safety themes central to this skill",
    );
  }
  reasons.push(...semanticSignal.reasons);
  if (confirmedPortfolioCount === 0) {
    reasons.push("This would remove the only confirmed evidence for the skill");
  } else if (confirmedPortfolioCount === 1) {
    reasons.push("This skill only has one confirmed portfolio example");
  } else {
    reasons.push("This skill is already supported elsewhere in the portfolio");
  }
  if (params.cipNumber > 0) {
    if (cipConfirmedPortfolioCount === 0) {
      reasons.push(`CiP ${params.cipNumber} has no other confirmed evidence`);
    } else if (cipConfirmedPortfolioCount <= 2) {
      reasons.push(`CiP ${params.cipNumber} is still thinly evidenced`);
    } else {
      reasons.push(`CiP ${params.cipNumber} already has broader portfolio coverage`);
    }
  }
  if (missingDescriptorCount > 0) {
    reasons.push(
      `${missingDescriptorCount}/${Math.max(
        totalDescriptorCount,
        missingDescriptorCount,
      )} descriptors for this skill remain uncovered across the portfolio`,
    );
  }

  return {
    removal_cost: roundAuditScore(score),
    confirmed_portfolio_count: confirmedPortfolioCount,
    cip_confirmed_portfolio_count: cipConfirmedPortfolioCount,
    missing_descriptor_count: missingDescriptorCount,
    total_descriptor_count: totalDescriptorCount,
    removal_reasons: Array.from(new Set(reasons)),
  };
}

export async function POST(request: Request) {
  let supabase = await getServerSupabaseClient();
  let user: { id: string } | null = null;
  const authHeader = request.headers.get("Authorization");
  const debugUserId = request.headers.get("x-debug-user-id")?.trim() || "";

  if (authHeader?.startsWith("Bearer ")) {
    const auth = await getUserFromBearerToken(authHeader);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    supabase = createSupabaseClientWithToken(auth.accessToken);
    user = auth.user;
  } else if (
    debugUserId &&
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    supabase = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    user = { id: debugUserId };
  } else {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    user = authData.user;
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AuditBody = {};
  try {
    body = (await request.json()) as AuditBody;
  } catch {
    // Optional body; treat invalid/missing JSON as empty filter.
    body = {};
  }

  let entryIdsFilter: string[] | null = null;
  const forceFullRefresh = body.force_full_refresh === true;
  if (body.use_llm !== undefined && typeof body.use_llm !== "boolean") {
    return NextResponse.json(
      { error: "use_llm must be a boolean when provided" },
      { status: 400 },
    );
  }
  const envLlmEnabled =
    String(process.env.KEY_SKILL_REVIEW_LLM_ENABLED ?? "").toLowerCase() ===
    "true";
  const llmEnabled = envLlmEnabled && body.use_llm === true;
  const llmPricing = resolveKeySkillReviewLlmPricing();
  let runLlmUsage: LlmUsageTotals = {
    api_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
  };
  if (body.entry_ids !== undefined) {
    if (!Array.isArray(body.entry_ids)) {
      return NextResponse.json(
        { error: "entry_ids must be an array of strings" },
        { status: 400 },
      );
    }
    const parsed = body.entry_ids
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean);
    if (parsed.length !== body.entry_ids.length) {
      return NextResponse.json(
        { error: "entry_ids must be an array of strings" },
        { status: 400 },
      );
    }
    entryIdsFilter = parsed;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_skills_per_entry_target")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError && !isMissingProfileTargetColumnError(profileError)) {
    return NextResponse.json(
      { error: "Failed to load profile target: " + profileError.message },
      { status: 500 },
    );
  }

  const profileDefault = isMissingProfileTargetColumnError(profileError)
    ? RECOMMENDED_SKILLS_PER_ENTRY_TARGET
    : profile?.default_skills_per_entry_target;

  let entriesQuery = supabase
    .from("key_skill_review_entries")
    .select(
      "id, source_entry_key, title, entry_type, linked_cip_number, event_date, entry_text, metadata, updated_at",
    )
    .eq("user_id", user.id);

  if (entryIdsFilter && entryIdsFilter.length > 0) {
    entriesQuery = entriesQuery.in("id", entryIdsFilter);
  }

  const { data: entriesData, error: entriesError } = await entriesQuery;
  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load review entries: " + entriesError.message },
      { status: 500 },
    );
  }

  const entries = (entriesData ?? []) as ReviewEntryRow[];
  const { data: supervisorMeetingRows, error: supervisorMeetingsError } = await supabase
    .from("kaizen_supervisor_meetings")
    .select("title,date")
    .eq("user_id", user.id);
  if (supervisorMeetingsError) {
    return NextResponse.json(
      {
        error:
          "Failed to load supervisor meetings: " + supervisorMeetingsError.message,
      },
      { status: 500 },
    );
  }
  const supervisorMeetingKeys = new Set(
    ((supervisorMeetingRows ?? []) as Array<{ title: string | null; date: string | null }>).map(
      (row) => buildSupervisorMeetingKey(row.title, row.date),
    ),
  );

  const { data: staleSupervisorGroupsData, error: staleSupervisorGroupsError } =
    await supabase
      .from("key_skill_review_push_queue_v2_groups")
      .select("id,title")
      .eq("user_id", user.id)
      .neq("status", "synced");
  if (staleSupervisorGroupsError) {
    return NextResponse.json(
      {
        error:
          "Failed to load V2 groups for supervisor meeting cleanup: " +
          staleSupervisorGroupsError.message,
      },
      { status: 500 },
    );
  }
  const staleSupervisorGroupIds = ((staleSupervisorGroupsData ?? []) as Array<{
    id: string;
    title: string | null;
  }>)
    .filter((group) => isSupervisorMeetingTitle(group.title))
    .map((group) => group.id);
  if (staleSupervisorGroupIds.length > 0) {
    const staleSupervisorSyncedAt = new Date().toISOString();
    const { error: staleSupervisorJobsCleanupError } = await supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .update({
        status: "synced",
        last_error: null,
        synced_at: staleSupervisorSyncedAt,
        updated_at: staleSupervisorSyncedAt,
        claim_token: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_heartbeat_at: null,
      })
      .eq("user_id", user.id)
      .in("group_id", staleSupervisorGroupIds);
    if (staleSupervisorJobsCleanupError) {
      return NextResponse.json(
        {
          error:
            "Failed to clear stale supervisor meeting V2 jobs: " +
            staleSupervisorJobsCleanupError.message,
        },
        { status: 500 },
      );
    }

    const { error: staleSupervisorGroupsCleanupError } = await supabase
      .from("key_skill_review_push_queue_v2_groups")
      .update({
        status: "synced",
        last_error: null,
        last_synced_at: staleSupervisorSyncedAt,
        updated_at: staleSupervisorSyncedAt,
        claim_token: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_heartbeat_at: null,
      })
      .eq("user_id", user.id)
      .in("id", staleSupervisorGroupIds);
    if (staleSupervisorGroupsCleanupError) {
      return NextResponse.json(
        {
          error:
            "Failed to clear stale supervisor meeting V2 groups: " +
            staleSupervisorGroupsCleanupError.message,
        },
        { status: 500 },
      );
    }
  }

  if (entries.length === 0) {
    const estimatedCostUsd = llmEnabled
      ? estimateLlmCostUsd(
          runLlmUsage.input_tokens,
          runLlmUsage.output_tokens,
          llmPricing,
        )
      : 0;
    return NextResponse.json({
      ok: true,
      summary: {
        entries_considered: 0,
        portfolio_gap_skill_count: 0,
        llm_enabled: llmEnabled,
        llm_configured: envLlmEnabled,
        llm_usage: {
          model: LIVE_AUDIT_MODEL.model,
          ...runLlmUsage,
          estimated_cost_usd: estimatedCostUsd,
          pricing: llmPricing,
        },
      },
      entries: [],
    });
  }

  const entryIds = entries.map((e) => e.id);
  const suggestionStateWithStructuredColumns = await supabase
    .from("key_skill_review_suggestions")
    .select(
      "review_entry_id, key_skill_id, suggestion_source, status, confidence, rationale, suggested_action, replace_key_skill_id",
    )
    .eq("user_id", user.id)
    .in("review_entry_id", entryIds);

  let suggestionStateRows:
    | Array<Record<string, unknown>>
    | null
    | undefined;
  let suggestionStateError:
    | { code?: string; message?: string }
    | null
    | undefined;

  if (
    isMissingStructuredSuggestionColumnsError(
      suggestionStateWithStructuredColumns.error,
    )
  ) {
    const fallbackSuggestionState = await supabase
      .from("key_skill_review_suggestions")
      .select("review_entry_id, key_skill_id, suggestion_source, status, confidence, rationale")
      .eq("user_id", user.id)
      .in("review_entry_id", entryIds);
    suggestionStateRows = fallbackSuggestionState.data as
      | Array<Record<string, unknown>>
      | null
      | undefined;
    suggestionStateError = fallbackSuggestionState.error as
      | { code?: string; message?: string }
      | null
      | undefined;
  } else {
    suggestionStateRows = suggestionStateWithStructuredColumns.data as
      | Array<Record<string, unknown>>
      | null
      | undefined;
    suggestionStateError = suggestionStateWithStructuredColumns.error as
      | { code?: string; message?: string }
      | null
      | undefined;
  }

  if (suggestionStateError) {
    return NextResponse.json(
      { error: "Failed to load suggestion state: " + suggestionStateError.message },
      { status: 500 },
    );
  }

  const confirmedSkillIdsByEntryId = new Map<string, Set<string>>();
  const pendingSuggestionsByEntryId = new Map<
    string,
    Array<{
      key_skill_id: string;
      suggestion_source: "linked_cip" | "cross_cip";
      confidence: number;
      rationale: string;
      suggested_action: "add" | "replace" | null;
    }>
  >();
  const suggestionStatePartsByEntryId = new Map<string, string[]>();
  ((suggestionStateRows ?? []) as SuggestionStateRow[]).forEach((row) => {
    const entryId = String(row.review_entry_id);
    const keySkillId = String(row.key_skill_id);
    const suggestionSource = String(row.suggestion_source ?? "");
    const status = String(row.status ?? "");
    const suggestedAction =
      row.suggested_action === "add" || row.suggested_action === "replace"
        ? row.suggested_action
        : "";
    const replaceKeySkillId =
      typeof row.replace_key_skill_id === "string"
        ? row.replace_key_skill_id.trim()
        : "";
    const parts = suggestionStatePartsByEntryId.get(entryId) ?? [];
    parts.push(
      `${suggestionSource}:${keySkillId}:${status}:${suggestedAction}:${replaceKeySkillId}`,
    );
    suggestionStatePartsByEntryId.set(entryId, parts);
    if (
      status === "suggested" &&
      keySkillId &&
      (suggestionSource === "linked_cip" || suggestionSource === "cross_cip")
    ) {
      const existing = pendingSuggestionsByEntryId.get(entryId) ?? [];
      existing.push({
        key_skill_id: keySkillId,
        suggestion_source: suggestionSource,
        confidence:
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? row.confidence
            : 0,
        rationale: String(row.rationale ?? ""),
        suggested_action:
          row.suggested_action === "add" || row.suggested_action === "replace"
            ? row.suggested_action
            : null,
      });
      pendingSuggestionsByEntryId.set(entryId, existing);
    }
    if (status !== "confirmed") return;
    if (!keySkillId) return;
    const existing = confirmedSkillIdsByEntryId.get(entryId) ?? new Set<string>();
    existing.add(keySkillId);
    confirmedSkillIdsByEntryId.set(entryId, existing);
  });
  const suggestionStateSignatureByEntryId = new Map<string, string>();
  suggestionStatePartsByEntryId.forEach((parts, entryId) => {
    suggestionStateSignatureByEntryId.set(entryId, [...parts].sort().join("|"));
  });

  const sourceIds = Array.from(
    new Set(
      entries
        .map((entry) => {
          const meta =
            entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
          const sourceEntryIdFromMeta =
            typeof meta.source_entry_id === "string" ? meta.source_entry_id.trim() : "";
          return sourceEntryIdFromMeta || String(entry.source_entry_key || "").trim();
        })
        .filter(Boolean),
    ),
  );

  const linkedRawBySourceEntryId = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: kaizenRows, error: kaizenError } = await supabase
      .from("kaizen_entries")
      .select("source_entry_id, extracted_fields")
      .eq("user_id", user.id)
      .in("source_entry_id", sourceIds);

    if (kaizenError) {
      return NextResponse.json(
        { error: "Failed to load ePortfolio entries: " + kaizenError.message },
        { status: 500 },
      );
    }

    ((kaizenRows ?? []) as KaizenEntryRow[]).forEach((row) => {
      const sourceEntryId =
        typeof row.source_entry_id === "string" ? row.source_entry_id.trim() : "";
      if (!sourceEntryId) return;
      const extracted = row.extracted_fields ?? {};
      const linkedRaw =
        extracted && typeof extracted === "object"
          ? String(extracted["linked key skills"] ?? "")
          : "";
      linkedRawBySourceEntryId.set(sourceEntryId, linkedRaw);
    });
  }

  const [
    { data: descriptorRows, error: descriptorsError },
    { data: coverageRows, error: coverageError },
    { data: keySkillRows, error: keySkillsError },
    { data: cipRows, error: cipsError },
  ] =
    await Promise.all([
      supabase.from("descriptors").select("id, key_skill_id, text, sort_order"),
      supabase
        .from("key_skill_descriptor_coverage")
        .select("descriptor_id, key_skill_id, covered")
        .eq("user_id", user.id),
      supabase.from("key_skills").select("id, title, cip_id, kaizen_ids"),
      supabase.from("cips").select("id, number"),
    ]);

  if (descriptorsError) {
    return NextResponse.json(
      { error: "Failed to load descriptors: " + descriptorsError.message },
      { status: 500 },
    );
  }
  if (coverageError) {
    return NextResponse.json(
      { error: "Failed to load descriptor coverage: " + coverageError.message },
      { status: 500 },
    );
  }
  if (keySkillsError) {
    return NextResponse.json(
      { error: "Failed to load key skills: " + keySkillsError.message },
      { status: 500 },
    );
  }
  if (cipsError) {
    return NextResponse.json(
      { error: "Failed to load cips: " + cipsError.message },
      { status: 500 },
    );
  }

  const coveredDescriptorIds = new Set<string>();
  ((coverageRows ?? []) as CoverageRow[]).forEach((row) => {
    if (row.covered === true) {
      coveredDescriptorIds.add(String(row.descriptor_id));
    }
  });

  const gapSkillIdsSet = new Set<string>();
  ((descriptorRows ?? []) as DescriptorRow[]).forEach((descriptor) => {
    const descriptorId = String(descriptor.id);
    const keySkillId = String(descriptor.key_skill_id);
    if (!coveredDescriptorIds.has(descriptorId) && keySkillId) {
      gapSkillIdsSet.add(keySkillId);
    }
  });
  const gapSkillIds = Array.from(gapSkillIdsSet);
  const sortedGapSkillIds = [...gapSkillIds].sort();

  const descriptorCountByKeySkillId = new Map<string, number>();
  ((descriptorRows ?? []) as DescriptorRow[]).forEach((descriptor) => {
    const keySkillId = String(descriptor.key_skill_id);
    descriptorCountByKeySkillId.set(
      keySkillId,
      (descriptorCountByKeySkillId.get(keySkillId) ?? 0) + 1,
    );
  });

  const keySkillByKaizenId = new Map<string, KeySkillRow>();
  const keySkillByNormalizedTitle = new Map<string, KeySkillRow>();
  const keySkillById = new Map<string, KeySkillRow>();
  ((keySkillRows ?? []) as KeySkillRow[]).forEach((row) => {
    const keySkill: KeySkillRow = {
      id: String(row.id),
      title: String(row.title ?? ""),
      cip_id: row.cip_id ? String(row.cip_id) : null,
      kaizen_ids: Array.isArray(row.kaizen_ids) ? row.kaizen_ids : null,
    };
    keySkillById.set(keySkill.id, keySkill);
    const normalizedTitle = normalizeSkillTitle(keySkill.title);
    if (normalizedTitle && !keySkillByNormalizedTitle.has(normalizedTitle)) {
      keySkillByNormalizedTitle.set(normalizedTitle, keySkill);
    }
    if (Array.isArray(keySkill.kaizen_ids)) {
      keySkill.kaizen_ids.forEach((kaizenId) => {
        const normalizedKaizenId = String(kaizenId || "").trim();
        if (normalizedKaizenId && !keySkillByKaizenId.has(normalizedKaizenId)) {
          keySkillByKaizenId.set(normalizedKaizenId, keySkill);
        }
      });
    }
  });

  const cipNumberById = new Map<string, number>();
  ((cipRows ?? []) as CipRow[]).forEach((row) => {
    cipNumberById.set(String(row.id), Number(row.number ?? 0));
  });

  const confirmedPortfolioCountByKeySkillId = new Map<string, number>();
  const confirmedPortfolioCountByCipNumber = new Map<number, number>();
  confirmedSkillIdsByEntryId.forEach((skillIds) => {
    skillIds.forEach((skillId) => {
      confirmedPortfolioCountByKeySkillId.set(
        skillId,
        (confirmedPortfolioCountByKeySkillId.get(skillId) ?? 0) + 1,
      );
      const cipId = keySkillById.get(skillId)?.cip_id ?? null;
      const cipNumber = cipId ? cipNumberById.get(cipId) ?? 0 : 0;
      if (cipNumber > 0) {
        confirmedPortfolioCountByCipNumber.set(
          cipNumber,
          (confirmedPortfolioCountByCipNumber.get(cipNumber) ?? 0) + 1,
        );
      }
    });
  });

  const uncoveredDescriptorCountByKeySkillId = new Map<string, number>();
  descriptorCountByKeySkillId.forEach((_, keySkillId) => {
    uncoveredDescriptorCountByKeySkillId.set(keySkillId, 0);
  });
  ((descriptorRows ?? []) as DescriptorRow[]).forEach((descriptor) => {
    const descriptorId = String(descriptor.id);
    const keySkillId = String(descriptor.key_skill_id);
    if (!coveredDescriptorIds.has(descriptorId) && keySkillId) {
      uncoveredDescriptorCountByKeySkillId.set(
        keySkillId,
        (uncoveredDescriptorCountByKeySkillId.get(keySkillId) ?? 0) + 1,
      );
    }
  });

  const descriptorsByKeySkillId = new Map<
    string,
    Array<{ descriptor_id: string; text: string; sort_order: number }>
  >();
  ((descriptorRows ?? []) as DescriptorRow[]).forEach((descriptor) => {
    const keySkillId = String(descriptor.key_skill_id);
    const descriptors = descriptorsByKeySkillId.get(keySkillId) ?? [];
    descriptors.push({
      descriptor_id: String(descriptor.id),
      text: String(descriptor.text ?? ""),
      sort_order: Number(descriptor.sort_order ?? 0),
    });
    descriptorsByKeySkillId.set(keySkillId, descriptors);
  });
  descriptorsByKeySkillId.forEach((descriptors) =>
    descriptors.sort((a, b) => a.sort_order - b.sort_order),
  );

  const responseEntries: Array<Record<string, unknown>> = [];
  let markerUpdateFailureCount = 0;
  for (const entry of entries) {
    const metadata =
      entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
    const sourceEntryIdFromMeta =
      typeof metadata.source_entry_id === "string" ? metadata.source_entry_id.trim() : "";
    const sourceEntryId = sourceEntryIdFromMeta || String(entry.source_entry_key || "").trim();
    const overrideValue = metadata.skills_per_entry_target_override;
    const effectiveTarget = resolveEffectiveSkillsPerEntryTarget(
      overrideValue,
      profileDefault,
    );
    const confirmedSkillCount =
      confirmedSkillIdsByEntryId.get(entry.id)?.size ?? 0;
    const confirmedSkillIdsSorted = Array.from(
      confirmedSkillIdsByEntryId.get(entry.id) ?? new Set<string>(),
    ).sort();
    const linkedKeySkillsRaw = linkedRawBySourceEntryId.get(sourceEntryId) ?? "";
    const linkedKeySkillsParsed = parseLinkedKeySkillsRaw(linkedKeySkillsRaw);
    const currentLinkedSkills: ResolvedCurrentLinkedSkill[] = [];
    const unresolvedLinkedSkills: string[] = [];

    linkedKeySkillsParsed.forEach((rawSkill) => {
      const kaizenId = extractKaizenIdFromLinkedSkillRaw(rawSkill);
      let matched: KeySkillRow | null = null;
      let matchMethod: ResolvedCurrentLinkedSkill["match_method"] | null = null;

      if (kaizenId) {
        matched = keySkillByKaizenId.get(kaizenId) ?? null;
        if (matched) matchMethod = "kaizen_id";
      }

      if (!matched && kaizenId) {
        const aliasedTitle = KAIZEN_ID_TITLE_ALIASES[kaizenId];
        const normalizedAlias = aliasedTitle ? normalizeSkillTitle(aliasedTitle) : "";
        matched = normalizedAlias
          ? keySkillByNormalizedTitle.get(normalizedAlias) ?? null
          : null;
        if (matched) matchMethod = "kaizen_id_alias";
      }

      if (!matched) {
        const normalized = normalizeSkillTitle(stripCipPrefixAndId(rawSkill));
        matched = normalized ? keySkillByNormalizedTitle.get(normalized) ?? null : null;
        if (matched) matchMethod = "title_exact";
      }

      if (!matched || !matchMethod) {
        unresolvedLinkedSkills.push(rawSkill);
        return;
      }

      currentLinkedSkills.push({
        raw: rawSkill,
        key_skill_id: matched.id,
        key_skill_title: matched.title,
        cip_number: matched.cip_id ? (cipNumberById.get(matched.cip_id) ?? 0) : 0,
        kaizen_id: kaizenId,
        descriptor_count: descriptorCountByKeySkillId.get(matched.id) ?? 0,
        match_method: matchMethod,
      });
    });

    const rawLinkedSkillCount = new Set(
      linkedKeySkillsParsed.map((raw) => raw.trim()).filter(Boolean),
    ).size;
    const currentLinkedSkillCount = new Set(
      currentLinkedSkills.map((skill) => skill.key_skill_id),
    ).size;
    const kaizenLinkedSkillCount = Math.max(
      rawLinkedSkillCount,
      currentLinkedSkillCount,
    );
    const effectiveLinkedSkillCount = Math.max(
      kaizenLinkedSkillCount,
      confirmedSkillCount,
    );
    const overlinked = kaizenLinkedSkillCount > effectiveTarget;
    const overlinkedBy = Math.max(0, kaizenLinkedSkillCount - effectiveTarget);
    const slotsRemaining = Math.max(0, effectiveTarget - kaizenLinkedSkillCount);

    let currentLinkedSkillQuality: LinkedSkillQuality[] = [];
    const auditWarnings: AuditWarningCode[] = [];
    const auditWarningDetails: AuditWarningDetail[] = [];
    let didAuditPipelineOk = true;
    let entryLlmUsage: LlmUsageTotals = {
      api_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
    const currentLinkedSkillIdsSorted = Array.from(
      new Set(currentLinkedSkills.map((s) => s.key_skill_id)),
    ).sort();
    const currentFingerprint = buildAuditInputFingerprint({
      entry_text: String(entry.entry_text ?? ""),
      entry_type: entry.entry_type ?? null,
      effective_target: effectiveTarget,
      linked_key_skills_raw: linkedKeySkillsRaw,
      gap_skill_ids: sortedGapSkillIds,
      current_linked_key_skill_ids: currentLinkedSkillIdsSorted,
      confirmed_linked_key_skill_ids: confirmedSkillIdsSorted,
      suggestion_state_signature:
        suggestionStateSignatureByEntryId.get(entry.id) ?? "",
    });
    const lastFingerprint =
      typeof metadata[AUDIT_LAST_INPUT_FINGERPRINT_KEY] === "string"
        ? String(metadata[AUDIT_LAST_INPUT_FINGERPRINT_KEY])
        : null;
    const shouldSkip = !forceFullRefresh && !!lastFingerprint && lastFingerprint === currentFingerprint;
    const persistedAuditResult =
      metadata &&
      typeof metadata[AUDIT_LAST_RESULT_KEY] === "object" &&
      metadata[AUDIT_LAST_RESULT_KEY] !== null
        ? (metadata[AUDIT_LAST_RESULT_KEY] as Record<string, unknown>)
        : null;
    const isSupervisorMeeting = isSupervisorMeetingReviewEntry(
      entry.title,
      entry.event_date,
      supervisorMeetingKeys,
    );

    if (isSupervisorMeeting) {
      const supervisorSyncedAt = new Date().toISOString();
      const { error: cleanupError } = await supabase
        .from("key_skill_review_suggestions")
        .delete()
        .eq("user_id", user.id)
        .eq("review_entry_id", entry.id)
        .eq("suggestion_source", "cross_cip")
        .neq("status", "confirmed");
      if (cleanupError) {
        return NextResponse.json(
          {
            error:
              "Failed to clear supervisor meeting suggestions: " +
              cleanupError.message,
          },
          { status: 500 },
        );
      }

      const { error: queueCleanupError } = await supabase
        .from("key_skill_review_push_queue")
        .update({
          status: "synced",
          last_error: null,
          synced_at: supervisorSyncedAt,
          updated_at: supervisorSyncedAt,
        })
        .eq("user_id", user.id)
        .eq("review_entry_id", entry.id);
      if (queueCleanupError) {
        return NextResponse.json(
          {
            error:
              "Failed to clear supervisor meeting V1 queue rows: " +
              queueCleanupError.message,
          },
          { status: 500 },
        );
      }

      const { error: v2JobsCleanupError } = await supabase
        .from("key_skill_review_push_queue_v2_jobs")
        .update({
          status: "synced",
          last_error: null,
          synced_at: supervisorSyncedAt,
          updated_at: supervisorSyncedAt,
          claim_token: null,
          claimed_by: null,
          claimed_at: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
        })
        .eq("user_id", user.id)
        .eq("review_entry_id", entry.id);
      if (v2JobsCleanupError) {
        return NextResponse.json(
          {
            error:
              "Failed to clear supervisor meeting V2 jobs: " +
              v2JobsCleanupError.message,
          },
          { status: 500 },
        );
      }

      const { error: v2GroupsCleanupError } = await supabase
        .from("key_skill_review_push_queue_v2_groups")
        .update({
          status: "synced",
          last_error: null,
          last_synced_at: supervisorSyncedAt,
          updated_at: supervisorSyncedAt,
          claim_token: null,
          claimed_by: null,
          claimed_at: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
        })
        .eq("user_id", user.id)
        .eq("review_entry_id", entry.id);
      if (v2GroupsCleanupError) {
        return NextResponse.json(
          {
            error:
              "Failed to clear supervisor meeting V2 groups: " +
              v2GroupsCleanupError.message,
          },
          { status: 500 },
        );
      }

      const supervisorAuditResult: Record<string, unknown> = {
        review_entry_id: entry.id,
        audit_input_fingerprint: currentFingerprint,
        source_entry_id: sourceEntryId || null,
        effective_target: effectiveTarget,
        confirmed_skill_count: confirmedSkillCount,
        current_linked_skill_count: currentLinkedSkillCount,
        raw_linked_skill_count: rawLinkedSkillCount,
        effective_linked_skill_count: effectiveLinkedSkillCount,
        overlinked: false,
        overlinked_by: 0,
        slots_remaining: effectiveTarget,
        linked_key_skills_raw: linkedKeySkillsRaw,
        linked_key_skills_parsed: linkedKeySkillsParsed,
        current_linked_skills: currentLinkedSkills,
        current_linked_skill_quality: [],
        candidate_recommendations: [],
        audit_findings: [
          {
            type: "ok",
            rationale:
              "Supervisor meeting entry kept visible but excluded from key-skill suggestions.",
          },
        ],
        primary_finding: {
          type: "ok",
          rationale:
            "Supervisor meeting entry kept visible but excluded from key-skill suggestions.",
        },
        unresolved_linked_skills: unresolvedLinkedSkills,
        gap_skill_ids: gapSkillIds,
        gap_skill_count: gapSkillIds.length,
        status_hint: "open",
        audit_skipped: true,
        skip_reason: "supervisor_meeting",
        audit_cost: {
          model: LIVE_AUDIT_MODEL.model,
          ...entryLlmUsage,
          estimated_cost_usd: 0,
        },
      };

      const mergedMetadata = {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        [AUDIT_LAST_RUN_AT_KEY]: new Date().toISOString(),
        [AUDIT_LAST_INPUT_FINGERPRINT_KEY]: currentFingerprint,
        [AUDIT_LAST_RESULT_KEY]: supervisorAuditResult,
      };
      const { error: markerUpdateError } = await supabase
        .from("key_skill_review_entries")
        .update({ metadata: mergedMetadata })
        .eq("id", entry.id)
        .eq("user_id", user.id);
      if (markerUpdateError) {
        return NextResponse.json(
          {
            error:
              "Failed to store supervisor meeting audit marker: " +
              markerUpdateError.message,
          },
          { status: 500 },
        );
      }

      responseEntries.push(supervisorAuditResult);
      continue;
    }

    if (shouldSkip && persistedAuditResult) {
      responseEntries.push({
        ...persistedAuditResult,
        audit_input_fingerprint:
          typeof persistedAuditResult.audit_input_fingerprint === "string"
            ? persistedAuditResult.audit_input_fingerprint
            : currentFingerprint,
        review_entry_id:
          typeof persistedAuditResult.review_entry_id === "string"
            ? persistedAuditResult.review_entry_id
            : entry.id,
        audit_skipped: true,
        skip_reason: "unchanged_input",
      });
      continue;
    }

    if (!shouldSkip && llmEnabled && currentLinkedSkills.length > 0) {
      const analyzerEntry: AnalyzerEntry = {
        entry_text: String(entry.entry_text ?? ""),
        entry_type: entry.entry_type ?? null,
      };
      const analyzerKeySkills: AnalyzerKeySkill[] = currentLinkedSkills.map((skill) => ({
        key_skill_id: skill.key_skill_id,
        cip_number: skill.cip_number,
        title: skill.key_skill_title,
        is_confirmed: true,
        descriptors: descriptorsByKeySkillId.get(skill.key_skill_id) ?? [],
      }));

      try {
        const descriptorAnalysis = await analyzeDescriptorsWithMetrics(
          analyzerEntry,
          analyzerKeySkills,
        );
        entryLlmUsage = addUsage(entryLlmUsage, descriptorAnalysis.metrics);
        runLlmUsage = addUsage(runLlmUsage, descriptorAnalysis.metrics);
        const descriptorResults = descriptorAnalysis.results;
        const descriptorResultsBySkillId = new Map<
          string,
          Array<{ descriptor_id: string; covered: boolean }>
        >();
        descriptorResults.forEach((result) => {
          const rows = descriptorResultsBySkillId.get(result.key_skill_id) ?? [];
          rows.push({
            descriptor_id: String(result.descriptor_id),
            covered: Boolean(result.covered),
          });
          descriptorResultsBySkillId.set(result.key_skill_id, rows);
        });

        currentLinkedSkillQuality = currentLinkedSkills.map((skill) => {
          const expectedDescriptors = descriptorsByKeySkillId.get(skill.key_skill_id) ?? [];
          const expectedDescriptorIds = new Set(
            expectedDescriptors.map((d) => d.descriptor_id),
          );
          const resultsForSkill = descriptorResultsBySkillId.get(skill.key_skill_id) ?? [];
          const coveredDescriptorIds = Array.from(
            new Set(
              resultsForSkill
                .filter((r) => r.covered && expectedDescriptorIds.has(r.descriptor_id))
                .map((r) => r.descriptor_id),
            ),
          );
          const weakDescriptorIds = expectedDescriptors
            .map((d) => d.descriptor_id)
            .filter((id) => !coveredDescriptorIds.includes(id));
          const totalDescriptors = expectedDescriptors.length;
          const coveredDescriptorsCount = coveredDescriptorIds.length;
          const evidenceScore =
            totalDescriptors > 0 ? coveredDescriptorsCount / totalDescriptors : 0;
          const verdict: LinkedSkillQuality["verdict"] =
            evidenceScore < 0.4 ? "weak" : evidenceScore <= 0.7 ? "moderate" : "strong";

          return {
            key_skill_id: skill.key_skill_id,
            key_skill_title: skill.key_skill_title,
            evidence_score: evidenceScore,
            verdict,
            total_descriptors: totalDescriptors,
            covered_descriptors_count: coveredDescriptorsCount,
            covered_descriptor_ids: coveredDescriptorIds,
            weak_descriptor_ids: weakDescriptorIds,
          };
        });
      } catch (err) {
        const usageFromError = extractLlmUsageFromError(err);
        entryLlmUsage = addUsage(entryLlmUsage, usageFromError);
        runLlmUsage = addUsage(runLlmUsage, usageFromError);
        didAuditPipelineOk = false;
        currentLinkedSkillQuality = [];
        auditWarnings.push("descriptor_analysis_failed");
        auditWarningDetails.push(
          buildAuditWarningDetail(
            "descriptor_analysis_failed",
            "descriptor_analysis",
            err,
          ),
        );
      }
    }

    const currentLinkedSkillIdSet = new Set(
      currentLinkedSkills.map((skill) => skill.key_skill_id),
    );
    const confirmedSkillIdSet = confirmedSkillIdsByEntryId.get(entry.id) ?? new Set<string>();
    const candidatePool = gapSkillIds
      .filter((skillId) => !currentLinkedSkillIdSet.has(skillId))
      .filter((skillId) => !confirmedSkillIdSet.has(skillId))
      .map((skillId): AuditCandidateInput | null => {
        const matched = keySkillById.get(skillId) ?? null;
        if (!matched) return null;
        const normalizedSkill: KeySkillRow = matched;
        const descriptorSnippets = (descriptorsByKeySkillId.get(skillId) ?? [])
          .slice(0, 3)
          .map((d) => d.text)
          .filter(Boolean);
        const cipNumber = normalizedSkill.cip_id
          ? (cipNumberById.get(normalizedSkill.cip_id) ?? 0)
          : 0;
        const needSignal = buildPortfolioNeedSignal({
          keySkillId: normalizedSkill.id,
          cipNumber,
          descriptorCountByKeySkillId,
          uncoveredDescriptorCountByKeySkillId,
          confirmedPortfolioCountByKeySkillId,
          confirmedPortfolioCountByCipNumber,
        });
        return {
          key_skill_id: normalizedSkill.id,
          key_skill_title: normalizedSkill.title,
          cip_number: cipNumber,
          descriptor_snippets: descriptorSnippets,
          portfolio_need_score: needSignal.portfolio_need_score,
          missing_descriptor_count: needSignal.missing_descriptor_count,
          total_descriptor_count: needSignal.total_descriptor_count,
          confirmed_portfolio_count: needSignal.confirmed_portfolio_count,
          cip_confirmed_portfolio_count: needSignal.cip_confirmed_portfolio_count,
          portfolio_need_reasons: needSignal.portfolio_need_reasons,
        };
      })
      .filter((c): c is AuditCandidateInput => c !== null)
      .sort((a, b) => {
        const byNeed =
          (b.portfolio_need_score ?? 0) - (a.portfolio_need_score ?? 0);
        if (byNeed !== 0) return byNeed;
        return b.cip_number - a.cip_number;
      })
      .slice(0, 30);
    const topPortfolioGapExamples = candidatePool.slice(0, 3).map((candidate) => {
      const missingDescriptorCount = candidate.missing_descriptor_count ?? 0;
      const totalDescriptorCount =
        candidate.total_descriptor_count ?? missingDescriptorCount;
      return `${candidate.key_skill_title} (${missingDescriptorCount}/${Math.max(
        totalDescriptorCount,
        missingDescriptorCount,
      )} descriptors uncovered)`;
    });

    let candidateRecommendations: CandidateRecommendation[] = [];
    if (!shouldSkip && llmEnabled && candidatePool.length > 0) {
      try {
        const candidateSuggestionResult = await suggestAuditCandidatesWithMetrics({
          entry: {
            entry_text: String(entry.entry_text ?? ""),
            entry_type: entry.entry_type ?? null,
          },
          available_slots: slotsRemaining,
          current_linked_skill_quality: currentLinkedSkillQuality.map((q) => {
            const currentLinkedSkill = currentLinkedSkills.find(
              (skill) => skill.key_skill_id === q.key_skill_id,
            );
            const removalSignal = buildRemovalSignal({
              keySkillId: q.key_skill_id,
              keySkillTitle: q.key_skill_title,
              entryText: String(entry.entry_text ?? ""),
              cipNumber: currentLinkedSkill?.cip_number ?? 0,
              quality: q,
              descriptorCountByKeySkillId,
              uncoveredDescriptorCountByKeySkillId,
              confirmedPortfolioCountByKeySkillId,
              confirmedPortfolioCountByCipNumber,
            });
            return {
              key_skill_id: q.key_skill_id,
              key_skill_title: q.key_skill_title,
              verdict: q.verdict,
              evidence_score: q.evidence_score,
              removal_cost: removalSignal.removal_cost,
              portfolio_risk_reasons: removalSignal.removal_reasons,
            };
          }),
          candidates: candidatePool,
        });
        entryLlmUsage = addUsage(entryLlmUsage, candidateSuggestionResult.metrics);
        runLlmUsage = addUsage(runLlmUsage, candidateSuggestionResult.metrics);
        const llmSuggestions = candidateSuggestionResult.suggestions;

        const candidatePoolById = new Map(
          candidatePool.map((candidate) => [candidate.key_skill_id, candidate] as const),
        );
        const replaceableSkillById = new Map(
          currentLinkedSkills.map((skill) => [skill.key_skill_id, skill] as const),
        );

        candidateRecommendations = llmSuggestions
          .filter((item) => item.action === "add" || item.action === "replace")
          .filter((item) => Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1)
          .filter((item) => candidatePoolById.has(item.key_skill_id))
          .filter((item) => {
            if (item.action !== "replace") return true;
            return Boolean(
              item.replace_skill_id && replaceableSkillById.has(item.replace_skill_id),
            );
          })
          .slice(0, 2)
          .map((item) => {
            const candidate = candidatePoolById.get(item.key_skill_id)!;
            const replacement = item.replace_skill_id
              ? replaceableSkillById.get(item.replace_skill_id) ?? null
              : null;
            const action: "add" | "replace" =
              item.action === "replace" ? "replace" : "add";
            return {
              key_skill_id: candidate.key_skill_id,
              key_skill_title: candidate.key_skill_title,
              cip_number: candidate.cip_number,
              action,
              replace_skill_id: action === "replace" ? item.replace_skill_id : null,
              replace_skill_title:
                action === "replace" ? replacement?.key_skill_title ?? null : null,
              confidence: item.confidence,
              rationale: item.rationale,
              portfolio_need_score: candidate.portfolio_need_score,
              logic_points: [
                ...(candidate.portfolio_need_reasons ?? []).slice(0, 2),
                candidate.portfolio_need_score != null
                  ? `Portfolio need score ${candidate.portfolio_need_score.toFixed(2)}`
                  : null,
              ].filter((value): value is string => Boolean(value)),
            };
          });
      } catch (err) {
        const usageFromError = extractLlmUsageFromError(err);
        entryLlmUsage = addUsage(entryLlmUsage, usageFromError);
        runLlmUsage = addUsage(runLlmUsage, usageFromError);
        didAuditPipelineOk = false;
        auditWarnings.push("candidate_analysis_failed");
        auditWarningDetails.push(
          buildAuditWarningDetail(
            "candidate_analysis_failed",
            "candidate_analysis",
            err,
          ),
        );
      }
    }

    const qualityBySkillId = new Map(
      currentLinkedSkillQuality.map((quality) => [quality.key_skill_id, quality] as const),
    );
    const currentRemovalCandidates = overlinked
      ? currentLinkedSkills
          .filter(
            (skill) =>
              typeof skill.kaizen_id === "string" && skill.kaizen_id.trim().length > 0,
          )
          .map((skill) => {
            const removalSignal = buildRemovalSignal({
              keySkillId: skill.key_skill_id,
              keySkillTitle: skill.key_skill_title,
              entryText: String(entry.entry_text ?? ""),
              cipNumber: skill.cip_number,
              quality: qualityBySkillId.get(skill.key_skill_id) ?? null,
              descriptorCountByKeySkillId,
              uncoveredDescriptorCountByKeySkillId,
              confirmedPortfolioCountByKeySkillId,
              confirmedPortfolioCountByCipNumber,
            });
            return { skill, removalSignal };
          })
      : [];

    const removalRecommendations: CandidateRecommendation[] = overlinked
      ? currentRemovalCandidates
          .map(({ skill, removalSignal }) => {
            const strongerPeerTitles = currentRemovalCandidates
              .filter(
                (candidate) =>
                  candidate.skill.key_skill_id !== skill.key_skill_id &&
                  candidate.removalSignal.removal_cost >
                    removalSignal.removal_cost + 0.4,
              )
              .sort(
                (a, b) =>
                  b.removalSignal.removal_cost - a.removalSignal.removal_cost,
              )
              .slice(0, 2)
              .map((candidate) => candidate.skill.key_skill_title);
            const rationaleParts = [
              removalSignal.removal_reasons[0],
              removalSignal.removal_reasons.find((reason) =>
                reason.toLowerCase().includes("already supported elsewhere"),
              ) ??
                removalSignal.removal_reasons.find((reason) =>
                  reason.toLowerCase().includes("broader portfolio coverage"),
                ) ??
                removalSignal.removal_reasons[1],
            ].filter(Boolean);
            const confidence = clampAuditConfidence(
              0.92 - Math.min(removalSignal.removal_cost, 3.2) * 0.12,
            );
            const logicPoints = [
              removalSignal.removal_reasons[0],
              removalSignal.removal_reasons.find((reason) =>
                reason.toLowerCase().includes("already supported elsewhere"),
              ) ??
                removalSignal.removal_reasons.find((reason) =>
                  reason.toLowerCase().includes("broader portfolio coverage"),
                ) ??
                removalSignal.removal_reasons[1],
              strongerPeerTitles.length > 0
                ? `Other current links are more central to this entry: ${strongerPeerTitles.join(
                    " · ",
                  )}`
                : removalSignal.removal_reasons.find((reason) =>
                    reason.toLowerCase().includes("secondary"),
                  ) ?? null,
            ].filter((value): value is string => Boolean(value));
            return {
              key_skill_id: skill.key_skill_id,
              key_skill_title: skill.key_skill_title,
              cip_number: skill.cip_number,
              action: "remove" as const,
              replace_skill_id: null,
              replace_skill_title: null,
              confidence,
              rationale: rationaleParts.join(". "),
              removal_cost: removalSignal.removal_cost,
              target_kaizen_skill_id: skill.kaizen_id,
              logic_points: logicPoints,
            };
          })
          .sort((a, b) => {
            const byCost = (a.removal_cost ?? 0) - (b.removal_cost ?? 0);
            if (byCost !== 0) return byCost;
            return b.confidence - a.confidence;
          })
          .slice(0, Math.max(1, overlinkedBy))
      : [];

    const findingsReplace: Array<Extract<AuditFinding, { type: "replace" }>> = [];
    const findingsAdd: Array<Extract<AuditFinding, { type: "add" }>> = [];
    const findingsRemove: Array<Extract<AuditFinding, { type: "remove" }>> = [];
    const findingsOverlinked: AuditFinding[] = overlinked
      ? [
          {
            type: "overlinked",
            current_linked_skill_count: currentLinkedSkillCount,
            raw_linked_skill_count: rawLinkedSkillCount,
            effective_linked_skill_count: effectiveLinkedSkillCount,
            effective_target: effectiveTarget,
            overlinked_by: overlinkedBy,
            rationale:
              "Current linked skills exceed effective per-entry target",
          },
        ]
      : [];

    const removeRecommendationsWithoutReplace = removalRecommendations.filter(
      (rec) =>
        !candidateRecommendations.some(
          (candidate) =>
            candidate.action === "replace" &&
            candidate.replace_skill_id === rec.key_skill_id,
        ),
    );

    candidateRecommendations = [
      ...removeRecommendationsWithoutReplace,
      ...candidateRecommendations,
    ];

    const protectedCurrentSkillIds = new Set(
      currentLinkedSkills
        .filter((skill) =>
          isProtectedCurrentSkill(String(entry.entry_text ?? ""), skill.key_skill_title),
        )
        .map((skill) => skill.key_skill_id),
    );

    if (protectedCurrentSkillIds.size > 0) {
      candidateRecommendations = candidateRecommendations.filter((candidate) => {
        if (
          candidate.action === "remove" &&
          protectedCurrentSkillIds.has(candidate.key_skill_id)
        ) {
          return false;
        }
        if (
          candidate.action === "replace" &&
          candidate.replace_skill_id &&
          protectedCurrentSkillIds.has(candidate.replace_skill_id)
        ) {
          return false;
        }
        return true;
      });
    }

    const pendingSuggestionsForPlan = (pendingSuggestionsByEntryId.get(entry.id) ?? [])
      .map((suggestion) => {
        const keySkill = keySkillById.get(suggestion.key_skill_id);
        const cipNumber = keySkill?.cip_id
          ? cipNumberById.get(keySkill.cip_id) ?? 0
          : 0;
        return {
          key_skill_id: suggestion.key_skill_id,
          key_skill_title: keySkill?.title ?? suggestion.key_skill_id,
          cip_number: cipNumber,
          confidence: suggestion.confidence,
          rationale: suggestion.rationale,
          suggestion_source: suggestion.suggestion_source,
          suggested_action: suggestion.suggested_action,
        };
      })
      .filter((suggestion) => suggestion.key_skill_title.length > 0);

    const buildCurrentSkillsForPlan = (protectedSkillIds?: Set<string>) =>
      currentLinkedSkills.map((skill) => {
        const currentRemovalCandidate = currentRemovalCandidates.find(
          (candidate) => candidate.skill.key_skill_id === skill.key_skill_id,
        );
        const isProtected = protectedSkillIds?.has(skill.key_skill_id) ?? false;
        return {
          key_skill_id: skill.key_skill_id,
          key_skill_title: skill.key_skill_title,
          cip_number: skill.cip_number,
          removal_cost:
            (currentRemovalCandidate?.removalSignal.removal_cost ?? 0) +
            (isProtected ? 4 : 0),
          rationale: isProtected
            ? "Protected by review pass as a clearly central current link."
            : currentRemovalCandidate?.removalSignal.removal_reasons[0] ??
              "This current link can be reviewed against the cap.",
          logic_points: isProtected
            ? [
                "Protected by review pass as a clearly central current link.",
                ...(currentRemovalCandidate?.removalSignal.removal_reasons ?? []).slice(0, 2),
              ]
            : currentRemovalCandidate?.removalSignal.removal_reasons ?? [],
        };
      });

    let reviewProtectedSkillIds = new Set<string>();
    let auditLinkPlan = overlinked
      ? buildEntryLinkPlan({
          effectiveTarget,
          currentLinkedCount: kaizenLinkedSkillCount,
          currentSkills: buildCurrentSkillsForPlan(),
          pendingSuggestions: pendingSuggestionsForPlan,
          candidateRecommendations,
        })
      : null;

    if (llmEnabled && auditLinkPlan) {
      const reviewNeed = needsPlanReview({
        entryText: String(entry.entry_text ?? ""),
        draftPlan: auditLinkPlan,
        unresolvedLinkedSkills,
        qualityBySkillId,
      });

      if (reviewNeed.needed) {
        try {
          const review = await reviewPlanForProtectedSkills({
            entryText: String(entry.entry_text ?? ""),
            currentSkills: currentLinkedSkills,
            draftPlan: auditLinkPlan,
            reviewReasons: reviewNeed.reasons,
          });
          entryLlmUsage = addUsage(entryLlmUsage, review.usage);
          runLlmUsage = addUsage(runLlmUsage, review.usage);
          reviewProtectedSkillIds = new Set(
            review.result.protected_current_skill_ids.filter((id) =>
              currentLinkedSkills.some((skill) => skill.key_skill_id === id),
            ),
          );

          if (reviewProtectedSkillIds.size > 0) {
            candidateRecommendations = candidateRecommendations.filter((candidate) => {
              if (
                candidate.action === "remove" &&
                reviewProtectedSkillIds.has(candidate.key_skill_id)
              ) {
                return false;
              }
              if (
                candidate.action === "replace" &&
                candidate.replace_skill_id &&
                reviewProtectedSkillIds.has(candidate.replace_skill_id)
              ) {
                return false;
              }
              return true;
            });

            auditLinkPlan = buildEntryLinkPlan({
              effectiveTarget,
              currentLinkedCount: kaizenLinkedSkillCount,
              currentSkills: buildCurrentSkillsForPlan(reviewProtectedSkillIds),
              pendingSuggestions: pendingSuggestionsForPlan,
              candidateRecommendations,
            });
          }
        } catch (err) {
          const usageFromError = extractLlmUsageFromError(err);
          entryLlmUsage = addUsage(entryLlmUsage, usageFromError);
          runLlmUsage = addUsage(runLlmUsage, usageFromError);
          didAuditPipelineOk = false;
          auditWarnings.push("plan_review_failed");
          auditWarningDetails.push(
            buildAuditWarningDetail(
              "plan_review_failed",
              "plan_review",
              err,
            ),
          );
        }
      }
    }

    if (auditLinkPlan) {
      auditLinkPlan.skills.forEach((skill) => {
        if (skill.decision === "remove") {
          const quality = qualityBySkillId.get(skill.key_skill_id) ?? null;
          const normalizedRationale = (() => {
            if (quality?.verdict === "strong" && skill.rationale.trim() === "Strongly evidenced on this entry") {
              return "Strongly evidenced on this entry, but less central than the kept links under the entry cap";
            }
            return skill.rationale;
          })();
          findingsRemove.push({
            type: "remove",
            key_skill_id: skill.key_skill_id,
            key_skill_title: skill.key_skill_title,
            cip_number: skill.cip_number,
            confidence:
              typeof skill.confidence === "number" && skill.confidence > 0
                ? skill.confidence
                : 0,
            rationale: normalizedRationale,
            ...(() => {
              const matchingRecommendation = candidateRecommendations.find(
                (candidate) =>
                  candidate.action === "remove" &&
                  candidate.key_skill_id === skill.key_skill_id,
              );
              return typeof matchingRecommendation?.removal_cost === "number"
                ? { removal_cost: matchingRecommendation.removal_cost }
                : {};
            })(),
          });
          return;
        }

        if (
          skill.decision === "replace_in" &&
          skill.replace_skill_id &&
          slotsRemaining === 0
        ) {
          findingsReplace.push({
            type: "replace",
            key_skill_id: skill.key_skill_id,
            key_skill_title: skill.key_skill_title,
            cip_number: skill.cip_number,
            replace_skill_id: skill.replace_skill_id,
            replace_skill_title: skill.replace_skill_title ?? null,
            confidence: skill.confidence ?? 0,
            rationale: skill.rationale,
          });
          return;
        }

        if (skill.decision === "replace_in" && !skill.replace_skill_id && slotsRemaining > 0) {
          findingsAdd.push({
            type: "add",
            key_skill_id: skill.key_skill_id,
            key_skill_title: skill.key_skill_title,
            cip_number: skill.cip_number,
            confidence: skill.confidence ?? 0,
            rationale: skill.rationale,
          });
        }
      });
    } else {
      candidateRecommendations.forEach((rec) => {
        if (rec.action === "remove") {
          findingsRemove.push({
            type: "remove",
            key_skill_id: rec.key_skill_id,
            key_skill_title: rec.key_skill_title,
            cip_number: rec.cip_number,
            confidence: rec.confidence,
            rationale: rec.rationale,
            ...(typeof rec.removal_cost === "number"
              ? { removal_cost: rec.removal_cost }
              : {}),
          });
          return;
        }
        if (rec.action === "replace" && slotsRemaining === 0 && rec.replace_skill_id) {
          findingsReplace.push({
            type: "replace",
            key_skill_id: rec.key_skill_id,
            key_skill_title: rec.key_skill_title,
            cip_number: rec.cip_number,
            replace_skill_id: rec.replace_skill_id,
            replace_skill_title: rec.replace_skill_title,
            confidence: rec.confidence,
            rationale: rec.rationale,
          });
          return;
        }
        if (rec.action === "add" && slotsRemaining > 0) {
          findingsAdd.push({
            type: "add",
            key_skill_id: rec.key_skill_id,
            key_skill_title: rec.key_skill_title,
            cip_number: rec.cip_number,
            confidence: rec.confidence,
            rationale: rec.rationale,
          });
        }
      });
    }

    const replacedSkillIds = new Set(findingsReplace.map((finding) => finding.replace_skill_id));
    const finalActionSkillIds = new Set([
      ...findingsRemove.map((finding) => finding.key_skill_id),
      ...findingsReplace.map((finding) => finding.replace_skill_id),
    ]);
    const weakFlags: Array<Extract<AuditFinding, { type: "flag" }>> = currentLinkedSkillQuality
      .filter((quality) => quality.verdict === "weak")
      .filter((quality) => !finalActionSkillIds.has(quality.key_skill_id))
      .filter((quality) => !replacedSkillIds.has(quality.key_skill_id))
      .map((quality) => ({
        type: "flag",
        key_skill_id: quality.key_skill_id,
        key_skill_title: quality.key_skill_title,
        reason: "weak_unreplaced",
        evidence_score: quality.evidence_score,
        rationale: "Weak linked skill has no valid replacement recommendation",
      }));

    const filteredWeakFlags =
      auditLinkPlan != null && (findingsRemove.length > 0 || findingsReplace.length > 0)
        ? []
        : weakFlags;

    const auditFindings: AuditFinding[] = [
      ...findingsOverlinked,
      ...findingsRemove,
      ...findingsReplace,
      ...findingsAdd,
      ...filteredWeakFlags,
    ];
    if (auditFindings.length === 0) {
      auditFindings.push({
        type: "ok",
        rationale: "No actionable add/remove/replace/flag finding for this entry",
      });
    }
    const primaryFinding = auditFindings[0];

    const actionableFindings = auditFindings.filter(
      (finding): finding is Extract<AuditFinding, { type: "add" | "replace" }> =>
        finding.type === "add" || finding.type === "replace",
    );
    let didPersistRecommendationsOk = true;
    if (!shouldSkip && actionableFindings.length > 0) {
      const actionableSkillIds = Array.from(
        new Set(actionableFindings.map((finding) => finding.key_skill_id)),
      );
      try {
        let structuredColumnsUnavailable = false;
        let existingSuggestionRows:
          | Array<Record<string, unknown>>
          | null
          | undefined;
        const existingStructured = await supabase
          .from("key_skill_review_suggestions")
          .select("id, key_skill_id, suggestion_source, status, suggested_action, replace_key_skill_id")
          .eq("user_id", user.id)
          .eq("review_entry_id", entry.id)
          .eq("suggestion_source", "cross_cip")
          .in("key_skill_id", actionableSkillIds);

        if (isMissingStructuredSuggestionColumnsError(existingStructured.error)) {
          structuredColumnsUnavailable = true;
          const existingLegacy = await supabase
            .from("key_skill_review_suggestions")
            .select("id, key_skill_id, suggestion_source, status")
            .eq("user_id", user.id)
            .eq("review_entry_id", entry.id)
            .eq("suggestion_source", "cross_cip")
            .in("key_skill_id", actionableSkillIds);
          if (existingLegacy.error) throw existingLegacy.error;
          existingSuggestionRows = existingLegacy.data as Array<Record<string, unknown>> | null;
        } else {
          if (existingStructured.error) throw existingStructured.error;
          existingSuggestionRows = existingStructured.data as Array<Record<string, unknown>> | null;
        }

        const existingByKeySkillId = new Map<string, SuggestionRow>();
        ((existingSuggestionRows ?? []) as SuggestionRow[]).forEach((row) => {
          existingByKeySkillId.set(String(row.key_skill_id), row);
        });

        const upsertRows = actionableFindings
          .filter((finding) => {
            const existing = existingByKeySkillId.get(finding.key_skill_id);
            const existingStatus = String(existing?.status ?? "");
            return existingStatus !== "confirmed" && existingStatus !== "rejected";
          })
          .map((finding) => ({
            user_id: user.id,
            review_entry_id: entry.id,
            key_skill_id: finding.key_skill_id,
            suggestion_source: "cross_cip" as const,
            method: "ai" as const,
            status: "suggested" as const,
            confidence: finding.confidence,
            rationale: finding.rationale,
            ...(structuredColumnsUnavailable
              ? {}
              : {
                  suggested_action: finding.type,
                  replace_key_skill_id:
                    finding.type === "replace" ? finding.replace_skill_id : null,
                }),
          }));

        if (upsertRows.length > 0) {
          const upsertStructured = await supabase
            .from("key_skill_review_suggestions")
            .upsert(upsertRows, {
              onConflict: "review_entry_id,key_skill_id,suggestion_source",
            });
          if (isMissingStructuredSuggestionColumnsError(upsertStructured.error)) {
            structuredColumnsUnavailable = true;
            const legacyUpsertRows = upsertRows.map((row) => ({
              user_id: row.user_id,
              review_entry_id: row.review_entry_id,
              key_skill_id: row.key_skill_id,
              suggestion_source: row.suggestion_source,
              method: row.method,
              status: row.status,
              confidence: row.confidence,
              rationale: row.rationale,
            }));
            const upsertLegacy = await supabase
              .from("key_skill_review_suggestions")
              .upsert(legacyUpsertRows, {
                onConflict: "review_entry_id,key_skill_id,suggestion_source",
              });
            if (upsertLegacy.error) throw upsertLegacy.error;
          } else if (upsertStructured.error) {
            throw upsertStructured.error;
          }
        }

        let finalSuggestionRows:
          | Array<Record<string, unknown>>
          | null
          | undefined;
        const finalStructured = await supabase
          .from("key_skill_review_suggestions")
          .select("id, key_skill_id, suggestion_source, status, suggested_action, replace_key_skill_id")
          .eq("user_id", user.id)
          .eq("review_entry_id", entry.id)
          .eq("suggestion_source", "cross_cip")
          .in("key_skill_id", actionableSkillIds);
        if (isMissingStructuredSuggestionColumnsError(finalStructured.error)) {
          structuredColumnsUnavailable = true;
          const finalLegacy = await supabase
            .from("key_skill_review_suggestions")
            .select("id, key_skill_id, suggestion_source, status")
            .eq("user_id", user.id)
            .eq("review_entry_id", entry.id)
            .eq("suggestion_source", "cross_cip")
            .in("key_skill_id", actionableSkillIds);
          if (finalLegacy.error) throw finalLegacy.error;
          finalSuggestionRows = finalLegacy.data as Array<Record<string, unknown>> | null;
        } else {
          if (finalStructured.error) throw finalStructured.error;
          finalSuggestionRows = finalStructured.data as Array<Record<string, unknown>> | null;
        }

        const suggestionIdByKeySkillId = new Map<string, string>();
        ((finalSuggestionRows ?? []) as SuggestionRow[]).forEach((row) => {
          suggestionIdByKeySkillId.set(String(row.key_skill_id), String(row.id));
        });
        candidateRecommendations = candidateRecommendations.map((rec) => {
          if (rec.action !== "add" && rec.action !== "replace") return rec;
          const suggestionId = suggestionIdByKeySkillId.get(rec.key_skill_id);
          return suggestionId ? { ...rec, suggestion_id: suggestionId } : rec;
        });
        if (structuredColumnsUnavailable) {
          auditWarnings.push("audit_structured_action_columns_unavailable");
          auditWarningDetails.push({
            warning: "audit_structured_action_columns_unavailable",
            stage: "suggestion_persistence",
            message:
              "Structured suggestion columns unavailable; legacy fallback used.",
          });
        }
      } catch (err) {
        didAuditPipelineOk = false;
        didPersistRecommendationsOk = false;
        auditWarnings.push("audit_suggestion_upsert_failed");
        auditWarningDetails.push(
          buildAuditWarningDetail(
            "audit_suggestion_upsert_failed",
            "suggestion_persistence",
            err,
          ),
        );
      }
    }

    const auditResultForMetadata: Record<string, unknown> = {
      review_entry_id: entry.id,
      audit_input_fingerprint: currentFingerprint,
      source_entry_id: sourceEntryId || null,
      effective_target: effectiveTarget,
      confirmed_skill_count: confirmedSkillCount,
      current_linked_skill_count: currentLinkedSkillCount,
      raw_linked_skill_count: rawLinkedSkillCount,
      effective_linked_skill_count: effectiveLinkedSkillCount,
      overlinked,
      overlinked_by: overlinkedBy,
      slots_remaining: slotsRemaining,
      linked_key_skills_raw: linkedKeySkillsRaw,
      linked_key_skills_parsed: linkedKeySkillsParsed,
      current_linked_skills: currentLinkedSkills,
      current_linked_skill_quality: currentLinkedSkillQuality,
      candidate_recommendations: candidateRecommendations,
      audit_findings: auditFindings,
      primary_finding: primaryFinding,
      unresolved_linked_skills: unresolvedLinkedSkills,
      gap_skill_ids: gapSkillIds,
      gap_skill_count: gapSkillIds.length,
      status_hint: overlinked ? "overlinked" : slotsRemaining === 0 ? "full" : "open",
      ...(auditLinkPlan ? { audit_link_plan: auditLinkPlan } : {}),
      audit_skipped: false,
      audit_cost: {
        model: LIVE_AUDIT_MODEL.model,
        ...entryLlmUsage,
        estimated_cost_usd: llmEnabled
          ? estimateLlmCostUsd(
              entryLlmUsage.input_tokens,
              entryLlmUsage.output_tokens,
              llmPricing,
            )
          : 0,
      },
      ...(auditWarnings.length > 0 ? { audit_warning: auditWarnings } : {}),
      ...(auditWarningDetails.length > 0
        ? { audit_warning_details: auditWarningDetails }
        : {}),
    };

    if (!shouldSkip) {
      const metadataPatch: Record<string, unknown> = {
        [AUDIT_LAST_RUN_AT_KEY]: new Date().toISOString(),
        [AUDIT_LAST_RESULT_KEY]: auditResultForMetadata,
      };
      if (didAuditPipelineOk && didPersistRecommendationsOk) {
        metadataPatch[AUDIT_LAST_INPUT_FINGERPRINT_KEY] = currentFingerprint;
      }
      const mergedMetadata = {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        ...metadataPatch,
      };
      const { error: markerUpdateError } = await supabase
        .from("key_skill_review_entries")
        .update({ metadata: mergedMetadata })
        .eq("id", entry.id)
        .eq("user_id", user.id);
      if (markerUpdateError) {
        markerUpdateFailureCount += 1;
        auditWarnings.push("audit_marker_update_failed");
        auditWarningDetails.push(
          buildAuditWarningDetail(
            "audit_marker_update_failed",
            "marker_update",
            markerUpdateError,
          ),
        );
      }
    }

    responseEntries.push({
      review_entry_id: entry.id,
      audit_input_fingerprint: currentFingerprint,
      source_entry_id: sourceEntryId || null,
      effective_target: effectiveTarget,
      confirmed_skill_count: confirmedSkillCount,
      current_linked_skill_count: currentLinkedSkillCount,
      raw_linked_skill_count: rawLinkedSkillCount,
      effective_linked_skill_count: effectiveLinkedSkillCount,
      overlinked,
      overlinked_by: overlinkedBy,
      slots_remaining: slotsRemaining,
      linked_key_skills_raw: linkedKeySkillsRaw,
      linked_key_skills_parsed: linkedKeySkillsParsed,
      current_linked_skills: currentLinkedSkills,
      current_linked_skill_quality: currentLinkedSkillQuality,
      candidate_recommendations: candidateRecommendations,
      audit_findings: auditFindings,
      primary_finding: primaryFinding,
      unresolved_linked_skills: unresolvedLinkedSkills,
      gap_skill_ids: gapSkillIds,
      gap_skill_count: gapSkillIds.length,
      status_hint: overlinked ? "overlinked" : slotsRemaining === 0 ? "full" : "open",
      ...(auditLinkPlan ? { audit_link_plan: auditLinkPlan } : {}),
      audit_skipped: shouldSkip,
      audit_cost: {
        model: LIVE_AUDIT_MODEL.model,
        ...entryLlmUsage,
        estimated_cost_usd: llmEnabled
          ? estimateLlmCostUsd(
              entryLlmUsage.input_tokens,
              entryLlmUsage.output_tokens,
              llmPricing,
            )
          : 0,
      },
      ...(!shouldSkip ? {} : { skip_reason: "unchanged_input" }),
      ...(auditWarnings.length > 0 ? { audit_warning: auditWarnings } : {}),
      ...(auditWarningDetails.length > 0
        ? { audit_warning_details: auditWarningDetails }
        : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    summary: {
      entries_considered: responseEntries.length,
      portfolio_gap_skill_count: gapSkillIds.length,
      marker_update_failure_count: markerUpdateFailureCount,
      persistence_partial_failure: markerUpdateFailureCount > 0,
      llm_enabled: llmEnabled,
      llm_configured: envLlmEnabled,
      llm_usage: {
        model: LIVE_AUDIT_MODEL.model,
        ...runLlmUsage,
        estimated_cost_usd: llmEnabled
          ? estimateLlmCostUsd(
              runLlmUsage.input_tokens,
              runLlmUsage.output_tokens,
              llmPricing,
            )
          : 0,
        pricing: llmPricing,
      },
    },
    entries: responseEntries,
  });
}
