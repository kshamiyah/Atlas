import OpenAI from "openai";

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

function getClient(): OpenAI {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: GEMINI_BASE_URL });
}

/**
 * Call Gemini 3 Flash via Google's OpenAI-compatible endpoint.
 *
 * @param opts.jsonObject  Set true when the response must be a JSON object (uses
 *                         response_format json_object).  Do NOT set for JSON arrays
 *                         — use the raw text and strip fences manually.
 */
export async function callGemini(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: GEMINI_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(opts.jsonObject ? { response_format: { type: "json_object" } } : {}),
  });

  return response.choices[0]?.message?.content ?? "";
}

/** Strip markdown code fences and return trimmed text. */
export function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
}
