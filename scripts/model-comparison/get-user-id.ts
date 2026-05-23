import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

const lines = fs.readFileSync(".env.local", "utf8").split("\n");
for (const line of lines) {
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !(k in process.env)) process.env[k] = v;
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const { data, error } = await sb
  .from("generated_entries")
  .select("user_id")
  .limit(1)
  .single();

if (error) console.error("Error:", error.message);
else console.log("Your user ID:", data?.user_id);
