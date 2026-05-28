import { generatePortfolioEntry } from "@/lib/ai/generate";
import { matchKeySkills, type KeySkillCandidate } from "@/lib/ai/match-key-skills";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";
import { getDevBypassUserId } from "@/lib/auth/dev-bypass";

const SAMPLE = `ST2 night shift. Emergency LSCS for fetal bradycardia. Apgars 8 and 9. EBL 600ml. Consent under time pressure.`;

async function main() {
  const supabase = createServiceRoleSupabaseClient();
  const userId = getDevBypassUserId();
  console.log("userId", userId);

  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number, title ), descriptors ( text, sort_order )")
    .not("legacy_id", "is", null);

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered")
    .eq("user_id", userId);

  console.log("keySkillRows", keySkillRows?.length, "coverageRows", coverageRows?.length);

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

  console.log("enrichedKeySkills", enrichedKeySkills.length);

  const generated = await generatePortfolioEntry({
    entry_type: "reflection",
    free_text: SAMPLE,
    stage_id: "ST2",
    length: "short",
  });

  const entryText = Object.values(generated.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const scored = enrichedKeySkills.map((ks) => {
    const allText = [ks.title, ...ks.descriptors].join(" ").toLowerCase();
    const words = allText.split(/\s+/).filter((w) => w.length > 4);
    const hits = words.filter((w) => entryText.includes(w)).length;
    const gapBoost = ks.covered === false ? 2 : 0;
    return { ks, score: hits + gapBoost };
  });

  const topCandidates = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.ks);

  console.log(
    "topCandidates sample:",
    topCandidates.slice(0, 5).map((k) => ({ id: k.key_skill_id, title: k.title, score: scored.find((s) => s.ks.key_skill_id === k.key_skill_id)?.score })),
  );

  try {
    const match = await matchKeySkills({
      entry_fields: generated.fields,
      entry_type: "reflection",
      candidates: topCandidates,
      pinned_key_skill_ids: [],
    });
    console.log("matchKeySkills OK:", match);
  } catch (e) {
    console.error("matchKeySkills FAILED:", e instanceof Error ? e.message : e);
  }
}

void main();
