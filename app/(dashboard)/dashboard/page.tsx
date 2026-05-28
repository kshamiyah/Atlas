import { redirect } from "next/navigation";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { DashboardReadinessSection } from "@/components/dashboard/DashboardReadinessSection";
import { DashboardSummaryCard } from "@/components/dashboard/DashboardSummaryCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { StageSelector } from "@/components/dashboard/StageSelector";
import { EvidenceTabsSection } from "@/components/dashboard/EvidenceTabsSection";
import { SystemStatusStrip } from "@/components/dashboard/SystemStatusStrip";
import { FirstSyncWelcomeBanner } from "@/components/dashboard/FirstSyncWelcomeBanner";
import { shouldShowFirstSyncWelcome } from "@/lib/dashboard/portfolio-readiness";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { calculateArcpCountdown } from "@/lib/profile/ltft";
import { resolveStageContext } from "@/lib/profile/stage";
import {
  classifyAssessorSignoffState,
  requiresAssessorSignoff,
} from "@/lib/kaizen/evidence-eligibility";
import { compareKaizenEntryDatesDesc } from "@/lib/kaizen/kaizen-date";

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
  searchParams: Promise<{ onboarding?: string; welcome?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    redirect("/login");
  }

  const profileRes = userId
    ? await supabase
        .from("profiles")
        .select("current_stage_id, arcp_date, working_percent, created_at")
        .eq("id", userId)
        .maybeSingle()
    : {
        data: null as {
          current_stage_id: string | null;
          arcp_date: string | null;
          working_percent: number | null;
          created_at: string | null;
        } | null,
      };

  const entriesQuery = supabase
    .from("kaizen_entries")
    .select("*")
    .order("synced_at", { ascending: false })
    .limit(500);
  const entriesCountQuery = supabase
    .from("kaizen_entries")
    .select("id", { count: "exact", head: true });
  const syncLogQuery = supabase
    .from("kaizen_sync_log")
    .select("sync_type, synced_at")
    .order("synced_at", { ascending: false })
    .limit(50);
  const assessmentQuery = supabase
    .from("kaizen_entries")
    .select(
      "id, title, kaizen_date, assessment_type, detected_entry_type, status, extracted_fields",
    )
    .order("synced_at", { ascending: false });

  if (userId) {
    entriesQuery.eq("user_id", userId);
    entriesCountQuery.eq("user_id", userId);
    syncLogQuery.eq("user_id", userId);
    assessmentQuery.eq("user_id", userId);
  }

  const [
    { data: stages },
    { data: syncLog },
    { data: entries },
    { count: totalEntries },
    { data: assessmentEntries },
  ] = await Promise.all([
    supabase
      .from("stages")
      .select("id, name, stage_group")
      .order("sort_order", { ascending: true }),
    syncLogQuery,
    entriesQuery,
    entriesCountQuery,
    assessmentQuery,
  ]);

  const profile = profileRes.data;

  const recentEntriesByEntryDate = [...(entries ?? [])]
    .sort((left, right) => {
      const byEntryDate = compareKaizenEntryDatesDesc(
        left.kaizen_date,
        right.kaizen_date,
      );
      if (byEntryDate !== 0) return byEntryDate;

      const leftSynced = left.synced_at ? new Date(left.synced_at).getTime() : 0;
      const rightSynced = right.synced_at ? new Date(right.synced_at).getTime() : 0;
      return rightSynced - leftSynced;
    })
    .slice(0, 15);

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

  const params = await searchParams;
  const showFirstSyncWelcome = shouldShowFirstSyncWelcome({
    hasData: (totalEntries ?? 0) > 0 || Object.keys(lastSyncByType).length > 0,
    profileCreatedAt: profile?.created_at ?? null,
    welcomeParam: params.welcome ?? null,
    onboardingParam: params.onboarding ?? null,
  });

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

  const activityDataVersion = [
    totalEntries ?? 0,
    lastSyncByType.entries ?? "",
    lastSyncByType.dashboard ?? "",
  ].join(":");

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
        <div className="animate-stagger flex flex-col gap-5 md:gap-6">
          {showFirstSyncWelcome ? (
            <FirstSyncWelcomeBanner showByDefault={showFirstSyncWelcome} />
          ) : null}

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
            entries={recentEntriesByEntryDate}
            unsignedEntries={unsignedAssessmentEntries}
            hasEntriesSync={Boolean(lastSyncByType.entries)}
            totalEntries={totalEntries ?? 0}
          />

          <ActivityHeatmap dataVersion={activityDataVersion} />
        </div>
      </main>
    </div>
  );
}
