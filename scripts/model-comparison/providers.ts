import Anthropic from "@anthropic-ai/sdk";
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

  // OpenAI-compat endpoints don't support assistant prefill.
  // Instead, inject a critical format instruction into the system prompt.
  const system = params.prefillArray
    ? params.system +
      "\n\nCRITICAL: Your response MUST begin with the [ character immediately — no preamble, no explanation, no code fences. Output the JSON array directly."
    : params.system;

  // Use raw fetch so we can pass chat_template_kwargs without the SDK stripping it.
  // The OpenAI Node SDK drops unknown fields; fetch sends exactly what we give it.
  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: params.userMessage },
    ],
  };

  // Disable Gemma 4 thinking mode via Google's extended config.
  // This is passed as a top-level field (equivalent to extra_body in Python SDK).
  // Cuts latency from 37–200s to ~5–15s.
  if (model.disableThinking) {
    body["google"] = { thinking_config: { thinking_level: "none" } };
  }

  const res = await fetch(`${model.baseURL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json() as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const rawText = json.choices[0]?.message?.content ?? "";

  return {
    rawText,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - start,
  };
}
