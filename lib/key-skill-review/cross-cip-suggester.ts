import {
  callLiveModel,
  LIVE_AUDIT_MODEL,
} from "@/lib/ai/live-models";

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

type CallUsage = { input_tokens: number; output_tokens: number };
const KEY_SKILL_REVIEW_LLM_ENABLED =
  String(process.env.KEY_SKILL_REVIEW_LLM_ENABLED ?? "").toLowerCase() ===
  "true";

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

async function callGemini(
  prompt: string,
): Promise<{ data: unknown; usage: CallUsage }> {
  if (!KEY_SKILL_REVIEW_LLM_ENABLED) {
    throw new Error(
      "Key-skill review LLM is disabled. Set KEY_SKILL_REVIEW_LLM_ENABLED=true to enable.",
    );
  }
  if (!process.env.GOOGLE_AI_STUDIO_API_KEY) {
    throw new Error("GOOGLE_AI_STUDIO_API_KEY is not configured");
  }

  const message = await callLiveModel(LIVE_AUDIT_MODEL, {
    userMessage: prompt,
    maxTokens: 2048,
    temperature: 0,
    prefillArray: true,
  });

  const usage: CallUsage = {
    input_tokens: message.inputTokens,
    output_tokens: message.outputTokens,
  };
  if (!message.rawText) {
    // Model returned nothing — no cross-CiP matches
    return { data: [], usage };
  }

  const jsonText = message.rawText.trim();

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
    const { data: raw } = await callGemini(prompt);

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
