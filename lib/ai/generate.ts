import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompts";

export type GeneratedAIOutput = {
  entry_type: string;
  fields: Record<string, string | number | boolean | null>;
  suggested_key_skill_ids: string[];
  key_skill_rationale: Record<string, string>;
  suggested_key_skills_detail: {
    key_skill_id: string;
    title: string;
    cip_number: number | null;
    covered: boolean | null;
    rationale: string;
  }[];
  stage_id: string;
  inferred_level: number | null;
  notes: string[];
};

export async function generatePortfolioEntry(params: {
  entry_type: string;
  free_text: string;
  stage_id: string;
  date_hint?: string;
  length?: "short" | "standard" | "detailed";
  target_key_skills?: { id: string; title: string; descriptors: string[] }[];
}): Promise<GeneratedAIOutput> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          entry_type: params.entry_type,
          free_text: params.free_text,
          current_stage_id: params.stage_id,
          date_hint: params.date_hint,
          length: params.length,
          target_key_skills: params.target_key_skills,
        }),
      },
    ],
  });

  const block = response.content[0];
  const raw = block?.type === "text" ? block.text : "";
  if (!raw) throw new Error("Empty response from Claude");

  let parsed: GeneratedAIOutput;
  try {
    parsed = JSON.parse(raw) as GeneratedAIOutput;
  } catch {
    const stripped = raw.replace(/```json\n?|\n?```/g, "").trim();
    try {
      parsed = JSON.parse(stripped) as GeneratedAIOutput;
    } catch (e) {
      throw new Error("Claude returned invalid JSON: " + String(e));
    }
  }

  if (!parsed.fields || typeof parsed.fields !== "object") {
    throw new Error("Claude response missing fields object");
  }

  // Normalise entry_type to match app's lowercase keys
  const ENTRY_TYPE_MAP: Record<string, string> = {
    reflection: "reflection", Reflection: "reflection",
    procedure: "procedure", Procedure: "procedure",
    cip_assessment: "cip_assessment", Cip_Assessment: "cip_assessment", "CiP Assessment": "cip_assessment",
    cbd: "cbd", CbD: "cbd", CBD: "cbd",
    minicex: "minicex", "Mini-CEX": "minicex", MiniCEX: "minicex",
    notss: "notss", NOTSS: "notss",
    osats_formative: "osats_formative", OSATS_Formative: "osats_formative",
    osats_summative: "osats_summative", OSATS_Summative: "osats_summative",
    // courses is not a standalone type — map to other_evidence (evidence_type "1044" set by prompt)
    courses: "other_evidence", Courses: "other_evidence",
    other_evidence: "other_evidence", Other_Evidence: "other_evidence", "Other Evidence": "other_evidence",
  };
  parsed.entry_type = ENTRY_TYPE_MAP[parsed.entry_type] ?? parsed.entry_type.toLowerCase();

  // Normalise arrays and primitives — Claude can return null for optional fields,
  // which would crash downstream .length accesses.
  // Pass 1 does not do key-skill matching; Pass 2 will fill these in.
  parsed.suggested_key_skill_ids = [];
  parsed.key_skill_rationale = {};
  parsed.suggested_key_skills_detail = [];
  parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  parsed.stage_id = typeof parsed.stage_id === "string" ? parsed.stage_id : "ST1";
  parsed.inferred_level =
    typeof parsed.inferred_level === "number" ? parsed.inferred_level : null;

  return parsed;
}
