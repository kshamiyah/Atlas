/**
 * Full Write Entry API test: generation + key skill + descriptor mapping.
 * Usage: npx tsx --env-file=.env.local scripts/debug/test-generate-entry-api.ts
 */

const SAMPLE_NOTES = `ST2 night shift. I was first assistant for an emergency LSCS for fetal bradycardia at 8cm dilatation. Consultant scrubbed; I did skin incision, assisted delivery of head and shoulders, and closure of uterus under direct supervision.

Before theatre I reviewed the CTG with the registrar and explained to the patient why we were recommending caesarean now. She was anxious about recovery and breastfeeding; I spent a few minutes answering questions and the consultant confirmed the plan.

In theatre I struggled initially with angle of uterine incision — consultant talked me through it. Delivery was straightforward; Apgars 8 and 9. I checked uterus and adnexae before closure. Estimated blood loss ~600ml.

Post-op I saw her on the ward, checked observations and wound, and discussed analgesia and mobilisation.

Reflection: I felt more confident with team communication than with the technical steps. I need more supervised LSCS before attempting incision independently. Good learning around consent under time pressure.`;

async function main() {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const start = Date.now();

  const res = await fetch(`${base}/api/generate/entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry_type: "reflection",
      free_text: SAMPLE_NOTES,
      length: "short",
      date: "2026-05-20",
    }),
  });

  const json = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n=== POST /api/generate/entry (${elapsed}s) ===`);
  console.log("HTTP", res.status, "ok:", json.ok);

  if (!res.ok || !json.ok) {
    console.error("Error:", json.error ?? json);
    process.exitCode = 1;
    return;
  }

  const result = json.result;
  console.log("saved_id:", json.id);
  console.log("stage_id:", result.stage_id);

  for (const field of [
    "title",
    "what_happened",
    "important_points",
    "reflection",
    "record_of_discussion_or_action_plan",
    "log_procedure",
    "date",
  ] as const) {
    const text = String(result.fields?.[field] ?? "");
    if (!text.trim()) continue;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    console.log(`\n--- ${field} (${words} words) ---`);
    console.log(text);
  }

  const skills = result.suggested_key_skills_detail ?? [];
  console.log(`\n=== CURRICULUM MAPPING (${skills.length} skills) ===`);
  for (const skill of skills) {
    console.log(`\n• ${skill.title} (CiP ${skill.cip_number ?? "?"})${skill.covered === false ? " [gap]" : ""}`);
    if (skill.rationale) console.log(`  Rationale: ${skill.rationale}`);
    const evidenced = new Set(skill.evidenced_descriptors ?? []);
    const all = skill.all_descriptors ?? [];
    if (all.length === 0 && evidenced.size === 0) {
      console.log("  (no descriptors in DB for this skill)");
      continue;
    }
    for (const d of all.length > 0 ? all : [...evidenced]) {
      console.log(`  ${evidenced.has(d) ? "✓" : "○"} ${d}`);
    }
  }

  if (result.notes?.length) {
    console.log("\n--- AI notes ---");
    for (const n of result.notes) console.log("·", n);
  }
}

void main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
