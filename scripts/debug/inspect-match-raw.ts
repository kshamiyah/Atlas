import { callGeminiCompletion } from "@/lib/ai/gemini-client";
import { parseModelJson } from "@/lib/ai/parse-model-json";
import { generatePortfolioEntry } from "@/lib/ai/generate";
import type { KeySkillCandidate } from "@/lib/ai/match-key-skills";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";
import { getDevBypassUserId } from "@/lib/auth/dev-bypass";

const MATCH_SYSTEM_PROMPT = `You are an RCOG curriculum expert...`; // truncated for test

async function main() {
  const supabase = createServiceRoleSupabaseClient();
  const userId = getDevBypassUserId();

  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number, title ), descriptors ( text, sort_order )")
    .not("legacy_id", "is", null);

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered")
    .eq("user_id", userId);

  type KeySkillRow = NonNullable<typeof keySkillRows>[number];
  type CoverageRow = NonNullable<typeof coverageRows>[number];

  const coverageByName = new Map(
    (coverageRows ?? []).map((c: CoverageRow) => [
      String(c.key_skill_name ?? "").toLowerCase().trim(),
      c,
    ]),
  );

  const enrichedKeySkills: KeySkillCandidate[] = (keySkillRows ?? [])
    .filter((ks: KeySkillRow): ks is KeySkillRow & { legacy_id: string; title: string } =>
      Boolean(ks.legacy_id && ks.title),
    )
    .map((ks) => {
      const coverage = coverageByName.get(String(ks.title ?? "").toLowerCase().trim());
      const descriptorRows = Array.isArray(ks.descriptors) ? ks.descriptors : [];
      const descriptorTexts = descriptorRows
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((d) => String(d.text ?? "").trim())
        .filter((text) => text.length > 0);
      const cip = Array.isArray(ks.cips) ? (ks.cips[0] ?? null) : ks.cips;
      return {
        key_skill_id: ks.legacy_id,
        title: ks.title,
        cip_number: cip?.number ?? null,
        cip_title: cip?.title ?? null,
        descriptors: descriptorTexts,
        covered: coverage?.covered ?? null,
        evidence_count: coverage?.evidence_count ?? null,
      };
    });

  const generated = await generatePortfolioEntry({
    entry_type: "reflection",
    free_text: "ST2 emergency LSCS fetal bradycardia",
    stage_id: "ST2",
    length: "short",
  });

  const entryText = Object.values(generated.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const topCandidates = enrichedKeySkills
    .map((ks) => {
      const allText = [ks.title, ...ks.descriptors].join(" ").toLowerCase();
      const words = allText.split(/\s+/).filter((w) => w.length > 4);
      const hits = words.filter((w) => entryText.includes(w)).length;
      return { ks, score: hits + (ks.covered === false ? 2 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.ks);

  const { matchKeySkills } = await import("@/lib/ai/match-key-skills");
  const system = (await import("@/lib/ai/match-key-skills")).toString(); // noop

  const userMessage = JSON.stringify({
    entry_type: "reflection",
    entry: generated.fields,
    candidate_key_skills: topCandidates,
  }, null, 2);

  console.log("userMessage length", userMessage.length);

  const { content, finishReason } = await callGeminiCompletion({
    system: `You are an RCOG curriculum expert. Your task is to identify which key skills from the RCOG O&G curriculum are genuinely evidenced by a portfolio entry.

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
}`,
    user: userMessage,
    maxTokens: 800,
    jsonObject: true,
  });

  console.log("finishReason", finishReason);
  console.log("raw content:", JSON.stringify(content));
  console.log("parseModelJson", parseModelJson(content));
}

void main();
