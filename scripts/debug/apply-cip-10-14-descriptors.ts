import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

type Row = {
  id: string;
  key_skill_id: string;
  text: string;
  sort_order: number;
};

function parseMigrationSql(sql: string): Row[] {
  const rows: Row[] = [];
  const lineRe =
    /\('([^']+)',\s*'([^']+)',\s*'((?:''|[^'])*)',\s*(\d+)\)/g;

  for (const match of sql.matchAll(lineRe)) {
    rows.push({
      id: match[1],
      key_skill_id: match[2],
      text: match[3].replace(/''/g, "'"),
      sort_order: Number.parseInt(match[4], 10),
    });
  }

  return rows;
}

async function main() {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/0028_seed_cip_10_14_descriptors.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");
  const rows = parseMigrationSql(sql);

  if (rows.length !== 170) {
    throw new Error(`Expected 170 descriptor rows, parsed ${rows.length}`);
  }

  const supabase = createServiceRoleSupabaseClient();

  const { count: beforeCount } = await supabase
    .from("descriptors")
    .select("id", { count: "exact", head: true });

  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from("descriptors")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      throw new Error(`Insert failed at batch ${i / batchSize + 1}: ${error.message}`);
    }
  }

  const { count: afterCount } = await supabase
    .from("descriptors")
    .select("id", { count: "exact", head: true });

  const { data: cip10Sample } = await supabase
    .from("key_skills")
    .select("legacy_id, title, descriptors ( text, sort_order )")
    .eq("legacy_id", "CiP_10_KS05")
    .maybeSingle();

  console.log("Descriptors before:", beforeCount);
  console.log("Descriptors after:", afterCount);
  console.log("Inserted (approx):", (afterCount ?? 0) - (beforeCount ?? 0));
  console.log(
    "CiP_10_KS05 descriptor count:",
    Array.isArray(cip10Sample?.descriptors) ? cip10Sample.descriptors.length : 0,
  );
}

void main();
