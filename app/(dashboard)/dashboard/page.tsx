import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { GettingStartedSection } from "@/components/dashboard/GettingStartedSection";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { CipProgressSection } from "@/components/dashboard/CipProgressSection";
import { SyncStatusSection } from "@/components/dashboard/SyncStatusSection";
import { RecentEntriesSection } from "@/components/dashboard/RecentEntriesSection";
import { KeySkillGapsSection } from "@/components/dashboard/KeySkillGapsSection";

export default async function DashboardPage() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profile },
    { data: stages },
    { data: cipProgress },
    { data: syncLog },
    { data: entries },
    { data: coverage },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("current_stage_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("stages")
      .select("id, name, stage_group")
      .order("sort_order", { ascending: true }),
    supabase
      .from("kaizen_cip_progress")
      .select("*")
      .order("cip_number", { ascending: true }),
    supabase
      .from("kaizen_sync_log")
      .select("sync_type, synced_at")
      .order("synced_at", { ascending: false })
      .limit(50),
    supabase
      .from("kaizen_entries")
      .select("*")
      .limit(15),
    supabase
      .from("kaizen_key_skill_coverage")
      .select("cip_number, key_skill_name, covered")
      .eq("covered", false)
      .order("cip_number", { ascending: true }),
  ]);

  const lastSyncByType: Record<string, string> = {};
  (syncLog || []).forEach((row) => {
    if (!lastSyncByType[row.sync_type]) {
      lastSyncByType[row.sync_type] = row.synced_at;
    }
  });

  const hasNoData =
    (cipProgress ?? []).length === 0 &&
    Object.keys(lastSyncByType).length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardHeader userEmail={user.email} />
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-8">
        <StageSelector
          currentStageId={profile?.current_stage_id ?? null}
          stages={stages ?? []}
        />
        {hasNoData && <GettingStartedSection />}
        <CipProgressSection cips={cipProgress ?? []} />
        <SyncStatusSection lastSyncByType={lastSyncByType} />
        <KeySkillGapsSection gaps={coverage ?? []} />
        <RecentEntriesSection entries={entries ?? []} />
      </main>
    </div>
  );
}
