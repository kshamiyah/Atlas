import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  createSupabaseClientWithToken,
  getUserFromBearerToken,
} from "@/lib/supabase/api-client";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PushQueueActionType,
  PushQueueEntry,
  PushQueueResponse,
  PushQueueStatus,
  PushQueueStatusPatchBody,
  PushQueueSummary,
} from "@/lib/types/key-skill-review-api";

type ConfirmedSuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
};

type PushQueueRow = {
  id: string;
  suggestion_id: string;
  review_entry_id: string;
  key_skill_id: string;
  status: PushQueueStatus;
  attempt_count: number | null;
  last_error: string | null;
  updated_at: string;
  synced_at: string | null;
  action_type: PushQueueActionType;
  group_id: string | null;
  sequence_index: number | null;
  kaizen_skill_id: string | null;
  payload: Record<string, unknown> | null;
};

type ReviewEntryRow = {
  id: string;
  title: string;
  event_date: string | null;
  metadata: Record<string, unknown> | null;
};

type KeySkillRow = {
  id: string;
  title: string;
  cip_id: string | null;
  kaizen_ids: string[] | null;
};

type CipRow = {
  id: string;
  number: number;
};

type KaizenEntryRow = {
  source_entry_id: string | null;
  source_url: string | null;
  synced_at: string | null;
};

type PushQueueGroup = {
  review_entry_id: string;
  title: string;
  date: string;
  entry_edit_url: string | null;
  source_entry_id: string | null;
  suggestion_ids: string[];
  skills: PushQueueEntry["skills"];
  statuses: PushQueueStatus[];
  attempt_count: number;
  last_error: string | null;
  updated_at: string;
  latest_queue_synced_at: string | null;
};

const STATUS_ORDER: Record<PushQueueStatus, number> = {
  running: 0,
  failed: 1,
  pending: 2,
  synced: 3,
};

const VALID_STATUSES = new Set<PushQueueStatus>([
  "pending",
  "running",
  "synced",
  "failed",
]);

const DESCRIPTOR_ONLY_NON_SYNC_KEY_SKILLS = new Set<string>([
  "4::Appreciates the importance of stakeholders in quality improvement work",
]);

function isDescriptorOnlyNonSyncKeySkill(cipNumber: number, title: string): boolean {
  return DESCRIPTOR_ONLY_NON_SYNC_KEY_SKILLS.has(`${cipNumber}::${title}`);
}

function emptySummary(): PushQueueSummary {
  return { total: 0, pending: 0, running: 0, synced: 0, failed: 0 };
}

function emptyResponse(queueAvailable: boolean): PushQueueResponse {
  return {
    queue_available: queueAvailable,
    summary: emptySummary(),
    entries: [],
  };
}

function readMetaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean || null;
}

function toEditUrl(sourceUrl: string | null, sourceEntryId: string | null): string | null {
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (/\/edit(?:\?|$)/i.test(parsed.pathname)) {
        return parsed.toString();
      }

      const path = parsed.pathname.replace(/\/+$/, "");
      if (
        /^\/assessment-type\/\d+$/i.test(path) ||
        /^\/log-entry\/\d+$/i.test(path) ||
        /^\/node\/\d+$/i.test(path)
      ) {
        parsed.pathname = `${path}/edit`;
        return parsed.toString();
      }
    } catch {
      // ignore invalid URL and continue with sourceEntryId fallback.
    }
  }

  if (sourceEntryId && /^\d+$/.test(sourceEntryId)) {
    return `https://training.rcog.org.uk/node/${sourceEntryId}/edit`;
  }

  return null;
}

function buildDisplayValue(
  cipNumber: number,
  keySkillTitle: string,
  kaizenId: string | null,
): string {
  void cipNumber;
  // Kaizen token inputs are more reliable with "Title (ID)" values.
  // Prefixing with "CiP N:" can prevent some forms from resolving the token.
  if (kaizenId) {
    return `${keySkillTitle} (${kaizenId})`;
  }
  return `${keySkillTitle}`;
}

function aggregateStatus(statuses: PushQueueStatus[]): PushQueueStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.length > 0 && statuses.every((status) => status === "synced")) {
    return "synced";
  }
  return "pending";
}

function isQueueTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    haystack.includes("key_skill_review_push_queue") &&
    (haystack.includes("does not exist") || haystack.includes("could not find"))
  );
}

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; details?: string };
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    haystack.includes("does not exist") &&
    haystack.includes(columnName.toLowerCase())
  );
}

function isMissingPushQueueActionColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  if (err.code !== "42703") return false;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return [
    "action_type",
    "group_id",
    "sequence_index",
    "kaizen_skill_id",
    "payload",
  ].some((column) => haystack.includes(column));
}

async function getAuthFromRequest(request: Request): Promise<
  | { userId: string; supabase: SupabaseClient }
  | { response: NextResponse }
> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await getUserFromBearerToken(authHeader);
    if ("error" in auth) {
      return { response: NextResponse.json({ error: auth.error }, { status: 401 }) };
    }
    return {
      userId: auth.user.id,
      supabase: createSupabaseClientWithToken(auth.accessToken),
    };
  }

  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: user.id, supabase };
}

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && !(bypassAuth && !user)) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!user && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user && bypassAuth) {
    return NextResponse.json(emptyResponse(true));
  }
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: confirmedRows, error: confirmedError } = await supabase
    .from("key_skill_review_suggestions")
    .select("id, review_entry_id, key_skill_id")
    .eq("user_id", userId)
    .eq("suggestion_source", "cross_cip")
    .eq("status", "confirmed");

  if (confirmedError) {
    return NextResponse.json(
      { error: "Failed to load confirmed cross-CiP suggestions: " + confirmedError.message },
      { status: 500 },
    );
  }

  const confirmed = (confirmedRows ?? []).map((row): ConfirmedSuggestionRow => ({
    id: String(row.id),
    review_entry_id: String(row.review_entry_id),
    key_skill_id: String(row.key_skill_id),
  }));

  if (confirmed.length > 0) {
    const upsertPayload = confirmed.map((row) => ({
      user_id: userId,
      suggestion_id: row.id,
      review_entry_id: row.review_entry_id,
      key_skill_id: row.key_skill_id,
      status: "pending",
    }));

    const { error: upsertError } = await supabase
      .from("key_skill_review_push_queue")
      .upsert(upsertPayload, {
        onConflict: "suggestion_id",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      if (isQueueTableMissing(upsertError)) {
        return NextResponse.json(emptyResponse(false));
      }
      return NextResponse.json(
        { error: "Failed to queue confirmed suggestions: " + upsertError.message },
        { status: 500 },
      );
    }
  }

  let queueRows: Array<Record<string, unknown>> | null | undefined;
  let queueError: { code?: string; message?: string } | null | undefined;
  const queueWithActionColumns = await supabase
    .from("key_skill_review_push_queue")
    .select(
      "id, suggestion_id, review_entry_id, key_skill_id, status, attempt_count, last_error, updated_at, synced_at, action_type, group_id, sequence_index, kaizen_skill_id, payload",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (isMissingPushQueueActionColumnsError(queueWithActionColumns.error)) {
    const fallbackQueue = await supabase
      .from("key_skill_review_push_queue")
      .select(
        "id, suggestion_id, review_entry_id, key_skill_id, status, attempt_count, last_error, updated_at, synced_at",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    queueRows = fallbackQueue.data as Array<Record<string, unknown>> | null;
    queueError = fallbackQueue.error as { code?: string; message?: string } | null;
  } else {
    queueRows = queueWithActionColumns.data as Array<Record<string, unknown>> | null;
    queueError = queueWithActionColumns.error as { code?: string; message?: string } | null;
  }

  if (queueError) {
    if (isQueueTableMissing(queueError)) {
      return NextResponse.json(emptyResponse(false));
    }
    return NextResponse.json(
      { error: "Failed to load push queue: " + queueError.message },
      { status: 500 },
    );
  }

  const confirmedSet = new Set(confirmed.map((row) => row.id));
  const queue = (queueRows ?? [])
    .map((row): PushQueueRow => ({
      id: String(row.id),
      suggestion_id: String(row.suggestion_id),
      review_entry_id: String(row.review_entry_id),
      key_skill_id: String(row.key_skill_id),
      status: row.status as PushQueueStatus,
      attempt_count: row.attempt_count != null ? Number(row.attempt_count) : 0,
      last_error: typeof row.last_error === "string" ? row.last_error : null,
      updated_at: String(row.updated_at ?? new Date().toISOString()),
      synced_at:
        typeof row.synced_at === "string" && row.synced_at.trim()
          ? row.synced_at
          : null,
      action_type:
        row.action_type === "remove" ||
        row.action_type === "replace_remove" ||
        row.action_type === "replace_add"
          ? row.action_type
          : "add",
      group_id: typeof row.group_id === "string" && row.group_id.trim() ? row.group_id : null,
      sequence_index:
        typeof row.sequence_index === "number" && Number.isInteger(row.sequence_index)
          ? row.sequence_index
          : row.sequence_index != null && Number.isFinite(Number(row.sequence_index))
            ? Number(row.sequence_index)
            : null,
      kaizen_skill_id:
        typeof row.kaizen_skill_id === "string" && row.kaizen_skill_id.trim()
          ? row.kaizen_skill_id
          : null,
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
    }))
    .filter(
      (row) =>
        confirmedSet.has(row.suggestion_id) ||
        row.action_type === "remove" ||
        row.action_type === "replace_remove",
    );

  if (queue.length === 0) {
    return NextResponse.json(emptyResponse(true));
  }

  const reviewEntryIds = Array.from(new Set(queue.map((row) => row.review_entry_id)));
  const keySkillIds = Array.from(new Set(queue.map((row) => row.key_skill_id)));

  const [{ data: reviewEntries, error: reviewEntriesError }, { data: keySkills, error: keySkillsError }] =
    await Promise.all([
      supabase
        .from("key_skill_review_entries")
        .select("id, title, event_date, metadata")
        .eq("user_id", userId)
        .in("id", reviewEntryIds),
      supabase.from("key_skills").select("id, title, cip_id, kaizen_ids").in("id", keySkillIds),
    ]);

  if (reviewEntriesError) {
    return NextResponse.json(
      { error: "Failed to load review entries: " + reviewEntriesError.message },
      { status: 500 },
    );
  }
  if (keySkillsError) {
    return NextResponse.json(
      { error: "Failed to load key skills: " + keySkillsError.message },
      { status: 500 },
    );
  }

  const typedReviewEntries = (reviewEntries ?? []).map((row): ReviewEntryRow => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    event_date: row.event_date ? String(row.event_date) : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
  }));

  const typedKeySkills = (keySkills ?? []).map((row): KeySkillRow => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    cip_id: row.cip_id ? String(row.cip_id) : null,
    kaizen_ids: Array.isArray(row.kaizen_ids)
      ? row.kaizen_ids.map((value) => String(value))
      : null,
  }));

  const cipIds = Array.from(
    new Set(
      typedKeySkills
        .map((keySkill) => keySkill.cip_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const cipNumberById = new Map<string, number>();
  if (cipIds.length > 0) {
    const { data: cips, error: cipsError } = await supabase
      .from("cips")
      .select("id, number")
      .in("id", cipIds);
    if (cipsError) {
      return NextResponse.json(
        { error: "Failed to load CiP numbers: " + cipsError.message },
        { status: 500 },
      );
    }
    (cips ?? []).forEach((row) => {
      const cip = row as CipRow;
      cipNumberById.set(String(cip.id), Number(cip.number ?? 0));
    });
  }

  const sourceEntryIds = Array.from(
    new Set(
      typedReviewEntries
        .map((entry) => readMetaString(entry.metadata, "source_entry_id"))
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const kaizenSourceUrlBySourceId = new Map<string, string>();
  const kaizenSyncedAtBySourceId = new Map<string, string | null>();
  if (sourceEntryIds.length > 0) {
    const withUrl = await supabase
      .from("kaizen_entries")
      .select("source_entry_id, source_url, synced_at")
      .eq("user_id", userId)
      .in("source_entry_id", sourceEntryIds);

    let kaizenRows: unknown[] | null = withUrl.data ?? null;
    let kaizenRowsError = withUrl.error;

    if (kaizenRowsError && isMissingColumn(kaizenRowsError, "source_url")) {
      const fallback = await supabase
        .from("kaizen_entries")
        .select("source_entry_id")
        .eq("user_id", userId)
        .in("source_entry_id", sourceEntryIds);
      kaizenRows = fallback.data ?? null;
      kaizenRowsError = fallback.error;
    }

    if (kaizenRowsError) {
      return NextResponse.json(
        { error: "Failed to load ePortfolio entry URLs: " + kaizenRowsError.message },
        { status: 500 },
      );
    }

    (kaizenRows ?? []).forEach((row) => {
      const typed = row as KaizenEntryRow;
      if (typeof typed.source_entry_id === "string" && typed.source_entry_id) {
        if (typeof typed.source_url === "string" && typed.source_url) {
          kaizenSourceUrlBySourceId.set(typed.source_entry_id, typed.source_url);
        }
        kaizenSyncedAtBySourceId.set(
          typed.source_entry_id,
          typeof typed.synced_at === "string" && typed.synced_at ? typed.synced_at : null,
        );
      }
    });
  }

  const entryById = new Map(typedReviewEntries.map((entry) => [entry.id, entry]));
  const keySkillById = new Map(typedKeySkills.map((keySkill) => [keySkill.id, keySkill]));

  const grouped = new Map<string, PushQueueGroup>();
  const descriptorOnlySuggestionIds = new Set<string>();

  for (const row of queue) {
    const entry = entryById.get(row.review_entry_id);
    const keySkill = keySkillById.get(row.key_skill_id);

    const metadata = entry?.metadata ?? null;
    const sourceEntryId = readMetaString(metadata, "source_entry_id");
    const sourceUrl =
      readMetaString(metadata, "source_url") ??
      (sourceEntryId ? kaizenSourceUrlBySourceId.get(sourceEntryId) ?? null : null);
    const entryEditUrl = toEditUrl(sourceUrl, sourceEntryId);

    const cipNumber = keySkill?.cip_id ? cipNumberById.get(keySkill.cip_id) ?? 0 : 0;
    const kaizenIds = Array.isArray(keySkill?.kaizen_ids)
      ? keySkill.kaizen_ids
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0)
      : [];
    const kaizenId = kaizenIds.length > 0 ? kaizenIds[0] : null;
    const keySkillTitle = keySkill?.title ?? "";
    const displayValue = buildDisplayValue(cipNumber, keySkillTitle, kaizenId);

    if (isDescriptorOnlyNonSyncKeySkill(cipNumber, keySkillTitle)) {
      descriptorOnlySuggestionIds.add(row.suggestion_id);
      continue;
    }

    const existing = grouped.get(row.review_entry_id);
    if (existing) {
      existing.suggestion_ids.push(row.suggestion_id);
      existing.skills.push({
        suggestion_id: row.suggestion_id,
        key_skill_id: row.key_skill_id,
        key_skill_title: keySkillTitle,
        cip_number: cipNumber,
        kaizen_id: kaizenId,
        kaizen_ids: kaizenIds,
        display_value: displayValue,
        action_type: row.action_type,
        group_id: row.group_id,
        sequence_index: row.sequence_index,
        kaizen_skill_id: row.kaizen_skill_id,
        payload: row.payload,
      });
      existing.statuses.push(row.status);
      existing.attempt_count = Math.max(existing.attempt_count, row.attempt_count ?? 0);
      if (!existing.last_error && row.last_error) {
        existing.last_error = row.last_error;
      }
      if (row.updated_at > existing.updated_at) {
        existing.updated_at = row.updated_at;
      }
      if (!existing.entry_edit_url && entryEditUrl) {
        existing.entry_edit_url = entryEditUrl;
      }
      if (
        row.status === "synced" &&
        row.synced_at &&
        (!existing.latest_queue_synced_at || row.synced_at > existing.latest_queue_synced_at)
      ) {
        existing.latest_queue_synced_at = row.synced_at;
      }
      continue;
    }

    grouped.set(row.review_entry_id, {
      review_entry_id: row.review_entry_id,
      title: entry?.title ?? "Untitled entry",
      date: entry?.event_date ?? "",
      entry_edit_url: entryEditUrl,
      source_entry_id: sourceEntryId,
      suggestion_ids: [row.suggestion_id],
      skills: [
        {
          suggestion_id: row.suggestion_id,
          key_skill_id: row.key_skill_id,
          key_skill_title: keySkillTitle,
          cip_number: cipNumber,
          kaizen_id: kaizenId,
          kaizen_ids: kaizenIds,
          display_value: displayValue,
          action_type: row.action_type,
          group_id: row.group_id,
          sequence_index: row.sequence_index,
          kaizen_skill_id: row.kaizen_skill_id,
          payload: row.payload,
        },
      ],
      statuses: [row.status],
      attempt_count: row.attempt_count ?? 0,
      last_error: row.last_error,
      updated_at: row.updated_at,
      latest_queue_synced_at: row.status === "synced" ? row.synced_at : null,
    });
  }

  if (descriptorOnlySuggestionIds.size > 0) {
    const syncedAt = new Date().toISOString();
    for (const suggestionId of descriptorOnlySuggestionIds) {
      const { error: syncSkipError } = await supabase
        .from("key_skill_review_push_queue")
        .update({
          status: "synced",
          synced_at: syncedAt,
          updated_at: syncedAt,
          last_error: null,
        })
        .eq("user_id", userId)
        .eq("suggestion_id", suggestionId);

      if (syncSkipError && !isQueueTableMissing(syncSkipError)) {
        return NextResponse.json(
          { error: "Failed to mark descriptor-only queue rows as synced: " + syncSkipError.message },
          { status: 500 },
        );
      }
    }
  }

  const entries: PushQueueEntry[] = Array.from(grouped.values())
    .map((group) => {
      const status = aggregateStatus(group.statuses);
      const snapshotSyncedAt = group.source_entry_id
        ? kaizenSyncedAtBySourceId.get(group.source_entry_id) ?? null
        : null;
      const needsSnapshotRefresh =
        status === "synced" &&
        !!group.latest_queue_synced_at &&
        (!snapshotSyncedAt || snapshotSyncedAt < group.latest_queue_synced_at);

      return {
        review_entry_id: group.review_entry_id,
        title: group.title,
        date: group.date,
        entry_edit_url: group.entry_edit_url,
        status,
        attempt_count: group.attempt_count,
        last_error: group.last_error,
        updated_at: group.updated_at,
        latest_queue_synced_at: group.latest_queue_synced_at,
        snapshot_synced_at: snapshotSyncedAt,
        needs_snapshot_refresh: needsSnapshotRefresh,
        suggestion_ids: group.suggestion_ids,
        skills: group.skills,
      };
    })
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      return b.updated_at.localeCompare(a.updated_at);
    });

  const summary = emptySummary();
  for (const entry of entries) {
    summary.total += 1;
    summary[entry.status] += 1;
  }

  const response: PushQueueResponse = {
    queue_available: true,
    summary,
    entries,
  };

  return NextResponse.json(response);
}

export async function PATCH(request: Request) {
  const auth = await getAuthFromRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { userId, supabase } = auth;

  let body: PushQueueStatusPatchBody;
  try {
    body = (await request.json()) as PushQueueStatusPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const deduped = new Map<string, { status: PushQueueStatus; error: string | null }>();

  for (const rawItem of body.items) {
    const suggestionId =
      typeof rawItem?.suggestion_id === "string" ? rawItem.suggestion_id.trim() : "";
    const status = rawItem?.status;
    const errorText =
      typeof rawItem?.error === "string" ? rawItem.error.trim() || null : null;

    if (!suggestionId) {
      return NextResponse.json(
        { error: "Each item requires suggestion_id" },
        { status: 400 },
      );
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status for suggestion ${suggestionId}` },
        { status: 400 },
      );
    }
    deduped.set(suggestionId, { status, error: errorText });
  }

  try {
    for (const [suggestionId, item] of deduped) {
      let attemptCount: number | undefined;
      if (item.status === "running") {
        const { data: current, error: currentError } = await supabase
          .from("key_skill_review_push_queue")
          .select("attempt_count")
          .eq("user_id", userId)
          .eq("suggestion_id", suggestionId)
          .maybeSingle();

        if (currentError && !isQueueTableMissing(currentError)) {
          return NextResponse.json(
            { error: "Failed to update push queue: " + currentError.message },
            { status: 500 },
          );
        }
        attemptCount = Number(current?.attempt_count ?? 0) + 1;
      }

      const updatePayload: Record<string, unknown> = {
        status: item.status,
        updated_at: nowIso,
      };

      if (item.status === "running") {
        updatePayload.last_attempt_at = nowIso;
        updatePayload.attempt_count = attemptCount ?? 1;
        updatePayload.last_error = null;
      } else if (item.status === "synced") {
        updatePayload.synced_at = nowIso;
        updatePayload.last_error = null;
      } else if (item.status === "failed") {
        updatePayload.synced_at = null;
        updatePayload.last_error = item.error ?? "Push to ePortfolio failed";
      } else {
        updatePayload.last_error = null;
      }

      const { error: updateError } = await supabase
        .from("key_skill_review_push_queue")
        .update(updatePayload)
        .eq("user_id", userId)
        .eq("suggestion_id", suggestionId);

      if (updateError) {
        if (isQueueTableMissing(updateError)) {
          return NextResponse.json(
            { error: "Push queue table is unavailable" },
            { status: 503 },
          );
        }
        return NextResponse.json(
          { error: "Failed to update push queue: " + updateError.message },
          { status: 500 },
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unexpected error updating push queue",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, updated: deduped.size });
}
