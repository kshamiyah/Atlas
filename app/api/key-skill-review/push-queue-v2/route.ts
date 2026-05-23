import { NextResponse } from "next/server";
import {
  countLogicalChanges,
  emptySummary,
  getUserIdForRead,
  isDescriptorOnlyNonSyncKeySkill,
  isQueueV2TableMissing,
  loadGroupsWithJobs,
  normaliseActionType,
} from "./_shared";
import type {
  PushQueueStatus,
  PushQueueV2ImportBody,
  PushQueueV2ImportResponse,
  PushQueueV2Response,
  PushQueueActionType,
} from "@/lib/types/key-skill-review-api";

type V1QueueRow = {
  id: string;
  user_id: string;
  suggestion_id: string;
  review_entry_id: string;
  key_skill_id: string;
  status: PushQueueStatus;
  attempt_count: number | null;
  last_error: string | null;
  updated_at: string;
  action_type: string | null;
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

type V1ImportGroup = {
  review_entry_id: string;
  source_entry_key: string;
  title: string;
  date: string;
  entry_edit_url: string | null;
  jobs: Array<{
    source_v1_queue_id: string;
    suggestion_id: string;
    key_skill_id: string;
    key_skill_title: string;
    cip_number: number;
    kaizen_id: string | null;
    kaizen_ids: string[];
    display_value: string;
    action_type: PushQueueActionType;
    action_group_id: string | null;
    sequence_index: number | null;
    kaizen_skill_id: string | null;
    payload: Record<string, unknown> | null;
    last_error: string | null;
  }>;
};

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
      if (/\/edit(?:\?|$)/i.test(parsed.pathname)) return parsed.toString();

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
      // ignore invalid URL
    }
  }

  if (sourceEntryId && /^\d+$/.test(sourceEntryId)) {
    return `https://training.rcog.org.uk/node/${sourceEntryId}/edit`;
  }
  return null;
}

function buildDisplayValue(
  keySkillTitle: string,
  kaizenId: string | null,
): string {
  return kaizenId ? `${keySkillTitle} (${kaizenId})` : keySkillTitle;
}

function deriveEntryKindFromUrl(url: string | null): "assessment" | "log_entry" | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (/^\/assessment-type\/\d+(?:\/edit)?$/i.test(path)) return "assessment";
    if (/^\/log-entry\/\d+(?:\/edit)?$/i.test(path)) return "log_entry";
  } catch {
    // ignore invalid URL
  }
  return null;
}

function statusesFromBody(body: PushQueueV2ImportBody | null): PushQueueStatus[] {
  const requested = Array.isArray(body?.statuses) ? body.statuses : [];
  const clean = requested.filter((status): status is PushQueueStatus =>
    status === "pending" || status === "failed" || status === "running" || status === "synced",
  );
  return clean.length > 0 ? clean : ["pending", "failed"];
}

