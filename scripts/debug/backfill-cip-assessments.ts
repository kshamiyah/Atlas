#!/usr/bin/env npx tsx
/**
 * Promote CiP assessments stuck in kaizen_entries into cip_assessments.
 *
 * Usage:
 *   npx tsx scripts/debug/backfill-cip-assessments.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCipAssessmentEntry,
  toCipAssessmentUpsertRow,
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

  const { data: entries, error } = await supabase
    .from("kaizen_entries")
    .select(
      "source_entry_id, title, assessment_type, kaizen_date, status, linked_cip_number, extracted_fields, detected_entry_type",
    )
    .eq("user_id", userId);

  if (error) throw error;

  const candidates = (entries ?? []).filter((entry) =>
    isCipAssessmentEntry({
      assessment_type: entry.assessment_type,
      title: entry.title,
      detected_entry_type: entry.detected_entry_type,
    }),
  );

  if (candidates.length === 0) {
    console.log("No CiP assessment rows found in kaizen_entries.");
    return;
  }

  const rows = candidates
    .map((entry) =>
      toCipAssessmentUpsertRow(userId, entry.source_entry_id, {
        title: entry.title,
        kaizen_date: entry.kaizen_date,
        status: entry.status,
        linked_cip_number: entry.linked_cip_number,
        extracted_fields: entry.extracted_fields as Record<string, unknown>,
      }),
    )
    .filter((row) => row.cip_number != null || row.kaizen_entry_id);

  const { error: upsertError } = await supabase
    .from("cip_assessments")
    .upsert(rows, { onConflict: "user_id,kaizen_entry_id", ignoreDuplicates: false });

  if (upsertError) throw upsertError;

  const sourceIds = candidates
    .map((entry) => entry.source_entry_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (sourceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("kaizen_entries")
      .delete()
      .eq("user_id", userId)
      .in("source_entry_id", sourceIds);
    if (deleteError) throw deleteError;
  }

  console.log(
    JSON.stringify(
      {
        promoted: rows.length,
        removed_from_kaizen_entries: sourceIds.length,
        sample: rows.slice(0, 3).map((row) => ({
          kaizen_entry_id: row.kaizen_entry_id,
          cip_number: row.cip_number,
          status: row.status,
          es_level: row.es_level,
        })),
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
