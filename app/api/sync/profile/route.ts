import { NextRequest, NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

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

  // Resolve current_stage_id from current_grade (e.g. "ST1" → uuid)
  let current_stage_id: string | null = null;
  if (body.current_grade) {
    const { data: stageRow } = await supabase
      .from("stages")
      .select("id")
      .eq("name", body.current_grade)
      .single();
    current_stage_id = stageRow?.id ?? null;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      current_grade:    body.current_grade,
      current_stage_id,
      hospital:         body.hospital,
      trust:            body.trust,
      post_history:     body.posts,
      full_name:        body.full_name,
      rcog_number:      body.rcog_number,
      gmc_number:       body.gmc_number,
      ntn:              body.ntn,
    })
    .eq("id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, posts_synced: body.posts.length });
}
