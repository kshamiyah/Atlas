import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export type CipDetailSyncBody = {
  cip_number: number;
  key_skills: Array<{
    name: string;
    evidence_count: number | null;
    covered: boolean;
    linked_items?: Array<{
      type?: string | null;
      name?: string | null;
      stage?: string | null;
      status?: string | null;
    }>;
  }>;
};

export async function POST(request: Request) {
  const auth = await getUserFromBearerToken(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { user, accessToken } = auth;

  let body: CipDetailSyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { cip_number, key_skills } = body;
  if (
    typeof cip_number !== "number" ||
    !Array.isArray(key_skills)
  ) {
    return NextResponse.json(
      { error: "Body must include cip_number (number) and key_skills (array)" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseClientWithToken(accessToken);

  const { error: deleteError } = await supabase
    .from("kaizen_key_skill_coverage")
    .delete()
    .eq("user_id", user.id)
    .eq("cip_number", cip_number);

  if (deleteError) {
    return NextResponse.json(
      {
        error:
          "Failed to clear existing coverage: " + deleteError.message,
      },
      { status: 500 }
    );
  }

  if (key_skills.length > 0) {
    const rows = key_skills.map((ks) => ({
      user_id: user.id,
      cip_number,
      key_skill_name: ks.name ?? "",
      evidence_count: ks.evidence_count,
      covered: Boolean(ks.covered),
      linked_items: Array.isArray(ks.linked_items) ? ks.linked_items : [],
    }));

    const { error: insertError } = await supabase
      .from("kaizen_key_skill_coverage")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert coverage: " + insertError.message },
        { status: 500 }
      );
    }
  }

  await supabase.from("kaizen_sync_log").insert({
    user_id: user.id,
    sync_type: "cip_detail",
    data_hash: String(cip_number),
  });

  return NextResponse.json({
    ok: true,
    synced: key_skills.length,
    cip_number,
  });
}
