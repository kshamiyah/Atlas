import type { KeySkillCandidate } from "./match-key-skills";

/** CiP-level boosts from clinical themes in the generated entry text. */
function cipThemeBoosts(entryText: string): Record<number, number> {
  const boosts: Record<number, number> = {};

  if (/fetal|bradycardia|ctg|intrapartum|labour ward|tachycardia/i.test(entryText)) {
    boosts[10] = (boosts[10] ?? 0) + 8;
    boosts[12] = (boosts[12] ?? 0) + 3;
  }
  if (/lscs|caesarean|caesar|c-section|operative|theatre|incision|assistant|surg/i.test(entryText)) {
    boosts[10] = (boosts[10] ?? 0) + 6;
  }
  if (/emergency|urgent delivery|category 1|category 2/i.test(entryText)) {
    boosts[10] = (boosts[10] ?? 0) + 5;
  }
  if (/consent|decision|anxiety|counsell|communicat|shared decision/i.test(entryText)) {
    boosts[1] = (boosts[1] ?? 0) + 5;
    boosts[2] = (boosts[2] ?? 0) + 3;
  }
  if (/mdt|team|handover|escalat|registrar|consultant/i.test(entryText)) {
    boosts[5] = (boosts[5] ?? 0) + 4;
  }
  if (/reflect|learning|supervisor|cpd|stratog/i.test(entryText)) {
    boosts[6] = (boosts[6] ?? 0) + 3;
  }

  return boosts;
}

export function rankKeySkillCandidates(
  entryText: string,
  skills: KeySkillCandidate[],
  limit = 25,
): KeySkillCandidate[] {
  const text = entryText.toLowerCase();
  const cipBoosts = cipThemeBoosts(text);

  const scored = skills.map((ks) => {
    const allText = [ks.title, ...ks.descriptors].join(" ").toLowerCase();
    const words = allText.split(/\s+/).filter((w) => w.length > 4);
    const hits = words.filter((w) => text.includes(w)).length;
    const gapBoost = ks.covered === false ? 3 : 0;
    const cipBoost = ks.cip_number != null ? (cipBoosts[ks.cip_number] ?? 0) : 0;
    return { ks, score: hits + gapBoost + cipBoost };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.ks);
}
