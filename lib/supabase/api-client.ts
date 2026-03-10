import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create a Supabase client that authenticates with a Bearer token (e.g. from extension).
 * Use for API routes that receive Authorization: Bearer <access_token>.
 */
export function createSupabaseClientWithToken(accessToken: string) {
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Get the authenticated user and token from a Bearer header.
 * Returns user + accessToken for use in subsequent Supabase calls, or error.
 */
export async function getUserFromBearerToken(
  authHeader: string | null
): Promise<
  | { user: User; accessToken: string }
  | { error: string }
> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { error: "Missing token" };

  const supabase = createSupabaseClientWithToken(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return { error: error.message };
  if (!user) return { error: "Invalid token" };
  return { user, accessToken: token };
}
