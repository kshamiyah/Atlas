import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user && bypassAuth) {
    return NextResponse.json({ dates: [] });
  }
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const { data, error } = await supabase
    .from("key_skill_review_entries")
    .select("event_date")
    .eq("user_id", userId)
    .not("event_date", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dates = (data ?? []).map((r: { event_date: string }) => r.event_date);
  return NextResponse.json({ dates });
}
