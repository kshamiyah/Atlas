import * as fs from "fs";
import * as path from "path";
import type { ScoredResult, AnyTestCase } from "../types";
import { MODELS, MODEL_PRICING } from "../config";

const RESULTS_DIR = path.join(__dirname, "..", "results");

// ── Helpers ───────────────────────────────────────────────────────────────────

function conf(n: unknown): string {
  const v = Number(n);
  return isNaN(v) ? "—" : v.toFixed(2);
}

function covered(v: unknown): string {
  return v === true ? "✅ Yes" : v === false ? "❌ No" : "—";
}

function clip(text: unknown, max = 80): string {
  const s = String(text ?? "").replace(/\n/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function blockQuote(text: string, maxChars = 600): string {
  const trimmed = text.length > maxChars ? text.slice(0, maxChars) + "\n\n_[truncated]_" : text;
  // Indent each line as a blockquote
  return trimmed
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

// ── Cost summary ──────────────────────────────────────────────────────────────

function buildCostTable(results: ScoredResult[], modelKeys: string[]): string[] {
  const lines: string[] = [];
  lines.push("## Cost This Run");
  lines.push("");
  lines.push("| Model | Input tokens | Output tokens | Run cost | Est. $/1k entries |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const k of modelKeys) {
    const modelResults = results.filter((r) => r.modelKey === k);
    const label = MODELS[k]?.label ?? k;
    const pricing = MODEL_PRICING[k];
    const inputTok = modelResults.reduce((s, r) => s + r.inputTokens, 0);
    const outputTok = modelResults.reduce((s, r) => s + r.outputTokens, 0);

    if (!pricing) {
      lines.push(`| ${label} | ${inputTok.toLocaleString()} | ${outputTok.toLocaleString()} | n/a | n/a |`);
      continue;
    }

    const runCost = (inputTok / 1_000_000) * pricing.input + (outputTok / 1_000_000) * pricing.output;
    const caseCount = modelResults.length;
    const costPer = caseCount > 0
      ? (inputTok / caseCount / 1_000_000) * pricing.input +
        (outputTok / caseCount / 1_000_000) * pricing.output
      : 0;
    const per1k = costPer * 1000;

    lines.push(
      `| ${label} | ${inputTok.toLocaleString()} | ${outputTok.toLocaleString()} | $${runCost.toFixed(4)} | $${per1k.toFixed(2)} |`,
    );
  }

  lines.push("");
  lines.push(
    "_Est. $/1k entries = average cost per test case × 1,000. " +
    "In production not every entry runs all tasks, so real cost will be lower._",
  );
  lines.push("");
  return lines;
}

// ── Descriptor audit ──────────────────────────────────────────────────────────

function buildDescriptorAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "descriptor",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

  // Show the input entry text
  const tc = testCases.find((t) => t.id === caseId && t.callType === "descriptor");
  if (tc && tc.callType === "descriptor") {
    lines.push(`**Entry type:** ${tc.entryType}`);
    lines.push("");
    lines.push("**Entry text (what the model read):**");
    lines.push("");
    lines.push(blockQuote(tc.entryText, 600));
    lines.push("");
    lines.push(`**Descriptors assessed (${tc.descriptors.length}):**`);
    lines.push("");
    for (const d of tc.descriptors) {
      lines.push(`- \`${d.descriptor_id.slice(-8)}\` (${d.key_skill_title}): ${clip(d.descriptor_text, 100)}`);
    }
    lines.push("");
  }

  // Collect all descriptor IDs across all model outputs
  const allDescriptorIds = new Set<string>();
  for (const r of caseResults) {
    const arr = Array.isArray(r.parsed) ? r.parsed : [];
    for (const item of arr as Record<string, unknown>[]) {
      if (item.descriptor_id) allDescriptorIds.add(String(item.descriptor_id));
    }
  }

  if (allDescriptorIds.size === 0) {
    lines.push("_No parsed output available._");
    lines.push("");
    return lines;
  }

  lines.push("**Model verdicts:**");
  lines.push("");

  // Table header
  const modelLabels = modelKeys.map((k) => MODELS[k]?.label ?? k);
  lines.push(`| Descriptor | ${modelLabels.join(" | ")} |`);
  lines.push(`| --- | ${modelLabels.map(() => "---").join(" | ")} |`);

  // Build descriptor text lookup from test case
  const descTextMap: Record<string, string> = {};
  if (tc && tc.callType === "descriptor") {
    for (const d of tc.descriptors) {
      descTextMap[d.descriptor_id] = clip(d.descriptor_text, 50);
    }
  }

  for (const did of allDescriptorIds) {
    const label = descTextMap[did]
      ? `\`${did.slice(-8)}\` ${descTextMap[did]}`
      : `\`${did.slice(-8)}\``;
    const cells = modelKeys.map((k) => {
      const r = caseResults.find((r) => r.modelKey === k);
      if (!r || !Array.isArray(r.parsed)) return "_(no output)_";
      const item = (r.parsed as Record<string, unknown>[]).find(
        (i) => String(i.descriptor_id) === did,
      );
      if (!item) return "_(not returned)_";
      return `${covered(item.covered)} (conf: ${conf(item.confidence)})`;
    });
    lines.push(`| ${label} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  // Score row
  const modelLabelsRow = modelKeys.map((k) => MODELS[k]?.label ?? k);
  const scoreCells = modelKeys.map((k) => {
    const r = caseResults.find((r) => r.modelKey === k);
    return r ? `**${r.score}/${r.maxScore}**` : "—";
  });
  lines.push(`| **Score** | ${scoreCells.join(" | ")} |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  return lines;
}

// ── Cross-CiP audit ───────────────────────────────────────────────────────────

function buildCrossCipAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "cross-cip",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

  // Show input
  const tc = testCases.find((t) => t.id === caseId && t.callType === "cross-cip");
  if (tc && tc.callType === "cross-cip") {
    lines.push(`**Entry type:** ${tc.entryType}  |  **Primary CiP:** ${tc.linkedCipNumber}`);
    lines.push("");
    lines.push("**Entry text (what the model read):**");
    lines.push("");
    lines.push(blockQuote(tc.entryText, 600));
    lines.push("");
    lines.push(`**${tc.crossCipSkills.length} cross-CiP skills were offered as candidates**`);
    lines.push("");
  }

  // Collect all skill IDs mentioned by any model
  const allSkillIds = new Set<string>();
  for (const r of caseResults) {
    const arr = Array.isArray(r.parsed) ? r.parsed : [];
    for (const item of arr as Record<string, unknown>[]) {
      if (item.key_skill_id) allSkillIds.add(String(item.key_skill_id));
    }
  }

  if (allSkillIds.size === 0) {
    lines.push("_No skills identified by any model._");
    lines.push("");
    return lines;
  }

  // Build skill title lookup from test case
  const skillTitleMap: Record<string, string> = {};
  if (tc && tc.callType === "cross-cip") {
    for (const s of tc.crossCipSkills) {
      skillTitleMap[s.key_skill_id] = s.title;
    }
  }

  lines.push("**Skills identified (— means not picked by that model):**");
  lines.push("");
  const modelLabels = modelKeys.map((k) => MODELS[k]?.label ?? k);
  lines.push(`| Skill | CiP | ${modelLabels.map((l) => `${l}<br>conf / rationale`).join(" | ")} |`);
  lines.push(`| --- | --- | ${modelLabels.map(() => "---").join(" | ")} |`);

  for (const sid of allSkillIds) {
    const title = skillTitleMap[sid] ? clip(skillTitleMap[sid], 40) : sid.slice(-12);
    let cipNumber = "—";
    const cells = modelKeys.map((k) => {
      const r = caseResults.find((r) => r.modelKey === k);
      if (!r || !Array.isArray(r.parsed)) return "—";
      const item = (r.parsed as Record<string, unknown>[]).find(
        (i) => String(i.key_skill_id) === sid,
      );
      if (!item) return "—";
      if (item.cip_number) cipNumber = String(item.cip_number);
      return `${conf(item.confidence)} / "${clip(item.rationale, 50)}"`;
    });
    lines.push(`| ${title} | ${cipNumber} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  // Per-model counts + score
  for (const k of modelKeys) {
    const r = caseResults.find((r) => r.modelKey === k);
    if (!r) continue;
    const label = MODELS[k]?.label ?? k;
    const count = Array.isArray(r.parsed) ? (r.parsed as unknown[]).length : 0;
    lines.push(`**${label}**: ${count} skill(s) identified — score ${r.score}/${r.maxScore}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  return lines;
}

// ── Generate audit ────────────────────────────────────────────────────────────

const NARRATIVE_KEYS = [
  "describe_the_event",
  "trainee_analysis",
  "trainee_learning_plan",
  "trainee_reflection",
  "what_happened",
  "important_points",
  "reflection",
  "record_of_discussion_or_action_plan",
  "description",
  "trainee_comments",
  "situation_awareness",
  "decision_making",
  "communication_teamwork",
  "leadership",
  "clinical_details_and_complexity",
  "what_went_well",
  "what_could_have_gone_better",
  "learning_plan",
];

function buildGenerateAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "generate",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

  // Show input
  const tc = testCases.find((t) => t.id === caseId && t.callType === "generate");
  if (tc && tc.callType === "generate") {
    lines.push(`**Entry type:** ${tc.entryType}  |  **Length:** ${tc.length}  |  **Stage:** ${tc.stageId}`);
    lines.push("");
    lines.push("**User's rough notes (the input):**");
    lines.push("");
    lines.push(blockQuote(tc.rawInput, 500));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  for (const k of modelKeys) {
    const r = caseResults.find((r) => r.modelKey === k);
    const modelLabel = MODELS[k]?.label ?? k;

    lines.push(`#### ${modelLabel} — score: ${r ? `${r.score}/${r.maxScore}` : "—"}`);
    lines.push("");

    if (!r || !r.parseSuccess || !r.parsed) {
      lines.push("_Parse failed — no output_");
      lines.push("");
      continue;
    }

    // Generate output: { entry_type, fields: { ... }, stage_id, inferred_level }
    const top = r.parsed as Record<string, unknown>;
    const fields =
      typeof top.fields === "object" && top.fields !== null
        ? (top.fields as Record<string, unknown>)
        : top; // fallback for models that flatten output

    const title = String(fields.title ?? "").trim();
    if (title) lines.push(`**Title:** ${title}`);
    lines.push(`**Entry type detected:** ${String(top.entry_type ?? "")}`);
    lines.push("");

    for (const key of NARRATIVE_KEYS) {
      const text = String(fields[key] ?? "").trim();
      if (!text) continue;
      const fieldLabel = key.replace(/_/g, " ");
      const wc = text.split(/\S+/).length - 1;
      lines.push(`**${fieldLabel}** _(${wc} words):_`);
      lines.push("");
      lines.push(text);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines;
}

// ── Field regeneration audit ──────────────────────────────────────────────────

function buildFieldRegenAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "field-regen",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

  // Show input context
  const tc = testCases.find((t) => t.id === caseId && t.callType === "field-regen");
  if (tc && tc.callType === "field-regen") {
    lines.push(
      `**Entry type:** ${tc.entryType}  |  **Field being regenerated:** "${tc.targetFieldLabel}"  |  **Length:** ${tc.length}`,
    );
    lines.push("");

    if (tc.rawInput) {
      lines.push("**Original user notes:**");
      lines.push("");
      lines.push(blockQuote(tc.rawInput, 400));
      lines.push("");
    }

    lines.push("**Context given to model (other fields already written):**");
    lines.push("");
    for (const [k, v] of Object.entries(tc.currentFields)) {
      if (k === tc.targetFieldId) continue;
      lines.push(`> **${k}:** ${clip(v, 120)}`);
    }
    lines.push("");

    lines.push("**Original field value (for comparison):**");
    lines.push("");
    lines.push(blockQuote(tc.originalFieldValue, 500));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Show each model's regenerated output
  for (const k of modelKeys) {
    const r = caseResults.find((r) => r.modelKey === k);
    const modelLabel = MODELS[k]?.label ?? k;

    lines.push(`#### ${modelLabel} — score: ${r ? `${r.score}/${r.maxScore}` : "—"}`);
    lines.push("");

    if (!r || !r.parseSuccess || !r.parsed) {
      lines.push("_Parse failed — no output_");
      lines.push("");
      continue;
    }

    const data = r.parsed as Record<string, unknown>;
    const value = typeof data.value === "string" ? data.value.trim() : "";
    if (!value) {
      lines.push("_Empty output_");
      lines.push("");
      continue;
    }

    const wc = value.split(/\S+/).length - 1;
    lines.push(`_${wc} words_`);
    lines.push("");
    lines.push(value);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines;
}

// ── Main audit builder ────────────────────────────────────────────────────────

export function buildAuditReport(
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
  runAt: string,
): string {
  const lines: string[] = [];
  const modelLabels = modelKeys.map((k) => MODELS[k]?.label ?? k);

  lines.push("# Model Audit Report");
  lines.push(`**Run at:** ${runAt}`);
  lines.push(`**Models:** ${modelLabels.join(", ")}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Cost table ─────────────────────────────────────────────────────────────
  lines.push(...buildCostTable(results, modelKeys));

  // ── Descriptor section ─────────────────────────────────────────────────────
  const descIds = [
    ...new Set(
      results
        .filter((r) => r.callType === "descriptor")
        .map((r) => r.testCaseId),
    ),
  ];

  if (descIds.length > 0) {
    lines.push("## Descriptor Matching");
    lines.push("");
    lines.push(
      "For each entry: the entry text is shown first so you can judge whether " +
        "each model's verdict (Yes/No + confidence) is correct.",
    );
    lines.push("");

    for (const id of descIds) {
      lines.push(...buildDescriptorAudit(id, results, modelKeys, testCases));
    }
  }

  // ── Cross-CiP section ──────────────────────────────────────────────────────
  const crossIds = [
    ...new Set(
      results
        .filter((r) => r.callType === "cross-cip")
        .map((r) => r.testCaseId),
    ),
  ];

  if (crossIds.length > 0) {
    lines.push("## Cross-CiP Skill Matching");
    lines.push("");
    lines.push(
      "For each entry: the entry text is shown first, then which cross-specialty " +
        "skills each model identified, with confidence and reason.",
    );
    lines.push("");

    for (const id of crossIds) {
      lines.push(...buildCrossCipAudit(id, results, modelKeys, testCases));
    }
  }

  // ── Generate section ───────────────────────────────────────────────────────
  const genIds = [
    ...new Set(
      results
        .filter((r) => r.callType === "generate")
        .map((r) => r.testCaseId),
    ),
  ];

  if (genIds.length > 0) {
    lines.push("## Generated Portfolio Entries");
    lines.push("");
    lines.push(
      "For each entry: the user's rough notes are shown first, then each model's " +
        "full written output. Read and score them yourself.",
    );
    lines.push("");

    for (const id of genIds) {
      lines.push(...buildGenerateAudit(id, results, modelKeys, testCases));
    }
  }

  // ── Field regeneration section ─────────────────────────────────────────────
  const fieldRegenIds = [
    ...new Set(
      results
        .filter((r) => r.callType === "field-regen")
        .map((r) => r.testCaseId),
    ),
  ];

  if (fieldRegenIds.length > 0) {
    lines.push("## Field Regeneration");
    lines.push("");
    lines.push(
      "For each entry: the context (other fields already written) is shown, then " +
        "the original field value, then what each model produces when asked to rewrite it. " +
        "Judge whether the rewrite fits the tone/content of the other fields.",
    );
    lines.push("");

    for (const id of fieldRegenIds) {
      lines.push(...buildFieldRegenAudit(id, results, modelKeys, testCases));
    }
  }

  return lines.join("\n");
}

export function writeAuditReport(
  results: ScoredResult[],
  modelKeys: string[],
  testCases: AnyTestCase[],
): string {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const runAt = new Date().toISOString();
  const ts = runAt.replace(/[:.]/g, "-").slice(0, 19);

  const md = buildAuditReport(results, modelKeys, testCases, runAt);
  const auditPath = path.join(RESULTS_DIR, `audit-${ts}.md`);
  fs.writeFileSync(auditPath, md);

  return auditPath;
}
