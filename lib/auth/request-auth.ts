import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getDevBypassUserId, isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type RequestAuthContext = {
  supabase: SupabaseClient;
  user: User | null;
  userId: string | null;
  bypassAuth: boolean;
  impersonating: boolean;
};

export async function resolveRequestAuth(): Promise<RequestAuthContext> {
  const bypassAuth = isDevAuthBypassEnabled();
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    return {
      supabase,
      user,
      userId: user.id,
      bypassAuth: false,
      impersonating: false,
    };
  }

  if (bypassAuth) {
    const bypassUserId = getDevBypassUserId();
    if (bypassUserId) {
      return {
        supabase: createServiceRoleSupabaseClient(),
        user: null,
        userId: bypassUserId,
        bypassAuth: true,
        impersonating: true,
      };
    }
  }

  return {
    supabase,
    user: null,
    userId: null,
    bypassAuth,
    impersonating: false,
  };
}
