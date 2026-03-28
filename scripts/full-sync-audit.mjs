#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID || process.argv[2] || null;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!userId) {
  console.error("Provide USER_ID env var or pass user id as first arg.");
  process.exit(1);
}

const supabase = createClient(url, key);

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCode(value) {
  const t = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const tail = t.match(/\((\d+)\)\s*$/);
  if (tail) return Number.parseInt(tail[1], 10);
  if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
  return null;
}

function inferStrictCodes(entry) {
  let pid = entry.kaizen_procedure_id ?? null;
  let rid = entry.assessor_role_id ?? null;
  const fields = entry.extracted_fields;

  if ((pid == null || rid == null) && fields && typeof fields === "object") {
    for (const [k, v] of Object.entries(fields)) {
      const nk = normalizeKey(k);
      if (pid == null && nk.includes("procedure")) {
        const p = parseCode(v);
        if (p != null) pid = p;
      }
      if (
        rid == null &&
        (nk.includes("assessor role") ||
          (nk.includes("assessor") && nk.includes("role")))
      ) {
        const r = parseCode(v);
        if (r != null) rid = r;
      }
    }
  }

  return { pid, rid };
}

function checkResult(id, title, status, detail, meta = {}) {
  return { id, title, status, detail, ...meta };
}

function ageHours(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 36e5;
}

const [
  syncRes,
  entriesRes,
  cipRes,
  profileRes,
  reviewRes,
  suggRes,
  coverageRes,
] = await Promise.all([
  supabase
    .from("kaizen_sync_log")
    .select("sync_type,synced_at,data_hash")
    .eq("user_id", userId)
    .order("synced_at", { ascending: false })
    .limit(400),
  supabase
    .from("kaizen_entries")
    .select(
      "id,source_entry_id,source_url,title,assessment_type,detected_entry_type,extraction_status,kaizen_procedure_id,assessor_role_id,extracted_fields,synced_at"
    )
    .eq("user_id", userId),
  supabase
    .from("kaizen_cip_progress")
    .select("id,cip_number,percentage,status_colour,synced_at")
    .eq("user_id", userId),
  supabase
    .from("profiles")
    .select("id,current_stage_id,current_grade,arcp_date,working_percent,updated_at")
    .eq("id", userId)
    .maybeSingle(),
  supabase
    .from("key_skill_review_entries")
    .select("id,metadata,updated_at,created_at")
    .eq("user_id", userId),
  supabase
    .from("key_skill_review_suggestions")
    .select("id,status,review_entry_id,suggestion_source,updated_at")
    .eq("user_id", userId),
  supabase
    .from("key_skill_descriptor_coverage")
    .select("id,covered,confidence,review_entry_id,key_skill_id")
    .eq("user_id", userId),
]);

const responses = [
  syncRes,
  entriesRes,
  cipRes,
  profileRes,
  reviewRes,
  suggRes,
  coverageRes,
];
const failed = responses.find((r) => r.error);
if (failed) {
  console.error("Query failed:", failed.error.message);
  process.exit(1);
}

const syncRows = syncRes.data ?? [];
const entries = entriesRes.data ?? [];
const cipRows = cipRes.data ?? [];
const profile = profileRes.data ?? null;
const reviewRows = reviewRes.data ?? [];
const suggestionRows = suggRes.data ?? [];
const coverageRows = coverageRes.data ?? [];

const latestByType = {};
for (const row of syncRows) {
  if (!latestByType[row.sync_type]) {
    latestByType[row.sync_type] = {
      synced_at: row.synced_at,
      data_hash: row.data_hash,
    };
  }
}

const reviewSourceIds = new Set(
  reviewRows
    .map((r) => String(r?.metadata?.source_entry_id ?? ""))
    .filter(Boolean)
);
const entrySourceIds = new Set(
  entries.map((e) => String(e.source_entry_id ?? "")).filter(Boolean)
);
let overlap = 0;
for (const sid of entrySourceIds) if (reviewSourceIds.has(sid)) overlap += 1;

const missingReviewEntries = entries.filter(
  (e) => !reviewSourceIds.has(String(e.source_entry_id ?? ""))
);
const missingReviewTo1Only =
  missingReviewEntries.length > 0 &&
  missingReviewEntries.every((e) =>
    /\bto1\b|team observation|self to1/i.test(
      `${e.assessment_type ?? ""} ${e.title ?? ""}`
    )
  );

const nullDetected = entries.filter((e) => !e.detected_entry_type);
const nullDetectedSupervisorOnly =
  nullDetected.length > 0 &&
  nullDetected.every((e) =>
    /supervisor meeting/i.test(
      `${e.assessment_type ?? ""} ${e.title ?? ""}`
    )
  );

