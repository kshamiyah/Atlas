import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

export async function GET(request: Request) {
  const auth = await getUserFromBearerToken(
    request.headers.get("Authorization")
  );
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const { user, accessToken } = auth;
  const supabase = createSupabaseClientWithToken(accessToken);

  const { data: entries, error } = await supabase
    .from("generated_entries")
    .select("id, entry_type, raw_input, structured_data, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: entries ?? [] });
}
