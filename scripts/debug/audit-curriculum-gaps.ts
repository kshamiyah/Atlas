import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

/** Expected key skill counts per CiP from RCOG 2024 curriculum seed. */
const EXPECTED_SKILLS_BY_CIP: Record<number, number> = {
  1: 4,
  2: 5,
  3: 6,
  4: 3,
  5: 5,
  6: 6,
  7: 4,
  8: 4,
  9: 4,
  10: 10,
  11: 9,
  12: 7,
  13: 4,
  14: 4,
};

async function main() {
  const supabase = createServiceRoleSupabaseClient();

  const { data: cips, error: cipError } = await supabase
    .from("cips")
    .select("id, number, title")
    .order("number", { ascending: true });

  if (cipError) {
    console.error("cips error:", cipError.message);
    return;
  }

  const { data: keySkills, error: ksError } = await supabase
    .from("key_skills")
    .select(
      "id, legacy_id, skill_number, title, cip_id, descriptors ( id, text, sort_order ), cips ( number, title )",
    )
    .order("skill_number", { ascending: true });

  if (ksError) {
    console.error("key_skills error:", ksError.message);
    return;
  }

  type SkillRow = NonNullable<typeof keySkills>[number];
  const skillsByCip = new Map<number, SkillRow[]>();

  for (const ks of keySkills ?? []) {
    const cip = Array.isArray(ks.cips) ? ks.cips[0] : ks.cips;
    const cipNumber = cip?.number;
    if (cipNumber == null) continue;
    const list = skillsByCip.get(cipNumber) ?? [];
    list.push(ks);
    skillsByCip.set(cipNumber, list);
  }

  console.log("=== CURRICULUM AUDIT: KEY SKILLS & DESCRIPTORS ===\n");

  let totalSkills = 0;
  let totalExpectedSkills = 0;
  let skillsMissingDescriptors = 0;
  let totalDescriptors = 0;

  for (const cip of cips ?? []) {
    const n = cip.number;
    const skills = (skillsByCip.get(n) ?? []).sort(
      (a, b) => a.skill_number - b.skill_number,
    );
    const expected = EXPECTED_SKILLS_BY_CIP[n] ?? 0;
    totalSkills += skills.length;
    totalExpectedSkills += expected;

    const missingSkills = expected - skills.length;
    const skillsWithoutDesc = skills.filter((s) => {
      const desc = Array.isArray(s.descriptors) ? s.descriptors : [];
      return desc.length === 0;
    });

    skillsMissingDescriptors += skillsWithoutDesc.length;
    totalDescriptors += skills.reduce((sum, s) => {
      const desc = Array.isArray(s.descriptors) ? s.descriptors : [];
      return sum + desc.length;
    }, 0);

    const status =
      missingSkills === 0 && skillsWithoutDesc.length === 0
        ? "OK"
        : missingSkills > 0
          ? "MISSING SKILLS"
          : "MISSING DESCRIPTORS";

    console.log(`CiP ${n}: ${cip.title}`);
    console.log(
      `  Key skills: ${skills.length}/${expected} expected | Descriptors: ${skills.reduce((s, k) => s + (Array.isArray(k.descriptors) ? k.descriptors.length : 0), 0)} total | ${status}`,
    );

    if (missingSkills > 0) {
      console.log(`  ⚠ Missing ${missingSkills} key skill(s) entirely`);
    }

    if (skillsWithoutDesc.length > 0) {
      console.log(`  ⚠ ${skillsWithoutDesc.length} skill(s) with 0 descriptors:`);
      for (const s of skillsWithoutDesc) {
        console.log(
          `    - KS${String(s.skill_number).padStart(2, "0")} ${s.legacy_id ?? "?"} | ${s.title}`,
        );
      }
    }

    console.log("");
  }

  console.log("=== SUMMARY ===");
  console.log(`CiPs: ${cips?.length ?? 0}`);
  console.log(`Key skills in DB: ${totalSkills} (expected ${totalExpectedSkills})`);
  console.log(`Skills missing descriptors: ${skillsMissingDescriptors}`);
  console.log(`Total descriptors in DB: ${totalDescriptors}`);

  const allMissingDesc = (keySkills ?? [])
    .filter((s) => {
      const desc = Array.isArray(s.descriptors) ? s.descriptors : [];
      return desc.length === 0;
    })
    .map((s) => {
      const cip = Array.isArray(s.cips) ? s.cips[0] : s.cips;
      return {
        cip: cip?.number ?? "?",
        legacy_id: s.legacy_id,
        skill_number: s.skill_number,
        title: s.title,
      };
    })
    .sort((a, b) => Number(a.cip) - Number(b.cip) || a.skill_number - b.skill_number);

  console.log("\n=== FULL LIST: SKILLS WITHOUT DESCRIPTORS ===");
  for (const row of allMissingDesc) {
    console.log(`CiP ${row.cip} | ${row.legacy_id} | ${row.title}`);
  }
}

void main();
