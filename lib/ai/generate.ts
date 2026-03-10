import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompts";

export type GeneratedAIOutput = {
  entry_type: string;
  fields: Record<string, string | number | boolean | null>;
  suggested_key_skill_ids: string[];
  stage_id: string;
  inferred_level: number | null;
  notes: string[];
};

export async function generatePortfolioEntry(params: {
  entry_type: string;
  free_text: string;
  stage_id: string;
  candidate_key_skills: { key_skill_id: string; title: string }[];
  date_hint?: string;
}): Promise<GeneratedAIOutput> {
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildUserMessage({
          entry_type: params.entry_type,
          free_text: params.free_text,
          current_stage_id: params.stage_id,
          candidate_key_skills: params.candidate_key_skills,
          date_hint: params.date_hint,
        }),
      },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) throw new Error("Empty response from OpenAI");

  let parsed: GeneratedAIOutput;
  try {
    parsed = JSON.parse(raw) as GeneratedAIOutput;
  } catch (e) {
    throw new Error("OpenAI returned invalid JSON: " + String(e));
  }

  if (!parsed.fields || typeof parsed.fields !== "object") {
    throw new Error("OpenAI response missing fields object");
  }

  // Normalise arrays and primitives — GPT-4o json_object mode can return null
  // for optional fields, which would crash downstream .length accesses.
  parsed.suggested_key_skill_ids = Array.isArray(parsed.suggested_key_skill_ids)
    ? parsed.suggested_key_skill_ids
    : [];
  parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  parsed.stage_id = typeof parsed.stage_id === "string" ? parsed.stage_id : "ST1";
  parsed.inferred_level =
    typeof parsed.inferred_level === "number" ? parsed.inferred_level : null;

  return parsed;
}
