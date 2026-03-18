import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardReadinessSection } from "@/components/dashboard/DashboardReadinessSection";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { GettingStartedSection } from "@/components/dashboard/GettingStartedSection";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { CipProgressSection } from "@/components/dashboard/CipProgressSection";
import { SyncStatusSection } from "@/components/dashboard/SyncStatusSection";
import { RecentEntriesSection } from "@/components/dashboard/RecentEntriesSection";

export default async function DashboardPage() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Week boundary for "entries this week"
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [
    { data: profile },
    { data: stages },
    { data: cipProgress },
    { data: syncLog },
    { data: entries },
    { count: totalEntries },
    { count: entriesThisWeek },
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
    supabase.from("kaizen_entries").select("*").limit(15),
    supabase
      .from("kaizen_entries")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("key_skill_review_entries")
      .select("id", { count: "exact", head: true })
      .gte("event_date", weekAgo),
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

  if (hasNoData) {
    return (
      <div className="min-h-full">
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div className="animate-stagger flex flex-col gap-8">
            <div className="space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-green/15">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent-green)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-heading-1 font-bold text-primary">
                Welcome to PortfolioIQ
              </h1>
              <p className="max-w-lg text-body text-secondary">
                Connect your Kaizen ePortfolio to start tracking your ARCP
                progress, mapping key skills, and generating portfolio entries
                with AI.
              </p>
            </div>
            <GettingStartedSection />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="animate-stagger flex flex-col gap-8">
          <StageSelector
            currentStageId={profile?.current_stage_id ?? null}
            stages={stages ?? []}
          />

          {/* Stats + Traffic light + Ring + Donuts + Priority actions — all from one fetch */}
          <DashboardReadinessSection
            totalEntries={totalEntries ?? 0}
            entriesThisWeek={entriesThisWeek ?? 0}
          />

          <CipProgressSection cips={cipProgress ?? []} />
          <SyncStatusSection lastSyncByType={lastSyncByType} />
          <RecentEntriesSection entries={entries ?? []} />

          {/* Activity heatmap */}
          <ActivityHeatmap />
        </div>
      </main>
    </div>
  );
}