const osats = entries.filter((e) => e.detected_entry_type === "osats_summative");
const osatsStrict = osats.map((e) => ({
  source_entry_id: e.source_entry_id,
  title: e.title,
  ...inferStrictCodes(e),
}));
const osatsMissingProcedure = osatsStrict.filter((e) => !Number.isInteger(e.pid));

const checks = [];

checks.push(
  checkResult(
    "entries_present",
    "Entries Table Populated",
    entries.length > 0 ? "PASS" : "FAIL",
    `${entries.length} kaizen_entries rows`
  )
);

checks.push(
  checkResult(
    "entries_source_keys",
    "Entries Source Keys Complete",
    entries.every((e) => e.source_entry_id && e.source_url) ? "PASS" : "FAIL",
    `missing source_entry_id: ${
      entries.filter((e) => !e.source_entry_id).length
    }, missing source_url: ${entries.filter((e) => !e.source_url).length}`
  )
);

const latestEntriesHours = ageHours(latestByType.entries?.synced_at ?? null);
checks.push(
  checkResult(
    "entries_freshness",
    "Entries Sync Freshness",
    latestEntriesHours !== null && latestEntriesHours < 72 ? "PASS" : "WARN",
    `latest entries sync: ${latestByType.entries?.synced_at ?? "none"}`
  )
);

checks.push(
  checkResult(
    "osats_strict_codes",
    "OSATS Strict Code Integrity",
    osatsMissingProcedure.length === 0 ? "PASS" : "FAIL",
    `osats rows: ${osats.length}, missing strict procedure code: ${osatsMissingProcedure.length}`,
    { examples: osatsMissingProcedure.slice(0, 5) }
  )
);

const latestDashboard = latestByType.dashboard ?? null;
const dashboardEmpty = latestDashboard?.data_hash === "[]";
checks.push(
  checkResult(
    "dashboard_payload",
    "Dashboard Sync Payload Non-Empty",
    dashboardEmpty ? "FAIL" : "PASS",
    `latest dashboard data_hash: ${latestDashboard?.data_hash ?? "none"}`
  )
);

checks.push(
  checkResult(
    "cip_table_population",
    "CiP Progress Table Population",
    cipRows.length >= 14 ? "PASS" : "FAIL",
    `kaizen_cip_progress rows: ${cipRows.length}`
  )
);

checks.push(
  checkResult(
    "review_linkage",
    "Entry → Review Linkage",
    missingReviewEntries.length === 0 || missingReviewTo1Only ? "PASS" : "WARN",
    `overlap: ${overlap}/${entrySourceIds.size} (${entrySourceIds.size ? ((overlap / entrySourceIds.size) * 100).toFixed(1) : "0"}%)`,
    {
      missing_count: missingReviewEntries.length,
      missing_all_to1_or_self_to1: missingReviewTo1Only,
      missing_examples: missingReviewEntries.slice(0, 5).map((e) => ({
        source_entry_id: e.source_entry_id,
        title: e.title,
        assessment_type: e.assessment_type,
      })),
    }
  )
);

checks.push(
  checkResult(
    "detected_type_nulls",
    "Detected Entry Type Coverage",
    nullDetected.length === 0 || nullDetectedSupervisorOnly ? "PASS" : "WARN",
    `null detected_entry_type rows: ${nullDetected.length}`,
    {
      null_rows_are_supervisor_meetings_only: nullDetectedSupervisorOnly,
      examples: nullDetected.slice(0, 5).map((e) => ({
        source_entry_id: e.source_entry_id,
        title: e.title,
        assessment_type: e.assessment_type,
      })),
    }
  )
);

checks.push(
  checkResult(
    "profile_sync_observability",
    "Profile Sync Logging",
    syncRows.some((r) => r.sync_type === "profile") ? "PASS" : "WARN",
    `profile sync_log rows: ${syncRows.filter((r) => r.sync_type === "profile").length} (profile data still present)`
  )
);

const failCount = checks.filter((c) => c.status === "FAIL").length;
const warnCount = checks.filter((c) => c.status === "WARN").length;

console.log(
  JSON.stringify(
    {
      user_id: userId,
      generated_at: new Date().toISOString(),
      overall: failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS",
      summary: {
        checks_total: checks.length,
        pass: checks.filter((c) => c.status === "PASS").length,
        warn: warnCount,
        fail: failCount,
      },
      latest_sync_by_type: latestByType,
      data_counts: {
        kaizen_entries: entries.length,
        kaizen_cip_progress: cipRows.length,
        key_skill_review_entries: reviewRows.length,
        key_skill_review_suggestions: suggestionRows.length,
        descriptor_coverage_rows: coverageRows.length,
      },
      profile_snapshot: profile,
      checks,
    },
    null,
    2
  )
);
