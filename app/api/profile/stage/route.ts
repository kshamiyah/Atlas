import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { stage_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stageId =
    typeof body.stage_id === "string" ? body.stage_id.trim() : null;
  if (!stageId) {
    return NextResponse.json(
      { error: "stage_id is required" },
      { status: 400 }
    );
  }

  const { data: stage } = await supabase
    .from("stages")
    .select("id, name")
    .eq("id", stageId)
    .maybeSingle();

  if (!stage) {
    return NextResponse.json(
      { error: "Invalid stage_id" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        current_stage_id: stageId,
        current_grade: stage.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("[profile/stage] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to save stage" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
