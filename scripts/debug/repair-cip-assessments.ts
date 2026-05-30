#!/usr/bin/env npx tsx
/**
 * Repair sparse cip_assessments rows using curriculum catalog names and ES signals.
 *
 * Usage:
 *   npx tsx scripts/debug/repair-cip-assessments.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveCipAssessmentDisplayStatus,
  type CipAssessmentRecord,
} from "../../lib/kaizen/cip-assessment";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    env[line.slice(0, idx)] = line.slice(idx + 1).replace(/^"|"$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const userId = env.DEV_BYPASS_USER_ID;
  if (!userId) throw new Error("DEV_BYPASS_USER_ID missing in .env.local");

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const [{ data: assessments, error }, { data: cips, error: cipsError }] = await Promise.all([
    supabase
      .from("cip_assessments")
      .select(
        "id, kaizen_entry_id, cip_number, cip_kaizen_id, cip_name, date, trainee_level, trainee_comments, es_agrees, es_level, es_comments, status, updated_at",
      )
      .eq("user_id", userId),
    supabase.from("cips").select("number, title").order("number"),
  ]);

  if (error) throw error;
  if (cipsError) throw cipsError;

  const catalog = new Map((cips ?? []).map((cip) => [cip.number as number, cip.title as string]));
  const updates: Array<Record<string, unknown>> = [];

  for (const row of (assessments ?? []) as CipAssessmentRecord[]) {
    const nextStatus = resolveCipAssessmentDisplayStatus(row);
    const nextName =
      row.cip_name?.trim() ||
      (row.cip_number != null ? catalog.get(row.cip_number) ?? null : null);

    const patch: Record<string, unknown> = { id: row.id, updated_at: new Date().toISOString() };
    let changed = false;

    if (nextName && nextName !== row.cip_name) {
      patch.cip_name = nextName;
      changed = true;
    }

    if (nextStatus !== row.status) {
      patch.status = nextStatus;
      changed = true;
    }

    if (changed) updates.push(patch);
  }

  if (updates.length === 0) {
    console.log("No CiP assessment rows needed repair.");
    return;
  }

  for (const patch of updates) {
    const { id, ...fields } = patch;
    const { error: updateError } = await supabase
      .from("cip_assessments")
      .update(fields)
      .eq("id", id as string);
    if (updateError) throw updateError;
  }

  console.log(
    JSON.stringify(
      {
        repaired: updates.length,
        sample: updates.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
