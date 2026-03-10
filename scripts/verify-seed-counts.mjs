#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const tables = [
  "cips",
  "key_skills",
  "descriptors",
  "procedures_catalog",
  "stages",
  "courses_catalog",
  "exams_catalog",
];

console.log("tbl\tcount");
for (const tbl of tables) {
  const { count, error } = await supabase.from(tbl).select("*", { count: "exact", head: true });
  if (error) {
    console.error(tbl, error.message);
    process.exit(1);
  }
  console.log(`${tbl}\t${count ?? 0}`);
}
