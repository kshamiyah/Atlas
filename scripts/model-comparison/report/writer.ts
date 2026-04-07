import * as fs from "fs";
import * as path from "path";
import type { ScoredResult, ModelSummary, CallType } from "../types";
import { MODELS } from "../config";

const RESULTS_DIR = path.join(__dirname, "..", "results");
const CALL_TYPES: CallType[] = ["generate", "match-key-skills", "normalizer", "descriptor", "cross-cip"];

// ── Summary computation ──────────────────────────────────────────────────────

export function buildSummaries(
  results: ScoredResult[],
  modelKeys: string[],
): ModelSummary[] {
  return modelKeys.map((modelKey) => {
    const modelResults = results.filter((r) => r.modelKey === modelKey);
    const modelConfig = MODELS[modelKey];

    const totalScore = modelResults.reduce((s, r) => s + r.score, 0);
    const maxPossibleScore = modelResults.reduce((s, r) => s + r.maxScore, 0);
    const scorePercent =
      maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

    const avgLatencyMs =
      modelResults.length > 0
        ? modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length
        : 0;

    const totalInputTokens = modelResults.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutputTokens = modelResults.reduce((s, r) => s + r.outputTokens, 0);
    const parseFailures = modelResults.filter((r) => !r.parseSuccess).length;

    const byCallType = {} as ModelSummary["byCallType"];
    for (const ct of CALL_TYPES) {
      const ctResults = modelResults.filter((r) => r.callType === ct);
      byCallType[ct] = {
        score: ctResults.reduce((s, r) => s + r.score, 0),
        maxScore: ctResults.reduce((s, r) => s + r.maxScore, 0),
        caseCount: ctResults.length,
        parseFailures: ctResults.filter((r) => !r.parseSuccess).length,
      };
    }

    return {
      modelKey,
      modelLabel: modelConfig?.label ?? modelKey,
      totalScore,
      maxPossibleScore,
      scorePercent,
      avgLatencyMs,
      totalInputTokens,
      totalOutputTokens,
      parseFailures,
      byCallType,
    };
  });
}

// ── Markdown report ──────────────────────────────────────────────────────────

function pct(score: number, max: number): string {
  if (max === 0) return "n/a";
  return `${score}/${max} (${Math.round((score / max) * 100)}%)`;
}

function flag(score: number, max: number): string {
  if (max === 0) return "";
  const p = score / max;
  if (p < 0.6) return " ⚠";
  if (p < 0.75) return " ○";
  return "";
}

