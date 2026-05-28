import { generatePortfolioEntry } from "@/lib/ai/generate";

const SAMPLE_NOTES = `ST2 night shift. I was first assistant for an emergency LSCS for fetal bradycardia at 8cm dilatation. Consultant scrubbed; I did skin incision, assisted delivery of head and shoulders, and closure of uterus under direct supervision.

Before theatre I reviewed the CTG with the registrar and explained to the patient why we were recommending caesarean now. She was anxious about recovery and breastfeeding; I spent a few minutes answering questions and the consultant confirmed the plan.

In theatre I struggled initially with angle of uterine incision — consultant talked me through it. Delivery was straightforward; Apgars 8 and 9. I checked uterus and adnexae before closure. Estimated blood loss ~600ml.

Post-op I saw her on the ward, checked observations and wound, and discussed analgesia and mobilisation.

Reflection: I felt more confident with team communication than with the technical steps. I need more supervised LSCS before attempting incision independently. Good learning around consent under time pressure.`;

async function main() {
  const start = Date.now();
  const result = await generatePortfolioEntry({
    entry_type: "reflection",
    free_text: SAMPLE_NOTES,
    stage_id: "ST2",
    date_hint: "2026-05-20",
    length: "short",
  });

  console.log("\n=== GENERATION TEST (reflection, brief) ===");
  console.log("Time:", `${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log("entry_type:", result.entry_type);
  console.log("stage_id:", result.stage_id);
  console.log("\n--- title ---\n", result.fields.title);
  console.log("\n--- what_happened (words:", wordCount(result.fields.what_happened), ") ---\n", result.fields.what_happened);
  console.log("\n--- important_points (words:", wordCount(result.fields.important_points), ") ---\n", result.fields.important_points);
  console.log("\n--- reflection (words:", wordCount(result.fields.reflection), ") ---\n", result.fields.reflection);
  console.log("\n--- action plan (words:", wordCount(result.fields.record_of_discussion_or_action_plan), ") ---\n", result.fields.record_of_discussion_or_action_plan);
  console.log("\n--- date ---", result.fields.date);
  if (result.notes?.length) console.log("\n--- AI notes ---", result.notes);
}

function wordCount(v: unknown): number {
  return String(v ?? "").trim().split(/\s+/).filter(Boolean).length;
}

void main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
