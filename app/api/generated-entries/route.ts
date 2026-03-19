import { NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  createSupabaseClientWithToken,
} from "@/lib/supabase/api-client";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const auth = await getUserFromBearerToken(
    request.headers.get("Authorization")
  );
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401, headers: CORS_HEADERS });
  }
  const { user, accessToken } = auth;
  const supabase = createSupabaseClientWithToken(accessToken);

  const { data: entries, error } = await supabase
    .from("generated_entries")
    .select(
      "id, entry_type, raw_input, structured_data, suggested_key_skills, pushed_to_kaizen, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ entries: entries ?? [] }, { headers: CORS_HEADERS });
}
