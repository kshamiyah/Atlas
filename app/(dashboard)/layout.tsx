import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/AppSidebar";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { GlobalAuditProgressBar } from "@/components/key-skill-review/GlobalAuditProgressBar";
import { SyncRefreshListener } from "@/components/dashboard/SyncRefreshListener";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) redirect("/login");

  // Last sync timestamp
  const { data: syncRow } = user
    ? await supabase
        .from("kaizen_sync_log")
        .select("synced_at")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null as { synced_at: string } | null };

  let profilePhotoUrl: string | null = null;
  if (user) {
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("profile_photo_url")
      .eq("id", user.id)
      .maybeSingle();
    if (!profileErr && profileRow && typeof profileRow.profile_photo_url === "string") {
      const u = profileRow.profile_photo_url.trim();
      profilePhotoUrl = u.length > 0 ? u : null;
    }
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-surface-1 md:flex-row">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(1100px 380px at 22% -10%, rgba(0,113,227,0.08), transparent 60%), radial-gradient(760px 320px at 86% 12%, rgba(22,163,74,0.07), transparent 58%)",
        }}
      />
      <AppSidebar
        userEmail={user?.email ?? (bypassAuth ? "dev-bypass@localhost" : undefined)}
        lastSyncAt={syncRow?.synced_at ?? null}
        profilePhotoUrl={profilePhotoUrl}
      />
      <div className="relative flex-1 overflow-y-auto">
        <SyncRefreshListener />
        <GlobalAuditProgressBar />
        <div className="min-h-full md:px-3 md:py-4 lg:px-5">
          {children}
        </div>
      </div>
    </div>
  );
}
