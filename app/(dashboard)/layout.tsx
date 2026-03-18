import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/AppSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Last sync timestamp
  const { data: syncRow } = await supabase
    .from("kaizen_sync_log")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-1">
      <AppSidebar
        userEmail={user.email}
        lastSyncAt={syncRow?.synced_at ?? null}
      />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
