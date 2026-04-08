import * as fs from "fs";
import * as path from "path";
import type { ScoredResult } from "../types";
import { MODELS } from "../config";

const RESULTS_DIR = path.join(__dirname, "..", "results");

// ── Helpers ───────────────────────────────────────────────────────────────────

function conf(n: unknown): string {
  const v = Number(n);
  return isNaN(v) ? "—" : v.toFixed(2);
}

function covered(v: unknown): string {
  return v === true ? "✅ Yes" : v === false ? "❌ No" : "—";
}

function short(text: unknown, max = 80): string {
  const s = String(text ?? "").replace(/\n/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Descriptor audit ──────────────────────────────────────────────────────────

function buildDescriptorAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "descriptor",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

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

  // Table header
  const modelLabels = modelKeys.map((k) => MODELS[k]?.label ?? k);
  lines.push(`| Descriptor ID | ${modelLabels.map((l) => l).join(" | ")} |`);
  lines.push(`| --- | ${modelLabels.map(() => "---").join(" | ")} |`);

  for (const did of allDescriptorIds) {
    const cells = modelKeys.map((k) => {
      const r = caseResults.find((r) => r.modelKey === k);
      if (!r || !Array.isArray(r.parsed)) return "_(no output)_";
      const item = (r.parsed as Record<string, unknown>[]).find(
        (i) => String(i.descriptor_id) === did,
      );
      if (!item) return "_(not returned)_";
      const cov = covered(item.covered);
      const c = conf(item.confidence);
      return `${cov} (conf: ${c})`;
    });
    lines.push(`| \`${did.slice(-8)}\` | ${cells.join(" | ")} |`);
  }
  lines.push("");

  return lines;
}

// ── Cross-CiP audit ───────────────────────────────────────────────────────────

function buildCrossCipAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "cross-cip",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

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

  const modelLabels = modelKeys.map((k) => MODELS[k]?.label ?? k);
  lines.push(`| Skill ID | CiP | ${modelLabels.map((l) => `${l}<br>conf / rationale`).join(" | ")} |`);
  lines.push(`| --- | --- | ${modelLabels.map(() => "---").join(" | ")} |`);

  for (const sid of allSkillIds) {
    let cipNumber = "—";
    const cells = modelKeys.map((k) => {
      const r = caseResults.find((r) => r.modelKey === k);
      if (!r || !Array.isArray(r.parsed)) return "—";
      const item = (r.parsed as Record<string, unknown>[]).find(
        (i) => String(i.key_skill_id) === sid,
      );
      if (!item) return "—";
      if (item.cip_number) cipNumber = String(item.cip_number);
      const c = conf(item.confidence);
      const rationale = short(item.rationale, 60);
      return `${c} / "${rationale}"`;
    });
    lines.push(`| \`${sid.slice(-12)}\` | ${cipNumber} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  // Show what each model uniquely picked (not in others)
  for (const k of modelKeys) {
    const r = caseResults.find((r) => r.modelKey === k);
    if (!r || !Array.isArray(r.parsed) || r.parsed.length === 0) continue;
    const label = MODELS[k]?.label ?? k;
    const count = (r.parsed as unknown[]).length;
    lines.push(`**${label}** identified ${count} skill(s)`);
  }
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
];

function buildGenerateAudit(
  caseId: string,
  results: ScoredResult[],
  modelKeys: string[],
): string[] {
  const lines: string[] = [];

  const caseResults = results.filter(
    (r) => r.testCaseId === caseId && r.callType === "generate",
  );
  if (caseResults.length === 0) return lines;

  lines.push(`### ${caseId}`);
  lines.push("");

  for (const k of modelKeys) {
    const r = caseResults.find((r) => r.modelKey === k);
    const modelLabel = MODELS[k]?.label ?? k;

    lines.push(`#### ${modelLabel}`);
    if (!r || !r.parseSuccess || !r.parsed) {
      lines.push("_Parse failed — no output_");
      lines.push("");
      continue;
    }

    // Generate output is { entry_type, fields: { ... }, stage_id, inferred_level }
    const top = r.parsed as Record<string, unknown>;
    const fields = (typeof top.fields === "object" && top.fields !== null)
      ? top.fields as Record<string, unknown>
      : top; // fallback: some models might flatten the output

    const title = String(fields.title ?? top.entry_type ?? "").trim();
    if (title) lines.push(`**Title:** ${title}`);
    lines.push(`**Entry type:** ${String(top.entry_type ?? "")}`);
    lines.push(`**Score:** ${r.score}/${r.maxScore}`);
    lines.push("");

    for (const key of NARRATIVE_KEYS) {
      const text = String(fields[key] ?? "").trim();
      if (!text) continue;
      const fieldLabel = key.replace(/_/g, " ");
      // Show first 500 chars of each narrative field
      const preview = text.length > 500 ? text.slice(0, 500) + "\n\n_[truncated...]_" : text;
      lines.push(`**${fieldLabel}:**`);
      lines.push("");
      lines.push(preview);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines;
}

// ── Main audit builder ────────────────────────────────────────────────────────

export function buildAuditReport(
  results: ScoredResult[],
  modelKeys: string[],
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
      "Shows how each model assessed each descriptor for each entry. " +
        "`covered` = whether the descriptor is evidenced. `conf` = confidence 0–1.",
    );
    lines.push("");

    for (const id of descIds) {
      lines.push(...buildDescriptorAudit(id, results, modelKeys));
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
      "Shows which cross-CiP skills each model identified, with confidence and rationale. " +
        "A dash (—) means the model did not identify that skill.",
    );
    lines.push("");

    for (const id of crossIds) {
      lines.push(...buildCrossCipAudit(id, results, modelKeys));
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
      "Shows the actual written output from each model for each entry. " +
        "Narrative fields are shown in full (up to 400 chars each).",
    );
    lines.push("");

    for (const id of genIds) {
      lines.push(...buildGenerateAudit(id, results, modelKeys));
    }
  }

  return lines.join("\n");
}

export function writeAuditReport(
  results: ScoredResult[],
  modelKeys: string[],
): string {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const runAt = new Date().toISOString();
  const ts = runAt.replace(/[:.]/g, "-").slice(0, 19);

  const md = buildAuditReport(results, modelKeys, runAt);
  const auditPath = path.join(RESULTS_DIR, `audit-${ts}.md`);
  fs.writeFileSync(auditPath, md);

  return auditPath;
}
