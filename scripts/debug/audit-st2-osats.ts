import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildOsatsCountsByProcedure,
  inferOsatsStorageFields,
} from "../../lib/requirements/osats-evidence";

const lines = fs.readFileSync(".env.local", "utf8").split("\n");
for (const line of lines) {
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !(k in process.env)) process.env[k] = v;
}

const CONSULTANT = 597;

function requireUserId(): string {
  const fromArg = process.argv
    .slice(2)
    .find((a) => a.startsWith("--user-id="))
    ?.slice("--user-id=".length)
    .trim();
  const userId = fromArg || process.env.DEV_BYPASS_USER_ID?.trim() || "";
  if (!userId) {
    console.error(
      "Missing user id. Set DEV_BYPASS_USER_ID in .env.local or pass --user-id=<uuid>.",
    );
    process.exit(1);
  }
  return userId;
}

async function main() {
  const userId = requireUserId();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: catalog } = await sb
    .from("procedures_catalog")
    .select("id, name, kaizen_id, required_by_stage, osats_target")
    .not("kaizen_id", "is", null)
    .eq("required_by_stage", "ST2")
    .order("name");

  const { data: entries } = await sb
    .from("kaizen_entries")
    .select(
      "id, title, detected_entry_type, kaizen_procedure_id, assessor_role_id, extracted_fields, assessment_type, status",
    )
    .eq("user_id", userId)
    .order("synced_at", { ascending: false });

  const catalogLite = (catalog ?? []).map((p) => ({
    kaizen_id: p.kaizen_id,
    name: p.name,
  }));
  const summative = (entries ?? []).filter(
    (e) => e.detected_entry_type === "osats_summative",
  );
  const counts = buildOsatsCountsByProcedure(summative, catalogLite, CONSULTANT);

  console.log("User:", userId);
  console.log("ST2 catalog procedures:", catalog?.length ?? 0);
  console.log("Total kaizen entries:", entries?.length ?? 0);
  console.log("Summative OSATS entries:", summative.length);
  console.log(
    "OSATS formative/other:",
    (entries ?? []).filter(
      (e) =>
        /osats/i.test(String(e.assessment_type ?? e.title ?? "")) &&
        e.detected_entry_type !== "osats_summative",
    ).length,
  );
  console.log("--- ST2 procedure audit ---");

  for (const p of catalog ?? []) {
    const c = counts[p.kaizen_id] ?? { total: 0, consultant: 0 };
    const target = p.osats_target ?? 3;
    const complete = c.total >= target && c.consultant >= 1;
    const matched = summative.filter((e) => {
      const inf = inferOsatsStorageFields(e, catalogLite);
      return inf.kaizen_procedure_id === p.kaizen_id;
    });

    console.log(`\n[${complete ? "COMPLETE" : "OPEN"}] ${p.name}`);
    console.log(`  kaizen_id=${p.kaizen_id} total=${c.total}/${target} consultant=${c.consultant}`);

    if (matched.length === 0) {
      console.log("  matched summative entries: none");
      const fuzzy = (entries ?? []).filter((e) => {
        const t = String(e.title ?? "").toLowerCase();
        const words = p.name
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 4);
        return words.some((w) => t.includes(w));
      });
      if (fuzzy.length) {
        console.log("  possible title matches (not counted):");
        for (const e of fuzzy.slice(0, 8)) {
          const inf = inferOsatsStorageFields(e, catalogLite);
          console.log(
            `    - ${e.title} | detected=${e.detected_entry_type} | proc stored=${e.kaizen_procedure_id} inferred=${inf.kaizen_procedure_id} | assessor stored=${e.assessor_role_id} inferred=${inf.assessor_role_id}`,
          );
        }
      }
    } else {
      for (const e of matched) {
        const inf = inferOsatsStorageFields(e, catalogLite);
        console.log(`    - ${e.title}`);
        console.log(
          `      proc stored=${e.kaizen_procedure_id} inferred=${inf.kaizen_procedure_id} | assessor stored=${e.assessor_role_id} inferred=${inf.assessor_role_id}`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