export async function GET() {
  const auth = await getUserIdForRead();
  if ("response" in auth) return auth.response;
  if (auth.bypassAuth || !auth.userId) {
    const empty: PushQueueV2Response = {
      queue_available: true,
      summary: emptySummary(),
      groups: [],
    };
    return NextResponse.json(empty);
  }

  try {
    const { queueAvailable, groups } = await loadGroupsWithJobs(auth.supabase, auth.userId);
    const summary = emptySummary();
    for (const group of groups) {
      summary.total += 1;
      summary[group.status] += 1;
    }

    const response: PushQueueV2Response = {
      queue_available: queueAvailable,
      summary,
      groups,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (isQueueV2TableMissing(error)) {
      const empty: PushQueueV2Response = {
        queue_available: false,
        summary: emptySummary(),
        groups: [],
      };
      return NextResponse.json(empty);
    }
    const detail = error instanceof Error ? error.message : "Failed to load V2 push queue";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getUserIdForRead();
  if ("response" in auth) return auth.response;
  if (auth.bypassAuth || !auth.userId) {
    const empty: PushQueueV2ImportResponse = {
      ok: true,
      queue_available: true,
      imported_groups: 0,
      imported_jobs: 0,
      statuses: [],
    };
    return NextResponse.json(empty);
  }

  const body = (await request.json().catch(() => null)) as PushQueueV2ImportBody | null;
  const statuses = statusesFromBody(body);

  const { data: queueRows, error: queueError } = await auth.supabase
    .from("key_skill_review_push_queue")
    .select("*")
    .eq("user_id", auth.userId)
    .in("status", statuses);

  if (queueError) {
    if (isQueueV2TableMissing(queueError)) {
      return NextResponse.json(
        { ok: false, error: "Live V1 queue storage is unavailable." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  const v1Rows = (queueRows ?? []) as V1QueueRow[];
  if (v1Rows.length === 0) {
    const empty: PushQueueV2ImportResponse = {
      ok: true,
      queue_available: true,
      imported_groups: 0,
      imported_jobs: 0,
      statuses,
    };
    return NextResponse.json(empty);
  }

  const entryIds = Array.from(new Set(v1Rows.map((row) => row.review_entry_id)));
  const keySkillIds = Array.from(new Set(v1Rows.map((row) => row.key_skill_id)));

  const [{ data: entryData, error: entryError }, { data: keySkillData, error: keySkillError }] =
    await Promise.all([
      auth.supabase
        .from("key_skill_review_entries")
        .select("id,title,event_date,metadata")
        .eq("user_id", auth.userId)
        .in("id", entryIds),
      auth.supabase
        .from("key_skills")
        .select("id,title,cip_id,kaizen_ids")
        .in("id", keySkillIds),
    ]);

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 });
  }
  if (keySkillError) {
    return NextResponse.json({ error: keySkillError.message }, { status: 500 });
  }

  const keySkills = (keySkillData ?? []) as KeySkillRow[];
  const cipIds = Array.from(
    new Set(keySkills.map((keySkill) => keySkill.cip_id).filter((value): value is string => !!value)),
  );

  const { data: cipData, error: cipError } = await auth.supabase
    .from("cips")
    .select("id,number")
    .in("id", cipIds);

  if (cipError) {
    return NextResponse.json({ error: cipError.message }, { status: 500 });
  }

  const entryById = new Map<string, ReviewEntryRow>(
    ((entryData ?? []) as ReviewEntryRow[]).map((row) => [row.id, row]),
  );
  const keySkillById = new Map<string, KeySkillRow>(keySkills.map((row) => [row.id, row]));
  const cipNumberById = new Map<string, number>(((cipData ?? []) as CipRow[]).map((row) => [row.id, row.number]));

  const importGroups = new Map<string, V1ImportGroup>();
  const skippedV1QueueIds = new Set<string>();

  for (const row of v1Rows) {
    const entry = entryById.get(row.review_entry_id);
    const keySkill = keySkillById.get(row.key_skill_id);
    if (!entry || !keySkill) continue;

    const sourceEntryId = readMetaString(entry.metadata, "source_entry_id");
    const sourceUrl = readMetaString(entry.metadata, "source_url");
    const entryEditUrl = toEditUrl(sourceUrl, sourceEntryId);
    const entryKind = deriveEntryKindFromUrl(sourceUrl) ?? deriveEntryKindFromUrl(entryEditUrl);
    const sourceEntryKey = `v1:${row.review_entry_id}`;
    const kaizenIds = Array.isArray(keySkill.kaizen_ids)
      ? keySkill.kaizen_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const kaizenId = kaizenIds[0] ?? null;
    const cipNumber = keySkill.cip_id ? cipNumberById.get(keySkill.cip_id) ?? 0 : 0;

    if (isDescriptorOnlyNonSyncKeySkill(cipNumber, keySkill.title)) {
      skippedV1QueueIds.add(row.id);
      continue;
    }

    const existing = importGroups.get(row.review_entry_id);
    const job = {
      source_v1_queue_id: row.id,
      suggestion_id: row.suggestion_id,
      key_skill_id: row.key_skill_id,
      key_skill_title: keySkill.title,
      cip_number: cipNumber,
      kaizen_id: kaizenId,
      kaizen_ids: kaizenIds,
      display_value: buildDisplayValue(keySkill.title, kaizenId),
      action_type: normaliseActionType(row.action_type),
      action_group_id: row.group_id,
      sequence_index: row.sequence_index,
      kaizen_skill_id: row.kaizen_skill_id,
      payload: {
        ...(row.payload ?? {}),
        source_entry_id: sourceEntryId,
        source_url: sourceUrl,
        entry_kind: entryKind,
      },
      last_error: row.last_error,
    };

    if (existing) {
      existing.jobs.push(job);
      if (!existing.entry_edit_url && entryEditUrl) existing.entry_edit_url = entryEditUrl;
      continue;
    }

    importGroups.set(row.review_entry_id, {
      review_entry_id: row.review_entry_id,
      source_entry_key: sourceEntryKey,
      title: entry.title,
      date: entry.event_date ?? "",
      entry_edit_url: entryEditUrl,
      jobs: [job],
    });
  }

  if (skippedV1QueueIds.size > 0) {
    const skippedIds = Array.from(skippedV1QueueIds);
    const syncedAt = new Date().toISOString();

    const { error: syncSkipV1Error } = await auth.supabase
      .from("key_skill_review_push_queue")
      .update({
        status: "synced",
        synced_at: syncedAt,
        updated_at: syncedAt,
        last_error: null,
      })
      .eq("user_id", auth.userId)
      .in("id", skippedIds);

    if (syncSkipV1Error) {
      return NextResponse.json({ error: syncSkipV1Error.message }, { status: 500 });
    }

    const { data: existingV2Jobs, error: existingV2JobsError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .select("id,group_id")
      .eq("user_id", auth.userId)
      .in("source_v1_queue_id", skippedIds);

    if (existingV2JobsError) {
      return NextResponse.json({ error: existingV2JobsError.message }, { status: 500 });
    }

    if ((existingV2Jobs ?? []).length > 0) {
      const affectedGroupIds = Array.from(
        new Set(
          (existingV2Jobs ?? [])
            .map((row) => String(row.group_id ?? "").trim())
            .filter(Boolean),
        ),
      );

      const { error: syncSkipV2JobsError } = await auth.supabase
        .from("key_skill_review_push_queue_v2_jobs")
        .update({
          status: "synced",
          synced_at: syncedAt,
          updated_at: syncedAt,
          last_error: null,
          claim_token: null,
          claimed_by: null,
          claimed_at: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
        })
        .eq("user_id", auth.userId)
        .in("source_v1_queue_id", skippedIds);

      if (syncSkipV2JobsError) {
        return NextResponse.json({ error: syncSkipV2JobsError.message }, { status: 500 });
      }

      if (affectedGroupIds.length > 0) {
        const { data: groupJobRows, error: groupJobRowsError } = await auth.supabase
          .from("key_skill_review_push_queue_v2_jobs")
          .select("group_id,status,last_error")
          .eq("user_id", auth.userId)
          .in("group_id", affectedGroupIds);

        if (groupJobRowsError) {
          return NextResponse.json({ error: groupJobRowsError.message }, { status: 500 });
        }

        for (const groupId of affectedGroupIds) {
          const jobs = (groupJobRows ?? []).filter((row) => row.group_id === groupId);
          if (jobs.length === 0) continue;

          const hasFailed = jobs.some((row) => row.status === "failed");
          const hasRunning = jobs.some((row) => row.status === "running");
          const allSynced = jobs.every((row) => row.status === "synced");
          const nextStatus = allSynced
            ? "synced"
            : hasFailed
              ? "failed"
              : hasRunning
                ? "running"
                : "pending";
          const nextError =
            nextStatus === "failed"
              ? jobs.find((row) => typeof row.last_error === "string" && row.last_error.trim())?.last_error ?? null
              : null;

          const { error: groupStatusError } = await auth.supabase
            .from("key_skill_review_push_queue_v2_groups")
            .update({
              status: nextStatus,
              last_error: nextError,
              last_synced_at: allSynced ? syncedAt : null,
              updated_at: syncedAt,
              claim_token: null,
              claimed_by: null,
              claimed_at: null,
              lease_expires_at: null,
              last_heartbeat_at: null,
            })
            .eq("id", groupId)
            .eq("user_id", auth.userId);

          if (groupStatusError) {
            return NextResponse.json({ error: groupStatusError.message }, { status: 500 });
          }
        }
      }
    }
  }

  let importedGroups = 0;
  let importedJobs = 0;

  for (const group of importGroups.values()) {
    const logicalChangeCount = countLogicalChanges(group.jobs);
    const firstError = group.jobs.find((job) => job.last_error)?.last_error ?? null;

    const { data: upsertedGroupRows, error: upsertGroupError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_groups")
      .upsert(
        {
          user_id: auth.userId,
          review_entry_id: group.review_entry_id,
          source_entry_key: group.source_entry_key,
          title: group.title,
          event_date: group.date,
          entry_edit_url: group.entry_edit_url,
          status: "pending",
          logical_change_count: logicalChangeCount,
          last_error: firstError,
          claim_token: null,
          claimed_by: null,
          claimed_at: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
        },
        { onConflict: "user_id,review_entry_id" },
      )
      .select("id")
      .limit(1);

    if (upsertGroupError) {
      if (isQueueV2TableMissing(upsertGroupError)) {
        return NextResponse.json(
          { ok: false, error: "V2 queue tables are unavailable. Run the latest migration first." },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: upsertGroupError.message }, { status: 500 });
    }

    const groupId = upsertedGroupRows?.[0]?.id as string | undefined;
    if (!groupId) {
      return NextResponse.json(
        { error: "Could not resolve imported V2 group id." },
        { status: 500 },
      );
    }

    const jobRows = group.jobs.map((job) => ({
      group_id: groupId,
      user_id: auth.userId,
      review_entry_id: group.review_entry_id,
      source_v1_queue_id: job.source_v1_queue_id,
      suggestion_id: job.suggestion_id,
      key_skill_id: job.key_skill_id,
      key_skill_title: job.key_skill_title,
      cip_number: job.cip_number,
      kaizen_id: job.kaizen_id,
      kaizen_ids: job.kaizen_ids,
      display_value: job.display_value,
      action_type: job.action_type,
      action_group_id: job.action_group_id,
      sequence_index: job.sequence_index,
      kaizen_skill_id: job.kaizen_skill_id,
      payload: job.payload,
      status: "pending",
      last_error: job.last_error,
      claim_token: null,
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      last_heartbeat_at: null,
    }));

    const { error: jobsUpsertError } = await auth.supabase
      .from("key_skill_review_push_queue_v2_jobs")
      .upsert(jobRows, { onConflict: "source_v1_queue_id" });

    if (jobsUpsertError) {
      return NextResponse.json({ error: jobsUpsertError.message }, { status: 500 });
    }

    importedGroups += 1;
    importedJobs += jobRows.length;
  }

  const response: PushQueueV2ImportResponse = {
    ok: true,
    queue_available: true,
    imported_groups: importedGroups,
    imported_jobs: importedJobs,
    statuses,
  };
  return NextResponse.json(response);
}
