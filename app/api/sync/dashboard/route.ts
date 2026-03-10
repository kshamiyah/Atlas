import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export type DashboardSyncBody = {
  cips: Array<{
    cip_number: number;
    cip_title: string;
    percentage: number | null;
    status_colour: string | null;
  }>;
};

export async function POST(request: Request) {
  const auth = await getUserFromBearerToken(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { user, accessToken } = auth;

  let body: DashboardSyncBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { cips } = body;
  if (!Array.isArray(cips)) {
    return NextResponse.json(
      { error: "Body must include cips array" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseClientWithToken(accessToken);

  const { error: deleteError } = await supabase
    .from("kaizen_cip_progress")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to clear existing progress: " + deleteError.message },
      { status: 500 }
    );
  }

  if (cips.length > 0) {
    const rows = cips.map((c) => ({
      user_id: user.id,
      cip_number: c.cip_number,
      cip_title: c.cip_title ?? "",
      percentage: c.percentage,
      status_colour: c.status_colour,
    }));

    const { error: insertError } = await supabase
      .from("kaizen_cip_progress")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert progress: " + insertError.message },
        { status: 500 }
      );
    }
  }

  const dataHash = JSON.stringify(
    cips.map((c) => [c.cip_number, c.percentage]).sort((a, b) => a[0] - b[0])
  );
  await supabase.from("kaizen_sync_log").insert({
    user_id: user.id,
    sync_type: "dashboard",
    data_hash: dataHash,
  });

  return NextResponse.json({
    ok: true,
    synced: cips.length,
  });
}
