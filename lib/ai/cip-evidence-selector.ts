import { callGemini, stripFences } from "./gemini-client";

export type CipEvidenceSkillInput = {
  key_skill_id: string;
  title: string;
  covered: boolean | null;
  evidence_count: number | null;
  descriptors: string[];
};

export type CipEvidenceEntryInput = {
  entry_id: string;
  title: string;
  assessment_type: string;
  date: string;
  status: string;
  text_excerpt: string;
};

export type CipEvidenceSelection = {
  selected_entry_ids: string[];
  top_key_skills: Array<{
    key_skill_id: string;
    reason: string;
    key_descriptors: string[];
  }>;
  descriptors_well_evidenced: string[];
  descriptors_with_gaps: string[];
  reflective_focus: string;
};

const SELECTION_PROMPT = `You are an RCOG CiP reflection evidence selector.

Task:
1) Identify the highest-priority CiP key skills for this assessment.
2) Select ONLY the most supportive portfolio entries to evidence those skills.
3) Identify descriptor themes that are well evidenced and those with clear gaps.

Selection rules:
- Prioritise quality over quantity.
- Select exactly 2 entries where possible. Never select more than 2.
- Choose entries with concrete clinical detail, clear learning shift, or clear relevance to the priority skills.
- Do NOT try to cover every entry.
- If several entries are repetitive, keep only the strongest one.
- Choose 2 to 3 top key skills.
- Keep descriptor themes concise and practical.

Return JSON only:
{
  "selected_entry_ids": ["<entry_id>"],
  "top_key_skills": [
    {
      "key_skill_id": "<id>",
      "reason": "<why this is priority now>",
      "key_descriptors": ["<descriptor text>"]
    }
  ],
  "descriptors_well_evidenced": ["<descriptor theme>"],
  "descriptors_with_gaps": ["<descriptor theme>"],
  "reflective_focus": "<one short sentence describing the reflection arc>"
}`;

export async function selectCipEvidence(params: {
  cip_number: number;
  user_request: string;
  key_skills: CipEvidenceSkillInput[];
  entries: CipEvidenceEntryInput[];
}): Promise<CipEvidenceSelection> {
  const raw = await callGemini({
    system: SELECTION_PROMPT,
    user: JSON.stringify(
      {
        cip_number: params.cip_number,
        user_request: params.user_request,
        key_skills: params.key_skills,
        entries: params.entries,
      },
      null,
      2
    ),
    maxTokens: 1400,
    temperature: 0,
    jsonObject: true,
  });

  if (!raw) {
    throw new Error("Empty response from Gemini (CiP evidence selection)");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(stripFences(raw));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid CiP evidence selection response");
  }

  const data = parsed as Record<string, unknown>;

  const allowedEntryIds = new Set(params.entries.map((entry) => entry.entry_id));
  const allowedSkillIds = new Set(params.key_skills.map((skill) => skill.key_skill_id));

  const selected_entry_ids = Array.isArray(data.selected_entry_ids)
    ? data.selected_entry_ids
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0 && allowedEntryIds.has(value))
        .slice(0, 2)
    : [];

  const top_key_skills = Array.isArray(data.top_key_skills)
    ? data.top_key_skills
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const key_skill_id = String(row.key_skill_id ?? "").trim();
          if (!key_skill_id || !allowedSkillIds.has(key_skill_id)) return null;
          return {
            key_skill_id,
            reason: String(row.reason ?? "").trim(),
            key_descriptors: Array.isArray(row.key_descriptors)
              ? row.key_descriptors
                  .map((descriptor) => String(descriptor ?? "").trim())
                  .filter((descriptor) => descriptor.length > 0)
                  .slice(0, 5)
              : [],
          };
        })
        .filter((item): item is CipEvidenceSelection["top_key_skills"][number] => item !== null)
        .slice(0, 3)
    : [];

  const descriptors_well_evidenced = Array.isArray(data.descriptors_well_evidenced)
    ? data.descriptors_well_evidenced
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];

  const descriptors_with_gaps = Array.isArray(data.descriptors_with_gaps)
    ? data.descriptors_with_gaps
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];

  const reflective_focus = String(data.reflective_focus ?? "").trim();

  return {
    selected_entry_ids,
    top_key_skills,
    descriptors_well_evidenced,
    descriptors_with_gaps,
    reflective_focus,
  };
}