export function buildMarkdownReport(
  summaries: ModelSummary[],
  results: ScoredResult[],
  runAt: string,
): string {
  const lines: string[] = [];

  lines.push(`# Model Comparison Report`);
  lines.push(`**Run at:** ${runAt}`);
  lines.push(`**Models:** ${summaries.map((s) => s.modelLabel).join(", ")}`);
  lines.push(`**Total test cases:** ${results.filter((r) => r.modelKey === summaries[0]?.modelKey).length}`);
  lines.push("");

  // ── Overall score table ────────────────────────────────────────────────────
  lines.push("## Overall Scores");
  lines.push("");
  const headerCols = ["Call Type", ...summaries.map((s) => s.modelLabel)];
  lines.push("| " + headerCols.join(" | ") + " |");
  lines.push("| " + headerCols.map(() => "---").join(" | ") + " |");

  for (const ct of CALL_TYPES) {
    const hasCases = summaries.some((s) => s.byCallType[ct].caseCount > 0);
    if (!hasCases) continue;

    const cells = summaries.map((s) => {
      const { score, maxScore, caseCount } = s.byCallType[ct];
      if (caseCount === 0) return "—";
      return pct(score, maxScore) + flag(score, maxScore);
    });
    lines.push(`| ${ct} | ${cells.join(" | ")} |`);
  }

  // Total row
  const totalCells = summaries.map(
    (s) => `**${pct(s.totalScore, s.maxPossibleScore)}**` + flag(s.totalScore, s.maxPossibleScore),
  );
  lines.push(`| **TOTAL** | ${totalCells.join(" | ")} |`);
  lines.push("");
  lines.push("⚠ = below 60%  ○ = below 75%");
  lines.push("");

  // ── Performance table ──────────────────────────────────────────────────────
  lines.push("## Performance");
  lines.push("");
  lines.push("| Metric | " + summaries.map((s) => s.modelLabel).join(" | ") + " |");
  lines.push("| --- | " + summaries.map(() => "---").join(" | ") + " |");
  lines.push(
    "| Avg latency | " +
      summaries.map((s) => `${Math.round(s.avgLatencyMs)}ms`).join(" | ") +
      " |",
  );
  lines.push(
    "| Total input tokens | " +
      summaries.map((s) => s.totalInputTokens.toLocaleString()).join(" | ") +
      " |",
  );
  lines.push(
    "| Total output tokens | " +
      summaries.map((s) => s.totalOutputTokens.toLocaleString()).join(" | ") +
      " |",
  );
  lines.push(
    "| Parse failures | " +
      summaries.map((s) => `${s.parseFailures}`).join(" | ") +
      " |",
  );
  lines.push("");

  // ── Per-call-type breakdown ────────────────────────────────────────────────
  lines.push("## Per-Check Breakdown");
  lines.push("");

  // Group results by testCaseId
  const caseIds = [...new Set(results.map((r) => r.testCaseId))];

  for (const ct of CALL_TYPES) {
    const ctCases = caseIds.filter((id) =>
      results.find((r) => r.testCaseId === id && r.callType === ct),
    );
    if (ctCases.length === 0) continue;

    lines.push(`### ${ct}`);
    lines.push("");

    for (const caseId of ctCases) {
      lines.push(`#### ${caseId}`);
      lines.push("");

      // Table of checks across models
      const caseResults = results.filter((r) => r.testCaseId === caseId);
      const firstResult = caseResults[0];
      if (!firstResult) continue;

      const checkNames = firstResult.checks.map((c) => c.name);
      const header = ["Check", "Max", ...summaries.map((s) => s.modelLabel)];
      lines.push("| " + header.join(" | ") + " |");
      lines.push("| " + header.map(() => "---").join(" | ") + " |");

      for (const checkName of checkNames) {
        const maxPts = firstResult.checks.find((c) => c.name === checkName)?.maxPoints ?? 0;
        const cells = summaries.map((s) => {
          const modelResult = caseResults.find((r) => r.modelKey === s.modelKey);
          if (!modelResult) return "—";
          const check = modelResult.checks.find((c) => c.name === checkName);
          if (!check) return "—";
          const indicator = check.passed ? "✓" : "✗";
          const detail = check.detail ? ` *(${check.detail.slice(0, 40)})*` : "";
          return `${indicator} ${check.points}${detail}`;
        });
        lines.push(`| ${checkName} | ${maxPts} | ${cells.join(" | ")} |`);
      }

      // Score row
      const scoreCells = summaries.map((s) => {
        const modelResult = caseResults.find((r) => r.modelKey === s.modelKey);
        if (!modelResult) return "—";
        return `**${modelResult.score}/${modelResult.maxScore}**`;
      });
      lines.push(`| **TOTAL** | | ${scoreCells.join(" | ")} |`);
      lines.push("");

      // Parse failures and raw output excerpts
      for (const s of summaries) {
        const modelResult = caseResults.find((r) => r.modelKey === s.modelKey);
        if (!modelResult) continue;
        if (!modelResult.parseSuccess) {
          lines.push(`> ⚠ **${s.modelLabel}** parse FAILED (${modelResult.parseMethod})`);
          if (modelResult.error) {
            lines.push(`> Error: ${modelResult.error.slice(0, 200)}`);
          }
          lines.push(`> Raw output: \`${modelResult.rawText.slice(0, 300).replace(/\n/g, " ")}\``);
          lines.push("");
        }
      }
    }
  }

  // ── Failures summary ───────────────────────────────────────────────────────
  const failures = results.filter((r) => !r.parseSuccess || r.score / r.maxScore < 0.6);
  if (failures.length > 0) {
    lines.push("## Failures and Low Scores");
    lines.push("");
    for (const f of failures) {
      const model = MODELS[f.modelKey];
      const pctScore = Math.round((f.score / f.maxScore) * 100);
      lines.push(
        `- **${model?.label ?? f.modelKey}** · ${f.testCaseId} · ${f.callType} · ${pctScore}%` +
          (!f.parseSuccess ? " · PARSE FAILED" : ""),
      );
      const failedChecks = f.checks.filter((c) => !c.passed && c.maxPoints >= 10);
      for (const fc of failedChecks) {
        lines.push(`  - ${fc.name}: 0/${fc.maxPoints}${fc.detail ? ` — ${fc.detail}` : ""}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── File writing ─────────────────────────────────────────────────────────────

export function writeReport(
  results: ScoredResult[],
  modelKeys: string[],
): { jsonPath: string; mdPath: string } {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const runAt = new Date().toISOString();
  const ts = runAt.replace(/[:.]/g, "-").slice(0, 19);

  const summaries = buildSummaries(results, modelKeys);

  // JSON report
  const jsonReport = {
    runAt,
    models: modelKeys.map((k) => MODELS[k]?.label ?? k),
    summaries,
    results: results.map((r) => ({
      ...r,
      // Truncate raw text in JSON to keep file size reasonable
      rawText: r.rawText.slice(0, 2000),
    })),
  };
  const jsonPath = path.join(RESULTS_DIR, `results-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  // Markdown report
  const md = buildMarkdownReport(summaries, results, runAt);
  const mdPath = path.join(RESULTS_DIR, `summary-${ts}.md`);
  fs.writeFileSync(mdPath, md);

  return { jsonPath, mdPath };
}
