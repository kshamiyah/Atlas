import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardReadinessSection } from "@/components/dashboard/DashboardReadinessSection";
import { DashboardNextActionsSection } from "@/components/dashboard/DashboardNextActionsSection";
import { DashboardProgressGateway } from "@/components/dashboard/DashboardProgressGateway";
import { DashboardStatsRow } from "@/components/dashboard/DashboardStatsRow";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { RecentEntriesSection } from "@/components/dashboard/RecentEntriesSection";
import { SyncStatusSection } from "@/components/dashboard/SyncStatusSection";
import { UnsignedAssessmentEntriesSection } from "@/components/dashboard/UnsignedAssessmentEntriesSection";
import { LightweightRefreshSection } from "@/components/dashboard/LightweightRefreshSection";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { calculateArcpCountdown } from "@/lib/profile/ltft";
import {
  classifyAssessorSignoffState,
  requiresAssessorSignoff,
} from "@/lib/kaizen/evidence-eligibility";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAssessmentDisplayStatus(
  extractedFields: Record<string, unknown> | null | undefined,
  fallbackStatus: string | null | undefined,
) {
  if (extractedFields && typeof extractedFields === "object") {
    const direct =
      extractedFields["the current status of this assessment request"] ??
      extractedFields["current status of this assessment request"] ??
      extractedFields["assessment request"];
    const text = normalizeText(direct);
    if (text) return text;
  }

  const fallback = normalizeText(fallbackStatus);
  if (fallback) return fallback;
  return "Unknown";
}

function readAssessmentOtherParty(
  extractedFields: Record<string, unknown> | null | undefined,
) {
  if (!extractedFields || typeof extractedFields !== "object") return "";
  const value =
    extractedFields["assessor"] ??
    extractedFields["trainer"] ??
    extractedFields["supervisor"];
  return normalizeText(value);
}

type DashboardPageProps = {
  searchParams: Promise<{ onboarding?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
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

  const [
    { data: stages },
    { data: syncLog },
    { data: entries },
    { count: totalEntries },
    { data: assessmentEntries },
  ] =
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
    user
      ? supabase
          .from("kaizen_entries")
          .select(
            "id, title, kaizen_date, assessment_type, detected_entry_type, status, extracted_fields",
          )
          .eq("user_id", user.id)
          .order("synced_at", { ascending: false })
      : {
          data: [] as Array<{
            id: string;
            title: string;
            kaizen_date: string;
            assessment_type: string;
            detected_entry_type: string | null;
            status: string;
            extracted_fields: Record<string, unknown> | null;
          }>,
        },
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

  const unsignedAssessmentEntries = (assessmentEntries ?? [])
    .filter((entry) =>
      requiresAssessorSignoff(entry.detected_entry_type, entry.assessment_type),
    )
    .filter((entry) => {
      const signoffState = classifyAssessorSignoffState({
        status: entry.status,
        extracted_fields: entry.extracted_fields,
      });
      return signoffState !== "signed_or_complete";
    })
    .map((entry) => ({
      id: entry.id,
      other_party_name: readAssessmentOtherParty(entry.extracted_fields),
      entry_title: normalizeText(entry.title),
      status: readAssessmentDisplayStatus(entry.extracted_fields, entry.status),
      date: normalizeText(entry.kaizen_date),
    }));

  if (hasNoData) {
    redirect("/dashboard/setup");
  }

  const params = await searchParams;
  const showOnboardingSuccess = params.onboarding === "complete";

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="animate-stagger flex flex-col gap-6 md:gap-7">
          {showOnboardingSuccess && (
            <section className="rounded-3xl border border-emerald-300/35 bg-surface-2 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
                    First sync complete
                  </p>
                  <h2 className="text-heading-3 font-semibold text-primary">
                    Your portfolio is in. Atlas is ready to guide the next step.
                  </h2>
                  <p className="max-w-2xl text-xs leading-relaxed text-secondary">
                    We&apos;ve detected your first Kaizen sync. Start by reviewing suggested skills
                    or open Progress Hub to see where your evidence is already strong.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href="/dashboard/key-skill-review" className="btn-primary px-4 py-2 text-small">
                    Review what Atlas found
                  </a>
                  <a href="/dashboard/progress" className="btn-secondary px-4 py-2 text-small">
                    Open Progress Hub
                  </a>
                </div>
              </div>
            </section>
          )}

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
              <LightweightRefreshSection />
              <UnsignedAssessmentEntriesSection
                entries={unsignedAssessmentEntries}
                hasEntriesSync={Boolean(lastSyncByType.entries)}
              />
              <ActivityHeatmap />
              <SyncStatusSection lastSyncByType={lastSyncByType} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
