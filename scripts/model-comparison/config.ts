import type { ModelConfig } from "./types";

// Pricing per million tokens ($/MTok)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  haiku:        { input: 1.00,  output: 5.00  },
  gemma4:       { input: 0.14,  output: 0.40  },
  sonnet:       { input: 3.00,  output: 15.00 },
  geminiflash:  { input: 0.10,  output: 0.40  },
  gemini31flash:{ input: 0.10,  output: 0.40  },
  gpt54nano:    { input: 0.05,  output: 0.40  },
  gpt5nano:     { input: 0.03,  output: 0.20  },
};

export const MODELS: Record<string, ModelConfig> = {
  haiku: {
    key: "haiku",
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    envKey: "ANTHROPIC_API_KEY",
  },
  gemma4: {
    key: "gemma4",
    id: "gemma-4-31b-it",
    provider: "openai-compat",
    label: "Gemma 4 31B",
    envKey: "GOOGLE_AI_STUDIO_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  sonnet: {
    key: "sonnet",
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    envKey: "ANTHROPIC_API_KEY",
  },
  geminiflash: {
    key: "geminiflash",
    id: "gemini-2.5-flash",
    provider: "openai-compat",
    label: "Gemini 2.5 Flash",
    envKey: "GOOGLE_AI_STUDIO_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    jsonMode: true,
    disableThinking: true,
  },
  gemini31flash: {
    key: "gemini31flash",
    id: "gemini-3-flash-preview",
    provider: "openai-compat",
    label: "Gemini 3 Flash",
    envKey: "GOOGLE_AI_STUDIO_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    jsonMode: true,
    disableThinking: true,
  },
  gpt54nano: {
    key: "gpt54nano",
    id: "gpt-5.4-nano",
    provider: "openai-compat",
    label: "GPT-5.4 Nano",
    envKey: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1/",
    jsonMode: true,
    useCompletionTokens: true,
  },
  gpt5nano: {
    key: "gpt5nano",
    id: "gpt-5-nano",
    provider: "openai-compat",
    label: "GPT-5 Nano",
    envKey: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1/",
    jsonMode: true,
    useCompletionTokens: true,
    noTemperature: true,
  },
};

// Phrases explicitly banned in prompts.ts — case-insensitive match
export const BANNED_PHRASES: string[] = [
  "a thread running through",
  "closing the loop",
  "functioning at a different level",
  "looking across these entries",
  "genuinely shifted something",
  "over this period",
  "this taught me",
  "looking at the evidence gathered",
  "areas least well evidenced",
  "my immediate next steps are",
  "my next steps are",
];

// Narrative fields per entry type — used for word count scoring
export const NARRATIVE_FIELDS: Record<string, string[]> = {
  reflection: ["what_happened", "important_points", "reflection", "record_of_discussion_or_action_plan"],
  procedure: ["description"],
  cip_assessment: ["trainee_comments"],
  cbd: ["describe_the_event", "trainee_analysis", "trainee_learning_plan", "trainee_reflection"],
  minicex: ["describe_the_event", "trainee_analysis", "trainee_learning_plan", "trainee_reflection"],
  notss: ["situation_awareness", "decision_making", "communication_teamwork", "leadership", "comments_by_trainee"],
  osats_formative: ["clinical_details_and_complexity", "what_went_well", "what_could_have_gone_better", "learning_plan", "trainee_reflection"],
  osats_summative: ["what_went_well", "what_could_have_gone_better", "learning_plan"],
  other_evidence: ["description"],
};

// Required fields per entry type (non-narrative + narrative)
export const REQUIRED_FIELDS: Record<string, string[]> = {
  reflection: ["title", "what_happened", "important_points", "reflection", "record_of_discussion_or_action_plan", "log_procedure", "date"],
  procedure: ["level_of_supervision", "description", "request_assessment", "date"],
  cip_assessment: ["title", "date", "trainee_level", "trainee_comments"],
  cbd: ["title", "describe_the_event", "trainee_analysis", "trainee_learning_plan", "additional_actions", "assessor_additional_comments", "trainee_reflection", "assessor"],
  minicex: ["title", "describe_the_event", "trainee_analysis", "trainee_learning_plan", "additional_actions", "assessor_additional_comments", "trainee_reflection", "assessor"],
  notss: ["title", "number_of_beds", "number_of_patients", "situation_awareness", "decision_making", "communication_teamwork", "leadership", "comments_by_trainee", "comments_by_assessor", "assessor"],
  osats_formative: ["clinical_details_and_complexity", "what_went_well", "what_could_have_gone_better", "learning_plan", "assessor_additional_comments", "trainee_reflection", "assessor"],
  osats_summative: ["what_went_well", "what_could_have_gone_better", "learning_plan", "assessor_additional_comments", "assessor"],
  other_evidence: ["title", "description", "date", "evidence_type"],
};

// Valid evidence_type codes for other_evidence entries
export const VALID_EVIDENCE_TYPES = new Set([
  "477", "513", "591", "475", "519", "520", "585", "514", "503", "482",
  "480", "479", "501", "548", "522", "556", "521", "502", "17", "15",
  "1044", "1239", "18", "19", "526", "517", "21", "474", "473", "472",
  "538", "1045", "1451", "1047",
]);

// CiP word targets
export const CIP_WORD_RANGES: Record<string, { min: number; max: number }> = {
  short: { min: 220, max: 300 },
  standard: { min: 320, max: 420 },
  detailed: { min: 500, max: 650 },
};

// Non-CiP narrative field word targets
export const FIELD_WORD_RANGES: Record<string, { min: number; max: number }> = {
  short: { min: 100, max: 150 },
  standard: { min: 250, max: 350 },
  detailed: { min: 450, max: 600 },
};
