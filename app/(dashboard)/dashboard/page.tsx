import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardReadinessSection } from "@/components/dashboard/DashboardReadinessSection";
import { DashboardNextActionsSection } from "@/components/dashboard/DashboardNextActionsSection";
import { DashboardProgressGateway } from "@/components/dashboard/DashboardProgressGateway";
import { DashboardStatsRow } from "@/components/dashboard/DashboardStatsRow";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { GettingStartedSection } from "@/components/dashboard/GettingStartedSection";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { RecentEntriesSection } from "@/components/dashboard/RecentEntriesSection";
import { SyncStatusSection } from "@/components/dashboard/SyncStatusSection";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { calculateArcpCountdown } from "@/lib/profile/ltft";

export default async function DashboardPage() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) {
    redirect("/login");
  }

  const profileRes = user
    ? await supabase
        .from("profiles")
        .select("current_stage_id, arcp_date, working_percent")
        .eq("id", user.id)
        .maybeSingle()
    : {
        data: null as {
          current_stage_id: string | null;
          arcp_date: string | null;
          working_percent: number | null;
        } | null,
      };

  const [{ data: stages }, { data: syncLog }, { data: entries }, { count: totalEntries }] =
    await Promise.all([
    supabase
      .from("stages")
      .select("id, name, stage_group")
      .order("sort_order", { ascending: true }),
    supabase
      .from("kaizen_sync_log")
      .select("sync_type, synced_at")
      .order("synced_at", { ascending: false })
      .limit(50),
    supabase
      .from("kaizen_entries")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(15),
    supabase
      .from("kaizen_entries")
      .select("id", { count: "exact", head: true }),
  ]);

  const profile = profileRes.data;

  const lastSyncByType: Record<string, string> = {};
  (syncLog || []).forEach((row) => {
    if (!lastSyncByType[row.sync_type]) {
      lastSyncByType[row.sync_type] = row.synced_at;
    }
  });
  const nowMs = new Date().getTime();

  const arcpCountdown = calculateArcpCountdown(
    profile?.arcp_date ?? null,
    profile?.working_percent ?? 100,
    nowMs,
  );
  const daysToArcp = arcpCountdown.calendarDaysToArcp;
  const wteDaysToArcp = arcpCountdown.wteDaysToArcp;
  const workingPercent = arcpCountdown.workingPercent;
  const isLtft = arcpCountdown.isLtft;
  const badgeDaysToArcp =
    isLtft && wteDaysToArcp !== null ? wteDaysToArcp : daysToArcp;

  const currentStage = (stages ?? []).find(
    (s) => s.id === profile?.current_stage_id,
  );

  const hasNoData =
    !bypassAuth &&
    (totalEntries ?? 0) === 0 &&
    Object.keys(lastSyncByType).length === 0;

  if (hasNoData) {
    return (
      <div className="min-h-full">
        <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
          <div className="animate-stagger flex flex-col gap-6">
            <section className="relative overflow-hidden rounded-3xl border border-subtle bg-surface-2 p-6 md:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(0,113,227,0.18), transparent 70%)" }}
              />
              <div className="relative space-y-4">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-green/15">
                  <svg
                    width="22"
                    height="22"
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
                <div className="space-y-1.5">
                  <h1 className="text-heading-1 font-bold text-primary">
                    Welcome to PortfolioIQ
                  </h1>
                  <p className="max-w-2xl text-body leading-relaxed text-secondary">
                    Connect your Kaizen ePortfolio to unlock ARCP readiness tracking,
                    CiP coverage, and AI-assisted writing in one focused workspace.
                  </p>
                </div>
              </div>
            </section>

            <GettingStartedSection
              hasSynced={Object.keys(lastSyncByType).length > 0}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="animate-stagger flex flex-col gap-6 md:gap-7">
          <header className="relative overflow-hidden rounded-3xl border border-subtle bg-surface-2 p-6 md:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(560px 220px at 20% -12%, rgba(0,113,227,0.13), transparent 68%), radial-gradient(520px 220px at 92% 0%, rgba(22,163,74,0.12), transparent 70%)",
              }}
            />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Overview
                </p>
                <div className="space-y-1.5">
                  <h1 className="text-heading-1 font-bold text-primary">
                    Portfolio Dashboard
                  </h1>
                  <p className="max-w-2xl text-small leading-relaxed text-secondary">
                    Your command centre for next actions, ARCP signals, and quick links — open Progress for full CiP, skill, and
                    descriptor coverage.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5">
                    <StageSelector
                      currentStageId={profile?.current_stage_id ?? null}
                      stages={stages ?? []}
                    />
                  </div>
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderColor: isLtft ? "rgba(245,158,11,0.35)" : "var(--border-subtle)",
                      color: isLtft ? "var(--accent-amber)" : "var(--text-secondary)",
                      background: isLtft ? "rgba(245,158,11,0.10)" : "var(--surface-1)",
                    }}
                  >
                    {isLtft ? `LTFT ${workingPercent}% WTE` : "Working pattern 100%"}
                  </span>
                  {daysToArcp !== null && (
                    <span
                      className="rounded-full border px-3 py-1.5 text-xs font-medium"
                      style={{
                        borderColor:
                          (badgeDaysToArcp ?? 0) < 30
                            ? "rgba(220,38,38,0.35)"
                            : (badgeDaysToArcp ?? 0) < 90
                              ? "rgba(245,158,11,0.35)"
                              : "var(--border-subtle)",
                        color:
                          (badgeDaysToArcp ?? 0) < 30
                            ? "var(--accent-red)"
                            : (badgeDaysToArcp ?? 0) < 90
                              ? "var(--accent-amber)"
                              : "var(--text-secondary)",
                        background:
                          (badgeDaysToArcp ?? 0) < 30
                            ? "rgba(220,38,38,0.08)"
                            : (badgeDaysToArcp ?? 0) < 90
                              ? "rgba(245,158,11,0.10)"
                              : "var(--surface-1)",
                      }}
                    >
                      {daysToArcp > 0
                        ? isLtft
                          ? `${wteDaysToArcp ?? daysToArcp} WTE days (${daysToArcp} calendar) to ARCP`
                          : `${daysToArcp} days to ARCP`
                        : "ARCP date passed"}
                    </span>
                  )}
                  {!currentStage && daysToArcp === null && (
                    <span className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-muted">
                      Add stage and ARCP date to personalize insights
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <a href="/dashboard/progress" className="btn-secondary px-4 py-2 text-small">
                  Progress Hub
                </a>
                <a href="/dashboard/key-skill-review" className="btn-secondary px-4 py-2 text-small">
                  Review Skills
                </a>
                <a href="/dashboard/generate" className="btn-primary px-4 py-2 text-small">
                  Generate Entry
                </a>
              </div>
            </div>
          </header>

          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-small font-semibold text-primary">What should I do now?</h2>
              <p className="mt-0.5 text-[11px] text-muted">Highest-impact tasks and a snapshot of curriculum coverage.</p>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
              <DashboardNextActionsSection />
              <DashboardProgressGateway />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-small font-semibold text-primary">At a glance</h2>
              <span className="text-[11px] text-muted">Entries &amp; ARCP</span>
            </div>
            <DashboardStatsRow
              totalEntries={totalEntries ?? 0}
              calendarDaysToArcp={daysToArcp}
              wteDaysToArcp={wteDaysToArcp}
              workingPercent={workingPercent}
              arcpDate={profile?.arcp_date ?? null}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-small font-semibold text-primary">ARCP readiness</h2>
              <span className="text-[11px] text-muted">Prediction from portfolio weighting</span>
            </div>
            <DashboardReadinessSection />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <RecentEntriesSection entries={entries ?? []} />
            <div className="flex flex-col gap-5">
              <ActivityHeatmap />
              <SyncStatusSection lastSyncByType={lastSyncByType} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
