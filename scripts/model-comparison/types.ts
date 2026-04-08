export type CallType =
  | "generate"
  | "match-key-skills"
  | "normalizer"
  | "descriptor"
  | "cross-cip"
  | "field-regen";

export interface ModelConfig {
  key: string;
  id: string;
  provider: "anthropic" | "openai-compat";
  label: string;
  envKey: string;
  baseURL?: string;
  /** If true, adds response_format: { type: "json_object" } to OpenAI-compat requests */
  jsonMode?: boolean;
  /** If true, passes reasoning_effort: "none" to disable thinking mode */
  disableThinking?: boolean;
  /** If true, uses max_completion_tokens instead of max_tokens (required by OpenAI GPT-5.x) */
  useCompletionTokens?: boolean;
  /** If true, omits temperature parameter (required by some reasoning models) */
  noTemperature?: boolean;
}

// ── Raw call result ──────────────────────────────────────────────────────────

export interface RawCallResult {
  testCaseId: string;
  callType: CallType;
  modelKey: string;
  rawText: string;
  parsed: unknown;
  parseSuccess: boolean;
  parseMethod: "direct" | "fence-stripped" | "prefix-extracted" | "failed";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error?: string;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  detail?: string;
}

export interface ScoredResult extends RawCallResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

// ── Per-model summary ────────────────────────────────────────────────────────

export interface CallTypeSummary {
  score: number;
  maxScore: number;
  caseCount: number;
  parseFailures: number;
}

export interface ModelSummary {
  modelKey: string;
  modelLabel: string;
  totalScore: number;
  maxPossibleScore: number;
  scorePercent: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  parseFailures: number;
  byCallType: Record<CallType, CallTypeSummary>;
}

// ── Test cases ───────────────────────────────────────────────────────────────

export interface GenerateTestCase {
  id: string;
  callType: "generate";
  rawInput: string;
  entryType: string;
  stageId: string;
  length: "short" | "standard" | "detailed";
}

export interface MatchKeySkillsTestCase {
  id: string;
  callType: "match-key-skills";
  entryFields: Record<string, string | number | boolean | null>;
  entryType: string;
  candidates: {
    key_skill_id: string;
    title: string;
    cip_number: number;
    cip_title: string;
    descriptors: string[];
    covered: boolean;
    evidence_count: number;
  }[];
}

export interface NormalizerTestCase {
  id: string;
  callType: "normalizer";
  traineeComments: string;
  currentWordCount: number;
  currentParagraphCount: number;
  length: "short" | "standard" | "detailed";
  targetRange: { min: number; max: number };
}

export interface DescriptorTestCase {
  id: string;
  callType: "descriptor";
  entryText: string;
  entryType: string;
  descriptors: {
    descriptor_id: string;
    key_skill_id: string;
    key_skill_title: string;
    descriptor_text: string;
  }[];
}

export interface CrossCipTestCase {
  id: string;
  callType: "cross-cip";
  entryText: string;
  entryType: string;
  linkedCipNumber: number;
  crossCipSkills: {
    key_skill_id: string;
    cip_number: number;
    title: string;
  }[];
  linkedSkillTitles: string[];
}

export interface FieldRegenTestCase {
  id: string;
  callType: "field-regen";
  entryType: string;
  targetFieldId: string;
  targetFieldLabel: string;
  rawInput?: string;
  currentFields: Record<string, string>;
  originalFieldValue: string;
  length: "short" | "standard" | "detailed";
}

export type AnyTestCase =
  | GenerateTestCase
  | MatchKeySkillsTestCase
  | NormalizerTestCase
  | DescriptorTestCase
  | CrossCipTestCase
  | FieldRegenTestCase;
