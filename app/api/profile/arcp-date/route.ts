import { getServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { arcp_date } = await req.json();

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        arcp_date: arcp_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
