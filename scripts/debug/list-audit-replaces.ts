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

type AuditLinkPlanSkill = {
  decision?: string | null;
  key_skill_title?: string | null;
  replace_skill_title?: string | null;
  rationale?: string | null;
  confidence?: number | null;
};

type AuditResultLike = {
  audit_link_plan?: {
    mode?: string | null;
    skills?: AuditLinkPlanSkill[] | null;
  } | null;
};

type EntryMetadata = {
  audit_last_result?: AuditResultLike | null;
};

function compact(text: string | null | undefined, max = 120): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("key_skill_review_entries")
    .select("id, title, entry_type, linked_cip_number, metadata")
    .not("metadata", "is", null)
    .order("title", { ascending: true });

  if (error) {
    console.error("Failed to query key_skill_review_entries:", error.message);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  const matches = rows
    .map((row) => {
      const metadata = (row.metadata ?? null) as EntryMetadata | null;
      const audit = metadata?.audit_last_result ?? null;
      const skills = Array.isArray(audit?.audit_link_plan?.skills)
        ? audit.audit_link_plan.skills
        : [];
      const replaceIn = skills.filter((skill) => skill.decision === "replace_in");
      return {
        id: row.id as string,
        title: row.title as string,
        entryType: row.entry_type as string | null,
        cip: row.linked_cip_number as number | null,
        replaceIn,
      };
    })
    .filter((row) => row.replaceIn.length > 0);

  console.log(`Entries with saved replace recommendations: ${matches.length}`);
  console.log("");

  for (const row of matches) {
    console.log(`${row.title}`);
    console.log(`- Review entry ID: ${row.id}`);
    console.log(`- ${row.entryType ?? "unknown"} · CiP ${row.cip ?? "-"}`);
    row.replaceIn.forEach((skill, index) => {
      const confidence =
        typeof skill.confidence === "number" && skill.confidence > 0
          ? ` (${Math.round(skill.confidence * 100)}%)`
          : "";
      console.log(
        `- Replace ${index + 1}: ${skill.key_skill_title ?? "unknown"} replaces ${skill.replace_skill_title ?? "unknown"}${confidence}`,
      );
      if (skill.rationale) {
        console.log(`  ${compact(skill.rationale, 180)}`);
      }
    });
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
