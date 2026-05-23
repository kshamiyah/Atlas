import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardReadinessSection } from "@/components/dashboard/DashboardReadinessSection";
import { DashboardSummaryCard } from "@/components/dashboard/DashboardSummaryCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { EvidenceTabsSection } from "@/components/dashboard/EvidenceTabsSection";
import { SystemStatusStrip } from "@/components/dashboard/SystemStatusStrip";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { calculateArcpCountdown } from "@/lib/profile/ltft";
import { resolveStageContext } from "@/lib/profile/stage";
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
  const stageContext = resolveStageContext({
    selectedStageId: profile?.current_stage_id ?? null,
    selectedStageName: currentStage?.name ?? null,
    stageRows: stages ?? [],
  });

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
      <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
        <div className="animate-stagger flex flex-col gap-5 md:gap-6">
          {showOnboardingSuccess && (
            <section className="rounded-[2rem] border border-emerald-300/35 bg-surface-2/94 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur md:p-6">
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

          <header className="relative z-20 flex flex-col gap-4 border-b border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Overview
              </p>
              <h1 className="text-3xl font-semibold text-primary md:text-4xl">
                Atlas Dashboard
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-secondary">
                Next actions, readiness signals, and portfolio momentum in one place.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <StageSelector
                  currentStageId={profile?.current_stage_id ?? null}
                  stages={stages ?? []}
                />
                  <span
                    className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
                    style={{
                      borderColor: isLtft ? "rgba(245,158,11,0.35)" : "var(--border-subtle)",
                      color: isLtft ? "var(--accent-amber)" : "var(--text-secondary)",
                      background: isLtft ? "rgba(245,158,11,0.10)" : "var(--surface-2)",
                    }}
                  >
                    {isLtft ? `LTFT ${workingPercent}% WTE` : "Working pattern 100%"}
                  </span>
                  {daysToArcp !== null && (
                    <span
                      className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
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
                              : "var(--surface-2)",
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
                    <span className="rounded-lg border border-subtle bg-surface-2 px-2.5 py-1.5 text-[11px] text-muted">
                      Add stage and ARCP date to personalize insights
                    </span>
                  )}
              </div>
            </div>
          </header>

          <DashboardSummaryCard
            totalEntries={totalEntries ?? 0}
            daysToArcp={daysToArcp}
            currentStageScope={stageContext.curriculumBandId}
            currentStageGroupLabel={stageContext.curriculumBandLabel}
          />

          <SystemStatusStrip lastSyncByType={lastSyncByType} />

          <DashboardReadinessSection stageKey={profile?.current_stage_id ?? "none"} />

          <EvidenceTabsSection
            entries={entries ?? []}
            unsignedEntries={unsignedAssessmentEntries}
            hasEntriesSync={Boolean(lastSyncByType.entries)}
          />

          <ActivityHeatmap />
        </div>
      </main>
    </div>
  );
}
