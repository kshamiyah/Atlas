import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ModelConfig } from "./types";

export interface CallParams {
  system: string;
  userMessage: string;
  maxTokens: number;
  temperature: number;
  /** For descriptor/cross-cip calls that use Anthropic's assistant prefill trick */
  prefillArray?: boolean;
}

export interface CallResult {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error?: string;
}

export async function callModel(
  model: ModelConfig,
  params: CallParams,
): Promise<CallResult> {
  const start = Date.now();

  try {
    if (model.provider === "anthropic") {
      return await callAnthropic(model, params, start);
    } else {
      return await callOpenAICompat(model, params, start);
    }
  } catch (err) {
    return {
      rawText: "",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function callAnthropic(
  model: ModelConfig,
  params: CallParams,
  start: number,
): Promise<CallResult> {
  const apiKey = process.env[model.envKey];
  if (!apiKey) throw new Error(`Missing env var: ${model.envKey}`);

  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: params.userMessage },
  ];

  if (params.prefillArray) {
    messages.push({ role: "assistant", content: "[" });
  }

  const response = await client.messages.create({
    model: model.id,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    system: params.system,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;

  // Prepend "[" if prefill was used (model continues from the prefilled "[")
  const rawText = params.prefillArray
    ? "[" + (textBlock?.text ?? "").trim()
    : (textBlock?.text ?? "");

  return {
    rawText,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs: Date.now() - start,
  };
}

async function callOpenAICompat(
  model: ModelConfig,
  params: CallParams,
  start: number,
): Promise<CallResult> {
  const apiKey = process.env[model.envKey];
  if (!apiKey) throw new Error(`Missing env var: ${model.envKey}`);

  const client = new OpenAI({ apiKey, baseURL: model.baseURL });

  // OpenAI-compat endpoints don't support assistant prefill.
  // Instead, inject a critical format instruction into the system prompt.
  const system = params.prefillArray
    ? params.system +
      "\n\nCRITICAL: Your response MUST begin with the [ character immediately — no preamble, no explanation, no code fences. Output the JSON array directly."
    : params.system;

  const response = await client.chat.completions.create({
    model: model.id,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: params.userMessage },
    ],
  });

  const rawText = response.choices[0]?.message?.content ?? "";
  const usage = response.usage;

  return {
    rawText,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - start,
  };
}
