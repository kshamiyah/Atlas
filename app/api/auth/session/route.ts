import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/session
 * Returns the current session's access_token when the request is authenticated via cookie.
 * Used by the extension's content script on portfolioiq.com to store the token after login.
 */
export async function GET() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!session?.access_token) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at,
  });
}
