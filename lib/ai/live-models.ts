export type LiveModelConfig = {
  label: string;
  model: string;
  apiKeyEnv: string;
  baseURL: string;
  jsonMode?: boolean;
  disableThinking?: boolean;
  useCompletionTokens?: boolean;
  noTemperature?: boolean;
};

export type LiveModelCallParams = {
  system?: string;
  userMessage: string;
  maxTokens: number;
  temperature?: number;
  prefillArray?: boolean;
  timeoutMs?: number;
};

export type LiveModelCallResult = {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
};

export const LIVE_AUDIT_MODEL: LiveModelConfig = {
  label: "Gemini 2.5 Flash",
  model: "gemini-2.5-flash",
  apiKeyEnv: "GOOGLE_AI_STUDIO_API_KEY",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  jsonMode: true,
  disableThinking: true,
};

export const LIVE_ENTRY_GENERATION_MODEL: LiveModelConfig = {
  label: "GPT-5.4 Nano",
  model: "gpt-5.4-nano",
  apiKeyEnv: "OPENAI_API_KEY",
  baseURL: "https://api.openai.com/v1/",
  jsonMode: true,
  useCompletionTokens: true,
};

type UsageShape = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export async function callLiveModel(
  model: LiveModelConfig,
  params: LiveModelCallParams,
): Promise<LiveModelCallResult> {
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing env var: ${model.apiKeyEnv}`);
  }

  const system = params.prefillArray
    ? [
        params.system?.trim(),
        "CRITICAL: Your response MUST begin with the [ character immediately. Output the JSON array directly with no preamble, no prose, and no code fences.",
      ]
        .filter(Boolean)
        .join("\n\n")
    : params.system ?? "";

  const body: Record<string, unknown> = {
    model: model.model,
    ...(model.useCompletionTokens
      ? { max_completion_tokens: params.maxTokens }
      : { max_tokens: params.maxTokens }),
    ...(model.noTemperature ? {} : { temperature: params.temperature ?? 0 }),
    messages: [
      { role: "system", content: system },
      { role: "user", content: params.userMessage },
    ],
  };

  if (model.jsonMode && !params.prefillArray) {
    body.response_format = { type: "json_object" };
  }

  if (model.disableThinking) {
    body.reasoning_effort = "none";
  }

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 30_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${model.baseURL}chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 400)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: UsageShape;
    };

    return {
      rawText: json.choices?.[0]?.message?.content ?? "",
      inputTokens:
        json.usage?.prompt_tokens ?? json.usage?.input_tokens ?? 0,
      outputTokens:
        json.usage?.completion_tokens ?? json.usage?.output_tokens ?? 0,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      throw new Error(`${model.label} request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
