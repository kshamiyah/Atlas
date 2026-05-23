import { callGemini, stripFences } from "./gemini-client";

export type KeySkillCandidate = {
  key_skill_id: string;
  title: string;
  cip_number: number | null;
  cip_title: string | null;
  descriptors: string[];
  covered: boolean | null;
  evidence_count: number | null;
};

export type KeySkillMatchResult = {
  suggested_key_skill_ids: string[];
  rationale: Record<string, string>; // key_skill_id -> reason
};

const MATCH_SYSTEM_PROMPT = `You are an RCOG curriculum expert. Your task is to identify which key skills from the RCOG O&G curriculum are genuinely evidenced by a portfolio entry.

For each candidate skill you receive: its ID, title, CiP number, descriptor phrases (what the skill looks like in practice), and whether the trainee currently has portfolio evidence for it.

RULES:
- Read the entry holistically and understand the clinical scenario — do not just match keywords
- A skill is evidenced if the entry demonstrates the competency described by its descriptors, even if the exact words do not appear
- Consider what the clinical situation implicitly requires (e.g. an emergency LSCS inherently evidences consent and surgical safety even if not stated explicitly)
- Suggest 2–5 skills maximum. Quality over quantity.
- When two skills are equally applicable, prefer those with "covered: false" — this helps fill genuine portfolio gaps
- NEVER suggest a skill that is not genuinely demonstrated by this entry

Return ONLY valid JSON:
{
  "suggested_key_skill_ids": ["KS001", "KS015"],
  "rationale": {
    "KS001": "brief reason why this entry evidences this skill",
    "KS015": "brief reason — note if it fills a portfolio gap"
  }
}`;

export async function matchKeySkills(params: {
  entry_fields: Record<string, string | number | boolean | null>;
  entry_type: string;
  candidates: KeySkillCandidate[];
  pinned_key_skill_ids?: string[];
}): Promise<KeySkillMatchResult> {
  const userMessage = JSON.stringify(
    {
      entry_type: params.entry_type,
      entry: params.entry_fields,
      candidate_key_skills: params.candidates,
    },
    null,
    2
  );

  const raw = await callGemini({
    system: MATCH_SYSTEM_PROMPT,
    user: userMessage,
    maxTokens: 800,
    jsonObject: true,
  });

  if (!raw) throw new Error("Empty response from Gemini (key skill match)");

  let parsed: KeySkillMatchResult;
  try {
    parsed = JSON.parse(raw) as KeySkillMatchResult;
  } catch {
    parsed = JSON.parse(stripFences(raw)) as KeySkillMatchResult;
  }

  parsed.suggested_key_skill_ids = Array.isArray(parsed.suggested_key_skill_ids)
    ? parsed.suggested_key_skill_ids
    : [];
  parsed.rationale =
    parsed.rationale && typeof parsed.rationale === "object" ? parsed.rationale : {};

  // Always include pinned skills (user explicitly targeted them)
  const pinned = params.pinned_key_skill_ids ?? [];
  const pinnedDedup = pinned
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0);

  const allIds = [
    ...pinnedDedup.filter((id) => !parsed.suggested_key_skill_ids.includes(id)),
    ...parsed.suggested_key_skill_ids,
  ];
  parsed.suggested_key_skill_ids = allIds;

  // Add placeholder rationale for pinned if missing
  for (const id of pinnedDedup) {
    if (!parsed.rationale[id]) {
      parsed.rationale[id] =
        "Targeted by user — entry written to demonstrate this skill.";
    }
  }

  return parsed;
}

