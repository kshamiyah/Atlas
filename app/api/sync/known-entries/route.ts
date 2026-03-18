import { NextRequest, NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export async function GET(req: NextRequest) {
  const auth = await getUserFromBearerToken(req.headers.get("Authorization"));
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: 401 });

  const { user, accessToken } = auth;
  const supabase = createSupabaseClientWithToken(accessToken);

  const { data, error } = await supabase
    .from("kaizen_entries")
    .select("source_entry_id")
    .eq("user_id", user.id)
    .not("source_entry_id", "is", null);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const known_ids = (data ?? [])
    .map((r) => String(r.source_entry_id))
    .filter(Boolean);

  return NextResponse.json({ known_ids });
}
