/**
 * Model Comparison Test Harness
 *
 * Usage:
 *   npx ts-node --project tsconfig.tests.json scripts/model-comparison/run.ts \
 *     --user-id <uuid> \
 *     [--models haiku,gemma4]           (default: haiku,gemma4)
 *     [--call-types generate,match-key-skills,normalizer,descriptor,cross-cip]
 *     [--limit 15]                       (entries per call type, default: 15)
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY            (for haiku / sonnet)
 *   GOOGLE_AI_STUDIO_API_KEY     (for gemma4)
 *
 * Optional:
 *   MODEL_TEST_USER_ID           (alternative to --user-id flag)
 */

// Load .env.local if present (no dotenv dependency needed)
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(__dirname, "..", "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

import { fetchTestCases } from "./db";
import { runGenerate } from "./runners/generate.runner";
import { runMatchKeySkills } from "./runners/match-key-skills.runner";
import { runNormalizer } from "./runners/normalizer.runner";
import { runDescriptor } from "./runners/descriptor.runner";
import { runCrossCip } from "./runners/cross-cip.runner";
import { writeReport, buildSummaries } from "./report/writer";
import { MODELS } from "./config";
import type {
  ScoredResult,
  AnyTestCase,
  GenerateTestCase,
  MatchKeySkillsTestCase,
  NormalizerTestCase,
  DescriptorTestCase,
  CrossCipTestCase,
  ModelConfig,
  CallType,
} from "./types";

// ── CLI arg parsing ──────────────────────────────────────────────────────────

function parseArgs(): {
  userId: string;
  modelKeys: string[];
  callTypes: CallType[];
  limit: number;
  debug: boolean;
  entryTypes?: string[];
} {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const userId =
    get("--user-id") ?? process.env.MODEL_TEST_USER_ID ?? "";
  if (!userId) {
    console.error(
      "ERROR: --user-id <uuid> is required (or set MODEL_TEST_USER_ID env var)",
    );
    process.exit(1);
  }

  const modelsRaw = get("--models") ?? "haiku,gemma4";
  const modelKeys = modelsRaw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  for (const key of modelKeys) {
    if (!MODELS[key]) {
      console.error(
        `ERROR: Unknown model "${key}". Valid: ${Object.keys(MODELS).join(", ")}`,
      );
      process.exit(1);
    }
  }

  const allCallTypes: CallType[] = [
    "generate",
    "match-key-skills",
    "normalizer",
    "descriptor",
    "cross-cip",
  ];
  const callTypesRaw = get("--call-types");
  const callTypes = callTypesRaw
    ? (callTypesRaw.split(",").map((c) => c.trim()) as CallType[])
    : allCallTypes;

  const limit = parseInt(get("--limit") ?? "15", 10);
  const debug = args.includes("--debug");

  const entryTypesRaw = get("--entry-types");
  const entryTypes = entryTypesRaw
    ? entryTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  return { userId, modelKeys, callTypes, limit, debug, entryTypes };
}

// ── Concurrency helpers ──────────────────────────────────────────────────────

async function runWithSemaphore<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const taskIdx = idx++;
      results[taskIdx] = await tasks[taskIdx]();
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Per-case runner dispatch ─────────────────────────────────────────────────

async function runCase(
  testCase: AnyTestCase,
  model: ModelConfig,
  referenceResults: Map<string, ScoredResult>,
): Promise<ScoredResult> {
  const refKey = `${testCase.id}::haiku`;
  const refResult = referenceResults.get(refKey);
  const refParsed = refResult?.parsed ?? null;

  try {
    switch (testCase.callType) {
      case "generate":
        return await runGenerate(testCase as GenerateTestCase, model);
      case "match-key-skills":
        return await runMatchKeySkills(testCase as MatchKeySkillsTestCase, model);
      case "normalizer":
        return await runNormalizer(testCase as NormalizerTestCase, model);
      case "descriptor":
        return await runDescriptor(testCase as DescriptorTestCase, model, refParsed);
      case "cross-cip":
        return await runCrossCip(testCase as CrossCipTestCase, model, refParsed);
    }
  } catch (err) {
    // Return a failed result rather than crashing the whole run
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`  [error] ${testCase.id} / ${model.key}: ${errMsg}`);
    return {
      testCaseId: testCase.id,
      callType: testCase.callType,
      modelKey: model.key,
      rawText: "",
      parsed: null,
      parseSuccess: false,
      parseMethod: "failed",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      error: errMsg,
      checks: [],
      score: 0,
      maxScore: 100,
    };
  }
}

// ── Progress display ─────────────────────────────────────────────────────────

function printProgress(
  done: number,
  total: number,
  testCaseId: string,
  modelLabel: string,
  result: ScoredResult,
  debug = false,
) {
  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
  const flag = pct < 60 ? " ⚠" : pct < 75 ? " ○" : "";
  const parsed = result.parseSuccess ? "" : " [PARSE FAIL]";
  console.log(
    `  [${done}/${total}] ${testCaseId} · ${modelLabel} · ${result.latencyMs}ms · score=${pct}%${flag}${parsed}`,
  );
  if (debug && !result.parseSuccess) {
    if (result.error) {
      console.log(`    ↳ error: ${result.error.slice(0, 300)}`);
    } else if (result.rawText) {
      const preview = result.rawText.slice(0, 800).replace(/\n/g, "↵");
      console.log(`    ↳ raw[${result.rawText.length}chars]: ${preview}`);
    }
  }
}

