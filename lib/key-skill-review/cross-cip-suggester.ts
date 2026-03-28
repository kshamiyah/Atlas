import Anthropic from "@anthropic-ai/sdk";

export type CrossCipSkillInput = {
  key_skill_id: string;
  cip_number: number;
  title: string;
};

export type CrossCipSuggestion = {
  key_skill_id: string;
  cip_number: number;
  confidence: number;
  rationale: string;
};

const MAX_SKILLS_PER_CALL = 60;
const MODEL_NAME = "claude-haiku-4-5-20251001";

type CallUsage = { input_tokens: number; output_tokens: number };

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildPrompt(
  entryText: string,
  entryType: string | null,
  linkedCipNumber: number,
  skills: CrossCipSkillInput[],
  linkedSkillTitles: string[],
): string {
  const type = entryType ?? "unspecified";
  const cipLabel = linkedCipNumber === 0 ? "None (unlinked entry)" : String(linkedCipNumber);
  const skillsHeader =
    linkedCipNumber === 0
      ? "Key skills to consider (all CiPs — entry has no primary CiP):"
      : `Cross-CiP key skills to consider (from CiPs other than CiP ${linkedCipNumber}):`;
  const conservativeNote =
    linkedCipNumber === 0
      ? "- Entry has no primary CiP — match any skills the text directly evidences"
      : "- Be conservative — clinical procedures usually only evidence their primary CiP";
  const linkedCoverageSection =
    linkedSkillTitles.length > 0
      ? [
          "Existing linked-CiP coverage already identified for this entry:",
          JSON.stringify(linkedSkillTitles, null, 2),
          "",
        ].join("\n")
      : "Existing linked-CiP coverage already identified for this entry: []\n";
  return [
    "You are an RCOG curriculum expert. Given a portfolio entry, identify which key skills the entry provides direct evidence for.",
    "",
    `Entry type: ${type}`,
    `Linked CiP: ${cipLabel}`,
    "Entry text:",
    '"""',
    entryText,
    '"""',
    "",
    linkedCoverageSection,
    skillsHeader,
    JSON.stringify(
      skills.map((s) => ({
        key_skill_id: s.key_skill_id,
        cip_number: s.cip_number,
        title: s.title,
      })),
      null,
      2,
    ),
    "",
    "Rules:",
    "- Only return skills where the entry TEXT clearly and explicitly demonstrates that skill",
    "- Prioritize skills that add NEW coverage beyond linked-CiP coverage listed above",
    "- If a candidate substantially overlaps linked-CiP coverage, only include it when evidence is distinct and explicit",
    conservativeNote,
    "- confidence: 0.0–1.0 (use 0.8+ for explicit strong evidence, 0.6–0.79 for moderate, <0.6 only if weak)",
    "- rationale: short phrase max 8 words explaining the specific evidence",
    "- If no skills are evidenced, output just ]",
    "- Output ONLY array items and closing ]. No prose. No code fences.",
    "",
    "Continue the JSON array that has already been started. Output one object per evidenced skill:",
    '  { "key_skill_id": "<id>", "cip_number": N, "confidence": 0.0, "rationale": "short phrase" },',
  ].join("\n");
}

async function callAnthropic(
  prompt: string,
): Promise<{ data: unknown; usage: CallUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  // Prefill "[" so the model continues the JSON array directly
  const message = await anthropic.messages.create({
    model: MODEL_NAME,
    max_tokens: 2048,
    temperature: 0,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "[" },
    ],
  });

  const usage: CallUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };

  const textPart = message.content.find(
    (c) => c.type === "text",
  ) as { type: "text"; text: string } | undefined;

  if (!textPart?.text) {
    // Model returned nothing — no cross-CiP matches
    return { data: [], usage };
  }

  const jsonText = "[" + textPart.text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const preview = jsonText.slice(0, 400).replace(/\n/g, " ");
    throw new Error(
      `Failed to parse cross-CiP response as JSON. Preview: ${preview}`,
    );
  }

  return { data: parsed, usage };
}

export async function suggestCrossCipSkills(
  entryText: string,
  entryType: string | null,
  linkedCipNumber: number,
  crossCipSkills: CrossCipSkillInput[],
  linkedSkillTitles: string[] = [],
): Promise<CrossCipSuggestion[]> {
  if (crossCipSkills.length === 0) return [];

  const chunks: CrossCipSkillInput[][] = [];
  for (let i = 0; i < crossCipSkills.length; i += MAX_SKILLS_PER_CALL) {
    chunks.push(crossCipSkills.slice(i, i + MAX_SKILLS_PER_CALL));
  }

  const results: CrossCipSuggestion[] = [];

  for (const chunk of chunks) {
    const prompt = buildPrompt(
      entryText,
      entryType,
      linkedCipNumber,
      chunk,
      linkedSkillTitles,
    );
    const { data: raw } = await callAnthropic(prompt);

    if (!Array.isArray(raw)) continue;

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;

      const key_skill_id = String((item as Record<string, unknown>).key_skill_id ?? "");
      if (!key_skill_id) continue;

      const meta = chunk.find((s) => s.key_skill_id === key_skill_id);
      if (!meta) continue;

      const confidenceRaw = Number((item as Record<string, unknown>).confidence ?? 0);
      const confidence =
        Number.isFinite(confidenceRaw) &&
        confidenceRaw >= 0 &&
        confidenceRaw <= 1
          ? confidenceRaw
          : 0;

      const rationale = String(
        (item as Record<string, unknown>).rationale ?? "AI cross-CiP match",
      ).slice(0, 200);

      results.push({
        key_skill_id,
        cip_number: meta.cip_number,
        confidence,
        rationale,
      });
    }
  }

  return results;
}
