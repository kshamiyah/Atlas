import { NextRequest, NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";
import { sanitizeWorkingPercent } from "@/lib/profile/ltft";

interface ProfilePost {
  grade: string;
  post_start: string | null;
  post_end: string | null;
  hospital: string | null;
  trust: string | null;
}

interface SyncProfileBody {
  posts: ProfilePost[];
  current_grade: string | null;
  hospital: string | null;
  trust: string | null;
  full_name: string | null;
  rcog_number: string | null;
  gmc_number: string | null;
  ntn: string | null;
  arcp_date?: string | null;
  working_percent?: number | string | null;
}

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; details?: string };
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return haystack.includes("does not exist") && haystack.includes(columnName.toLowerCase());
}

function toIsoDateOrNull(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = String(Number(dmy[1])).padStart(2, "0");
    const month = String(Number(dmy[2])).padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const auth = await getUserFromBearerToken(req.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { user, accessToken } = auth;
  const supabase = createSupabaseClientWithToken(accessToken);

  let body: SyncProfileBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body?.posts)) {
    return NextResponse.json(
      { error: "Invalid body: posts must be an array" },
      { status: 400 },
    );
  }

  const fullExistingLoad = await supabase
    .from("profiles")
    .select(
      "post_history, full_name, rcog_number, gmc_number, ntn, current_grade, current_stage_id, hospital, trust, arcp_date, working_percent",
    )
    .eq("id", user.id)
    .maybeSingle();

  const legacyExistingLoad =
    fullExistingLoad.error && isMissingColumn(fullExistingLoad.error, "working_percent")
      ? await supabase
          .from("profiles")
          .select(
            "post_history, full_name, rcog_number, gmc_number, ntn, current_grade, current_stage_id, hospital, trust, arcp_date",
          )
          .eq("id", user.id)
          .maybeSingle()
      : null;

  const existingProfile = (legacyExistingLoad?.data ?? fullExistingLoad.data) as
    | (Record<string, unknown> & {
        post_history?: ProfilePost[] | null;
        current_stage_id?: string | null;
        current_grade?: string | null;
        hospital?: string | null;
        trust?: string | null;
        full_name?: string | null;
        rcog_number?: string | null;
        gmc_number?: string | null;
        ntn?: string | null;
        arcp_date?: string | null;
        working_percent?: number | null;
      })
    | null;

  const existingPosts = Array.isArray(existingProfile?.post_history)
    ? (existingProfile.post_history as ProfilePost[])
    : [];
  const mergedPosts =
    body.posts.length > 0 ? body.posts : existingPosts;

  const mergedCurrentGrade =
    body.current_grade ?? existingProfile?.current_grade ?? null;
  const mergedHospital = body.hospital ?? existingProfile?.hospital ?? null;
  const mergedTrust = body.trust ?? existingProfile?.trust ?? null;
  const mergedFullName = body.full_name ?? existingProfile?.full_name ?? null;
  const mergedRcog = body.rcog_number ?? existingProfile?.rcog_number ?? null;
  const mergedGmc = body.gmc_number ?? existingProfile?.gmc_number ?? null;
  const mergedNtn = body.ntn ?? existingProfile?.ntn ?? null;
  const mergedArcpDate = toIsoDateOrNull(body.arcp_date) ?? existingProfile?.arcp_date ?? null;
  const mergedWorkingPercent = sanitizeWorkingPercent(
    body.working_percent ?? existingProfile?.working_percent ?? 100,
  );

  // Resolve current_stage_id from current_grade (e.g. "ST1" → uuid)
  let current_stage_id: string | null = null;
  if (mergedCurrentGrade) {
    const { data: stageRow } = await supabase
      .from("stages")
      .select("id")
      .eq("name", mergedCurrentGrade)
      .single();
    current_stage_id = stageRow?.id ?? null;
  } else if (existingProfile?.current_stage_id) {
    current_stage_id = existingProfile.current_stage_id;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        current_grade: mergedCurrentGrade,
        current_stage_id,
        hospital: mergedHospital,
        trust: mergedTrust,
        post_history: mergedPosts,
        full_name: mergedFullName,
        rcog_number: mergedRcog,
        gmc_number: mergedGmc,
        ntn: mergedNtn,
        arcp_date: mergedArcpDate,
        working_percent: mergedWorkingPercent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const profileDataHash = JSON.stringify({
    posts: mergedPosts.length,
    grade: mergedCurrentGrade ?? null,
    arcp_date: mergedArcpDate ?? null,
    working_percent: mergedWorkingPercent,
  });
  await supabase.from("kaizen_sync_log").insert({
    user_id: user.id,
    sync_type: "profile",
    data_hash: profileDataHash,
  });

  return NextResponse.json({
    ok: true,
    posts_synced: mergedPosts.length,
    working_percent: mergedWorkingPercent,
  });
}
