#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID || process.argv[2] || null;
const CONSULTANT_ROLE_ID = 597;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!userId) {
  console.error("Provide USER_ID env var or pass user id as first arg.");
  process.exit(1);
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumericCode(value) {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const tail = text.match(/\((\d+)\)\s*$/);
  if (tail) return Number.parseInt(tail[1], 10);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function fieldPairs(extractedFields) {
  if (!extractedFields || typeof extractedFields !== "object") return [];
  return Object.entries(extractedFields).map(([key, value]) => ({
    key: normalizeKey(key),
    value: String(value ?? ""),
  }));
}

function inferFromFields(extractedFields) {
  const pairs = fieldPairs(extractedFields);

  let procedureCode = null;
  for (const pair of pairs) {
    if (!pair.key.includes("procedure")) continue;
    const parsed = parseNumericCode(pair.value);
    if (parsed !== null) {
      procedureCode = parsed;
      break;
    }
  }

  let assessorRoleCode = null;
  for (const pair of pairs) {
    if (
      pair.key.includes("assessor role") ||
      (pair.key.includes("role") && pair.key.includes("assessor"))
    ) {
      const parsed = parseNumericCode(pair.value);
      if (parsed !== null) {
        assessorRoleCode = parsed;
        break;
      }
    }
  }

  return { procedureCode, assessorRoleCode };
}

const supabase = createClient(url, key);

const { data: rows, error } = await supabase
  .from("kaizen_entries")
  .select(
    "source_entry_id, source_url, title, kaizen_date, extraction_status, extracted_fields, kaizen_procedure_id, assessor_role_id"
  )
  .eq("user_id", userId)
  .eq("detected_entry_type", "osats_summative")
  .order("synced_at", { ascending: false });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const all = rows ?? [];
const missing = [];
const strictReady = [];

for (const row of all) {
  const storedProcedure = row.kaizen_procedure_id ?? null;
  const storedRole = row.assessor_role_id ?? null;
  const inferred = inferFromFields(row.extracted_fields);

  const strictProcedure = storedProcedure ?? inferred.procedureCode;
  const strictRole = storedRole ?? inferred.assessorRoleCode;

  const ready = Number.isInteger(strictProcedure);
  const consultant = strictRole === CONSULTANT_ROLE_ID;

  if (ready) {
    strictReady.push({
      source_entry_id: row.source_entry_id,
      procedure_code: strictProcedure,
      consultant_signoff: consultant,
    });
  } else {
    missing.push({
      source_entry_id: row.source_entry_id,
      source_url: row.source_url,
      title: row.title,
      kaizen_date: row.kaizen_date,
      extraction_status: row.extraction_status,
      stored_procedure_id: storedProcedure,
      inferred_procedure_code: inferred.procedureCode,
      stored_assessor_role_id: storedRole,
      inferred_assessor_role_code: inferred.assessorRoleCode,
    });
  }
}

console.log(
  JSON.stringify(
    {
      user_id: userId,
      totals: {
        osats_summative_entries: all.length,
        strict_code_ready: strictReady.length,
        missing_procedure_code: missing.length,
        consultant_signoffs_count: strictReady.filter(
          (r) => r.consultant_signoff
        ).length,
      },
      missing_entries: missing,
    },
    null,
    2
  )
);
