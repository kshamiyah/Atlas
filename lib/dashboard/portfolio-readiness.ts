import type { SupabaseClient } from "@supabase/supabase-js";

export type PortfolioReadiness = {
  hasData: boolean;
  totalEntries: number;
  syncLogCount: number;
};

export function isSetupRoute(pathname: string) {
  return pathname === "/dashboard/setup" || pathname.startsWith("/dashboard/setup/");
}

export async function getPortfolioReadiness(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<PortfolioReadiness> {
  if (!userId) {
    return { hasData: false, totalEntries: 0, syncLogCount: 0 };
  }

  const [{ count: totalEntries }, { count: syncLogCount }] = await Promise.all([
    supabase
      .from("kaizen_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("kaizen_sync_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const entries = totalEntries ?? 0;
  const syncs = syncLogCount ?? 0;

  return {
    hasData: entries > 0 || syncs > 0,
    totalEntries: entries,
    syncLogCount: syncs,
  };
}

export function shouldShowFirstSyncWelcome(params: {
  hasData: boolean;
  profileCreatedAt: string | null;
  welcomeParam: string | null;
  onboardingParam: string | null;
}) {
  if (params.welcomeParam === "first-sync" || params.onboardingParam === "complete") {
    return true;
  }

  if (!params.hasData || !params.profileCreatedAt) return false;

  const createdAtMs = new Date(params.profileCreatedAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;

  const daysSinceCreated = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  return daysSinceCreated <= 14;
}

export function firstSyncRedirectPath(readiness: PortfolioReadiness) {
  const likelyFirstSync =
    readiness.hasData &&
    readiness.totalEntries > 0 &&
    readiness.syncLogCount <= 2;

  return likelyFirstSync
    ? "/dashboard/key-skill-review?welcome=first-sync"
    : "/dashboard";
}
