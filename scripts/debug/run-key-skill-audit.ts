import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = ".env.local";
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function compact(text: string | null | undefined, max = 140): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function main() {
  loadEnvLocal();

  const title = getArg("--title");
  const entryIdArg = getArg("--entry-id");
  const baseUrl = getArg("--base-url") ?? "http://localhost:3001";
  const useLlm = getArg("--use-llm") !== "false";

  if (!title && !entryIdArg) {
    console.error('Usage: npx tsx scripts/debug/run-key-skill-audit.ts --title "..." | --entry-id <id> [--base-url http://localhost:3001] [--use-llm false]');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let query = supabase
    .from("key_skill_review_entries")
    .select("id, user_id, title, entry_type, linked_cip_number")
    .limit(5);

  if (entryIdArg) {
    query = query.eq("id", entryIdArg);
  } else if (title) {
    query = query.ilike("title", `%${title}%`);
  }

  const { data: matches, error: matchError } = await query;

  if (matchError) {
    console.error("Failed to query review entries:", matchError.message);
    process.exit(1);
  }

  if (!matches || matches.length === 0) {
    console.error("No matching review entry found.");
    process.exit(1);
  }

  if (matches.length > 1) {
    console.log("Multiple matches found:");
    matches.forEach((row) => {
      console.log(`- ${row.id} | ${row.linked_cip_number} | ${row.entry_type} | ${row.title}`);
    });
    console.log("Re-run with --entry-id using one of the IDs above.");
    process.exit(1);
  }

  const match = matches[0];

  const response = await fetch(`${baseUrl}/api/key-skill-review/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-debug-user-id": String(match.user_id),
    },
    body: JSON.stringify({
      entry_ids: [String(match.id)],
      use_llm: useLlm,
      force_full_refresh: true,
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json) {
    console.error("Audit request failed:", response.status, json ?? "(no json)");
    process.exit(1);
  }

  const entry = Array.isArray(json.entries) ? json.entries[0] : null;
  if (!entry) {
    console.error("Audit completed but no entry result was returned.");
    process.exit(1);
  }

  console.log(`Entry: ${match.title}`);
  console.log(`Review entry ID: ${match.id}`);
  console.log(`User ID: ${match.user_id}`);
  console.log("");

  if (entry.audit_link_plan) {
    console.log("Rebalance plan:");
    console.log(`- Summary: ${entry.audit_link_plan.summary}`);
    console.log(
      `- Target ${entry.audit_link_plan.effective_target} | Current ${entry.audit_link_plan.current_linked_count}`,
    );
    console.log(
      `- Counts: raw ${entry.raw_linked_skill_count ?? "-"} | resolved ${entry.current_linked_skill_count ?? "-"} | effective ${entry.effective_linked_skill_count ?? "-"}`,
    );

    const removals = entry.audit_link_plan.skills.filter((skill: { decision: string }) => skill.decision === "remove");
    const replacementsOut = entry.audit_link_plan.skills.filter((skill: { decision: string }) => skill.decision === "replace_out");
    const replacementsIn = entry.audit_link_plan.skills.filter((skill: { decision: string }) => skill.decision === "replace_in");
    const ignored = entry.audit_link_plan.skills.filter((skill: { decision: string }) => skill.decision === "ignore_pending");

    if (removals.length > 0) {
      console.log("- Remove:");
      removals.forEach((skill: { key_skill_title: string; confidence: number | null; rationale: string }) => {
        console.log(`  • ${skill.key_skill_title}${typeof skill.confidence === "number" ? ` (${Math.round(skill.confidence * 100)}%)` : ""}`);
        console.log(`    ${compact(skill.rationale, 180)}`);
      });
    }

    if (replacementsOut.length > 0) {
      console.log("- Replace out:");
      replacementsOut.forEach((skill: { key_skill_title: string; replace_skill_title?: string | null; rationale: string }) => {
        console.log(`  • ${skill.key_skill_title} -> ${skill.replace_skill_title ?? "unknown"}`);
        console.log(`    ${compact(skill.rationale, 180)}`);
      });
    }

    if (replacementsIn.length > 0) {
      console.log("- Replace in:");
      replacementsIn.forEach((skill: { key_skill_title: string; replace_skill_title?: string | null; rationale: string }) => {
        console.log(`  • ${skill.key_skill_title} replaces ${skill.replace_skill_title ?? "unknown"}`);
        console.log(`    ${compact(skill.rationale, 180)}`);
      });
    }

    if (ignored.length > 0) {
      console.log("- Ignore pending:");
      ignored.forEach((skill: { key_skill_title: string }) => {
        console.log(`  • ${skill.key_skill_title}`);
      });
    }

    if (Array.isArray(entry.unresolved_linked_skills) && entry.unresolved_linked_skills.length > 0) {
      console.log("- Unresolved current Kaizen links:");
      entry.unresolved_linked_skills.forEach((skill: string) => {
        console.log(`  • ${skill}`);
      });
    }
  } else {
    console.log("No rebalance plan returned.");
  }

  if (Array.isArray(entry.audit_findings) && entry.audit_findings.length > 0) {
    console.log("");
    console.log("Findings:");
    entry.audit_findings.forEach((finding: { type: string; rationale?: string; key_skill_title?: string; confidence?: number; overlinked_by?: number; effective_target?: number }) => {
      if (finding.type === "overlinked") {
        console.log(`- Overlinked by ${finding.overlinked_by} (target ${finding.effective_target})`);
        return;
      }
      const confidenceSuffix =
        typeof finding.confidence === "number" && finding.confidence > 0
          ? ` (${Math.round(finding.confidence * 100)}%)`
          : "";
      console.log(`- ${finding.type}: ${finding.key_skill_title ?? finding.rationale ?? ""}${confidenceSuffix}`);
    });
  }

  if (json.summary?.llm_usage) {
    console.log("");
    console.log("LLM usage:");
    console.log(
      `- ${json.summary.llm_usage.model} | ${json.summary.llm_usage.api_calls} calls | ${json.summary.llm_usage.input_tokens} in | ${json.summary.llm_usage.output_tokens} out | $${json.summary.llm_usage.estimated_cost_usd}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
