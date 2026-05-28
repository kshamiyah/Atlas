import { redirect } from "next/navigation";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalAuditProgressBar } from "@/components/key-skill-review/GlobalAuditProgressBar";
import { SyncRefreshListener } from "@/components/dashboard/SyncRefreshListener";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, userId, bypassAuth, impersonating } =
    await resolveRequestAuth();

  if (!userId && !bypassAuth) redirect("/login");

  const syncLogQuery = supabase
    .from("kaizen_sync_log")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);
  if (userId) syncLogQuery.eq("user_id", userId);

  const { data: syncRow } = await syncLogQuery.maybeSingle();

  let profilePhotoUrl: string | null = null;
  if (userId) {
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("profile_photo_url")
      .eq("id", userId)
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
        userEmail={
          user?.email ??
          (impersonating ? "dev-bypass (impersonating)" : bypassAuth ? "dev-bypass@localhost" : undefined)
        }
        lastSyncAt={syncRow?.synced_at ?? null}
        profilePhotoUrl={profilePhotoUrl}
      />
      <div className="relative flex-1 overflow-y-auto">
        {impersonating ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            Dev bypass — viewing data for user {userId}
          </div>
        ) : null}
        <SyncRefreshListener />
        <GlobalAuditProgressBar />
        <div className="min-h-full md:px-3 md:py-4 lg:px-5">
          {children}
        </div>
      </div>
    </div>
  );
}