function printSummaryTable(summaries: ReturnType<typeof buildSummaries>) {
  const CALL_TYPES: CallType[] = [
    "generate",
    "match-key-skills",
    "normalizer",
    "descriptor",
    "cross-cip",
  ];

  console.log("\n" + "═".repeat(80));
  console.log(" RESULTS");
  console.log("═".repeat(80));

  // Header
  const modelLabels = summaries.map((s) => s.modelLabel.slice(0, 22).padEnd(22));
  console.log("  " + "Call Type".padEnd(20) + modelLabels.join("  "));
  console.log("  " + "-".repeat(20) + modelLabels.map(() => "-".repeat(22)).join("--"));

  for (const ct of CALL_TYPES) {
    const hasCases = summaries.some((s) => s.byCallType[ct].caseCount > 0);
    if (!hasCases) continue;
    const cells = summaries.map((s) => {
      const { score, maxScore, caseCount } = s.byCallType[ct];
      if (caseCount === 0) return "—".padEnd(22);
      const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const flag = pct < 60 ? " ⚠" : pct < 75 ? " ○" : "";
      return `${score}/${maxScore} (${pct}%)${flag}`.padEnd(22);
    });
    console.log("  " + ct.padEnd(20) + cells.join("  "));
  }

  console.log("  " + "-".repeat(20) + modelLabels.map(() => "-".repeat(22)).join("--"));
  const totalCells = summaries.map((s) => {
    const pct = s.maxPossibleScore > 0 ? Math.round((s.totalScore / s.maxPossibleScore) * 100) : 0;
    const flag = pct < 60 ? " ⚠" : pct < 75 ? " ○" : "";
    return `${s.totalScore}/${s.maxPossibleScore} (${pct}%)${flag}`.padEnd(22);
  });
  console.log("  " + "TOTAL".padEnd(20) + totalCells.join("  "));

  console.log("\n  Latency:");
  for (const s of summaries) {
    console.log(`    ${s.modelLabel}: ${Math.round(s.avgLatencyMs)}ms avg`);
  }

  console.log("\n  Parse failures:");
  for (const s of summaries) {
    console.log(`    ${s.modelLabel}: ${s.parseFailures}`);
  }

  console.log("═".repeat(80));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { userId, modelKeys, callTypes, limit, debug, entryTypes } = parseArgs();

  console.log("\nModel Comparison Test Harness");
  console.log("──────────────────────────────");
  console.log(`Models:     ${modelKeys.join(", ")}`);
  console.log(`Call types: ${callTypes.join(", ")}`);
  console.log(`Limit:      ${limit} entries per call type`);
  console.log(`User:       ${userId.slice(0, 8)}...\n`);

  // Validate env vars for each model
  for (const key of modelKeys) {
    const model = MODELS[key];
    if (!process.env[model.envKey]) {
      console.error(`ERROR: Missing env var ${model.envKey} for model "${key}"`);
      process.exit(1);
    }
  }

  // Fetch real entries from DB
  console.log("Fetching test cases from database...");
  const testCases = await fetchTestCases({
    userId,
    limitPerCallType: limit,
    callTypes,
    entryTypes,
  });

  if (testCases.length === 0) {
    console.error("No test cases found. Check your user ID and database connection.");
    process.exit(1);
  }

  console.log(`\nLoaded ${testCases.length} test case(s) across ${callTypes.length} call type(s)\n`);

  // ── Phase 1: Run Haiku (reference model) first ───────────────────────────
  const referenceModelKey = modelKeys.includes("haiku") ? "haiku" : modelKeys[0];
  const referenceModel = MODELS[referenceModelKey];
  const referenceResults = new Map<string, ScoredResult>();

  console.log(`Running reference model: ${referenceModel.label}...`);
  const refTotal = testCases.length;
  let refDone = 0;

  const refTasks = testCases.map(
    (tc) => async () => {
      const result = await runCase(tc, referenceModel, new Map());
      refDone++;
      printProgress(refDone, refTotal, tc.id, referenceModel.label, result, debug);
      referenceResults.set(`${tc.id}::${referenceModelKey}`, result);
      return result;
    },
  );

  const refResults = await runWithSemaphore(refTasks, 3);

  // ── Phase 2: Run remaining models ────────────────────────────────────────
  const otherModelKeys = modelKeys.filter((k) => k !== referenceModelKey);
  const allResults: ScoredResult[] = [...refResults];

  for (const modelKey of otherModelKeys) {
    const model = MODELS[modelKey];
    console.log(`\nRunning ${model.label}...`);
    let done = 0;
    const total = testCases.length;

    const tasks = testCases.map(
      (tc) => async () => {
        const result = await runCase(tc, model, referenceResults);
        done++;
        printProgress(done, total, tc.id, model.label, result, debug);
        return result;
      },
    );

    const modelResults = await runWithSemaphore(tasks, 3);
    allResults.push(...modelResults);
  }

  // ── Write report ─────────────────────────────────────────────────────────
  console.log("\nWriting report...");
  const { jsonPath, mdPath } = writeReport(allResults, modelKeys);

  // ── Print summary ─────────────────────────────────────────────────────────
  const summaries = buildSummaries(allResults, modelKeys);
  printSummaryTable(summaries);

  console.log(`\nJSON report: ${jsonPath}`);
  console.log(`MD report:   ${mdPath}\n`);

  // Exit code: 0 if all models score ≥70% overall, 1 otherwise
  const allPass = summaries.every(
    (s) => s.maxPossibleScore === 0 || s.scorePercent >= 70,
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
