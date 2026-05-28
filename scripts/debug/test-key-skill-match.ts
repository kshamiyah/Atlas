import { generatePortfolioEntry } from "@/lib/ai/generate";
import { matchKeySkills, type KeySkillCandidate } from "@/lib/ai/match-key-skills";

const SAMPLE = `ST2 night shift. Emergency LSCS for fetal bradycardia. Apgars 8 and 9. EBL 600ml. Consent under time pressure.`;

async function main() {
  const generated = await generatePortfolioEntry({
    entry_type: "reflection",
    free_text: SAMPLE,
    stage_id: "ST2",
    length: "short",
  });

  const fakeCandidates: KeySkillCandidate[] = [
    {
      key_skill_id: "KS-TEST-1",
      title: "Fetal wellbeing concerns (intrapartum)",
      cip_number: 10,
      cip_title: "CiP 10",
      descriptors: ["Assesses CTG", "Escalates concerns", "Emergency delivery"],
      covered: false,
      evidence_count: 0,
    },
    {
      key_skill_id: "KS-TEST-2",
      title: "Consent and shared decision making",
      cip_number: 1,
      cip_title: "CiP 1",
      descriptors: ["Explains risks", "Supports patient choice"],
      covered: null,
      evidence_count: null,
    },
  ];

  try {
    const match = await matchKeySkills({
      entry_fields: generated.fields,
      entry_type: "reflection",
      candidates: fakeCandidates,
      pinned_key_skill_ids: [],
    });
    console.log("matchKeySkills OK:", match);
  } catch (e) {
    console.error("matchKeySkills FAILED:", e instanceof Error ? e.message : e);
  }
}

void main();
