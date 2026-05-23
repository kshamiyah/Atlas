export type LlmPricing = {
  input_per_million_usd: number;
  output_per_million_usd: number;
  source: "env" | "default";
};

const DEFAULT_INPUT_PER_MILLION_USD = 0.1;
const DEFAULT_OUTPUT_PER_MILLION_USD = 0.4;

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveKeySkillReviewLlmPricing(): LlmPricing {
  const inputFromEnv = parsePositiveNumber(
    process.env.KEY_SKILL_REVIEW_LLM_INPUT_COST_PER_MILLION_USD,
  );
  const outputFromEnv = parsePositiveNumber(
    process.env.KEY_SKILL_REVIEW_LLM_OUTPUT_COST_PER_MILLION_USD,
  );

  if (inputFromEnv != null && outputFromEnv != null) {
    return {
      input_per_million_usd: inputFromEnv,
      output_per_million_usd: outputFromEnv,
      source: "env",
    };
  }

  return {
    input_per_million_usd: DEFAULT_INPUT_PER_MILLION_USD,
    output_per_million_usd: DEFAULT_OUTPUT_PER_MILLION_USD,
    source: "default",
  };
}

export function estimateLlmCostUsd(inputTokens: number, outputTokens: number, pricing: LlmPricing): number {
  const safeInput = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const safeOutput = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const inputCost = (safeInput / 1_000_000) * pricing.input_per_million_usd;
  const outputCost = (safeOutput / 1_000_000) * pricing.output_per_million_usd;
  return Number((inputCost + outputCost).toFixed(6));
}
