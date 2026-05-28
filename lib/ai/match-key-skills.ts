import { callGeminiCompletion } from "./gemini-client";
import { parseModelJson } from "./parse-model-json";

export type KeySkillCandidate = {
  key_skill_id: string;
  title: string;
  cip_number: number | null;
  cip_title: string | null;
  kaizen_ids?: string[];
  descriptors: string[];
  covered: boolean | null;
  evidence_count: number | null;
};

export type KeySkillMatchSuggestion = {
  key_skill_id: string;
  rationale: string;
  evidenced_descriptors: string[];
};

export type KeySkillMatchResult = {
  suggested_key_skill_ids: string[];
  rationale: Record<string, string>;
  suggestions: KeySkillMatchSuggestion[];
};

const MATCH_SYSTEM_PROMPT = `You are an RCOG curriculum expert. Your task is to identify which key skills from the RCOG O&G curriculum are genuinely evidenced by a portfolio entry, and which specific descriptors within each skill are demonstrated.

For each candidate skill you receive: its ID, title, CiP number, descriptor phrases (what the skill looks like in practice), and whether the trainee currently has portfolio evidence for it.

RULES:
- Read the entry holistically and understand the clinical scenario — do not just match keywords
- A skill is evidenced if the entry demonstrates the competency described by its descriptors, even if the exact words do not appear
- Consider what the clinical situation implicitly requires (e.g. an emergency LSCS inherently evidences consent and surgical safety even if not stated explicitly)
- Suggest 2–5 skills maximum. Quality over quantity.
- Include the clinically central skills for the scenario (e.g. intrapartum fetal surveillance and emergency birth for fetal bradycardia/LSCS), not only communication or consent skills.
- Prefer skills from different CiPs when multiple genuinely apply — avoid returning three skills from the same CiP unless the entry is narrowly focused.
- When two skills are equally applicable, prefer those with "covered: false" — this helps fill genuine portfolio gaps
- NEVER suggest a skill that is not genuinely demonstrated by this entry
- For each suggested skill, list 1–4 evidenced_descriptors copied EXACTLY from that skill's descriptors array in the input. Only include descriptors genuinely demonstrated by the entry.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "key_skill_id": "CiP_1_KS03",
      "rationale": "brief reason why this entry evidences this skill",
      "evidenced_descriptors": ["descriptor text copied exactly from input", "another descriptor"]
    }
  ]
}`;

const MAX_MATCH_ATTEMPTS = 3;
const BASE_MATCH_TOKENS = 3072;

function normalizeDescriptorMatch(
  candidateTexts: string[],
  modelTexts: unknown,
): string[] {
  if (!Array.isArray(modelTexts)) return [];
  const byNormalized = new Map(
    candidateTexts.map((text) => [text.toLowerCase().trim(), text]),
  );
  const matched: string[] = [];
  for (const item of modelTexts) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    const exact = candidateTexts.find((d) => d === text);
    if (exact) {
      matched.push(exact);
      continue;
    }
    const fuzzy = byNormalized.get(text.toLowerCase());
    if (fuzzy) matched.push(fuzzy);
  }
  return [...new Set(matched)];
}

function normalizeMatchResult(
  raw: unknown,
  candidates: KeySkillCandidate[],
  pinnedIds: string[],
): KeySkillMatchResult {
  const candidateById = new Map(
    candidates.map((c) => [c.key_skill_id, c] as const),
  );

  const suggestions: KeySkillMatchSuggestion[] = [];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    if (Array.isArray(obj.suggestions)) {
      for (const item of obj.suggestions) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const keySkillId = String(row.key_skill_id ?? "").trim();
        if (!keySkillId || !candidateById.has(keySkillId)) continue;
        const candidate = candidateById.get(keySkillId)!;
        suggestions.push({
          key_skill_id: keySkillId,
          rationale: String(row.rationale ?? "").trim(),
          evidenced_descriptors: normalizeDescriptorMatch(
            candidate.descriptors,
            row.evidenced_descriptors,
          ),
        });
      }
    } else if (Array.isArray(obj.suggested_key_skill_ids)) {
      const rationale =
        obj.rationale && typeof obj.rationale === "object"
          ? (obj.rationale as Record<string, string>)
          : {};
      for (const id of obj.suggested_key_skill_ids) {
        const keySkillId = String(id ?? "").trim();
        if (!keySkillId || !candidateById.has(keySkillId)) continue;
        suggestions.push({
          key_skill_id: keySkillId,
          rationale: String(rationale[keySkillId] ?? "").trim(),
          evidenced_descriptors: [],
        });
      }
    }
  }

  for (const id of pinnedIds) {
    if (!suggestions.some((s) => s.key_skill_id === id) && candidateById.has(id)) {
      suggestions.unshift({
        key_skill_id: id,
        rationale: "Targeted by user — entry written to demonstrate this skill.",
        evidenced_descriptors: [],
      });
    }
  }

  const suggested_key_skill_ids = suggestions.map((s) => s.key_skill_id);
  const rationale = Object.fromEntries(
    suggestions.map((s) => [s.key_skill_id, s.rationale]),
  );

  for (const id of pinnedIds) {
    if (!rationale[id]) {
      rationale[id] = "Targeted by user — entry written to demonstrate this skill.";
    }
  }

  return { suggested_key_skill_ids, rationale, suggestions };
}

export async function matchKeySkills(params: {
  entry_fields: Record<string, string | number | boolean | null>;
  entry_type: string;
  candidates: KeySkillCandidate[];
  pinned_key_skill_ids?: string[];
}): Promise<KeySkillMatchResult> {
  const userMessage = JSON.stringify({
    entry_type: params.entry_type,
    entry: params.entry_fields,
    candidate_key_skills: params.candidates.map((c) => ({
      key_skill_id: c.key_skill_id,
      title: c.title,
      cip_number: c.cip_number,
      descriptors: c.descriptors.slice(0, 6),
      covered: c.covered,
      evidence_count: c.evidence_count,
    })),
  });

  let parsed: KeySkillMatchResult | null = null;
  let lastError = "Unknown parse error";

  for (let attempt = 0; attempt < MAX_MATCH_ATTEMPTS; attempt++) {
    const { content, finishReason } = await callGeminiCompletion({
      system: MATCH_SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: BASE_MATCH_TOKENS + attempt * 1024,
      temperature: 0.1,
      jsonObject: true,
    });

    if (!content.trim()) {
      lastError = "Empty response from Gemini (key skill match)";
      continue;
    }

    const result = parseModelJson(content);
    if (!result.ok) {
      lastError =
        finishReason === "length"
          ? "Gemini key-skill match response was truncated"
          : "Gemini returned invalid JSON for key-skill match";
      continue;
    }

    parsed = normalizeMatchResult(result.value, params.candidates, []);
    break;
  }

  if (!parsed) {
    throw new Error(lastError);
  }

  const pinned = params.pinned_key_skill_ids ?? [];
  const pinnedDedup = pinned
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0);

  parsed = normalizeMatchResult(
    {
      suggestions: parsed.suggestions,
      suggested_key_skill_ids: parsed.suggested_key_skill_ids,
      rationale: parsed.rationale,
    },
    params.candidates,
    pinnedDedup,
  );

  return parsed;
}

