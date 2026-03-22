import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/AppSidebar";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

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
      />
      <div className="relative flex-1 overflow-y-auto">
        <div className="min-h-full md:px-3 md:py-4 lg:px-5">
          {children}
        </div>
      </div>
    </div>
  );
}
