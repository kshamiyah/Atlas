import { redirect } from "next/navigation";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { EntriesListClient } from "@/components/dashboard/EntriesListClient";
import { parseProfilePosts } from "@/lib/progress/year-portfolio";
import { normalizeStageName } from "@/lib/profile/stage";
import {
  cipAssessmentToBrowsableEntry,
  type BrowsableEntryRow,
  type CipAssessmentRecord,
} from "@/lib/kaizen/cip-assessment";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ day?: string; q?: string; year?: string }>;
}) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    redirect("/login");
  }

  const profileQuery = userId
    ? supabase.from("profiles").select("post_history").eq("id", userId).maybeSingle()
    : Promise.resolve({ data: null as { post_history: unknown } | null });

  const entriesQuery = supabase
    .from("kaizen_entries")
    .select(
      "id, title, kaizen_date, assessment_type, status, synced_at, source_entry_id, source_url, detected_entry_type, category, training_year, linked_cip_number, entry_text, extracted_fields, extraction_status, key_skills_count, kaizen_procedure_id, assessor_role_id",
    )
    .order("synced_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);
  const cipAssessmentsQuery = supabase
    .from("cip_assessments")
    .select(
      "id, kaizen_entry_id, cip_number, cip_kaizen_id, cip_name, date, trainee_entrustment, trainee_level, trainee_comments, es_agrees, es_entrustment, es_meets_expectations, es_level, es_comments, status, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  const countQuery = supabase
    .from("kaizen_entries")
    .select("id", { count: "exact", head: true });
  const cipCountQuery = supabase
    .from("cip_assessments")
    .select("id", { count: "exact", head: true });

  const cipsQuery = supabase.from("cips").select("number, title").order("number");

  if (userId) {
    entriesQuery.eq("user_id", userId);
    cipAssessmentsQuery.eq("user_id", userId);
    countQuery.eq("user_id", userId);
    cipCountQuery.eq("user_id", userId);
  }

  const [
    { data: portfolioEntries },
    { data: cipAssessments },
    { count: portfolioSyncedCount },
    { count: cipSyncedCount },
    { data: profile },
    { data: cips },
  ] = await Promise.all([
    entriesQuery,
    cipAssessmentsQuery,
    countQuery,
    cipCountQuery,
    profileQuery,
    cipsQuery,
  ]);

  const cipCatalog = new Map((cips ?? []).map((cip) => [cip.number as number, cip.title as string]));
  const browsablePortfolioEntries = (portfolioEntries ?? []) as BrowsableEntryRow[];
  const browsableCipEntries = ((cipAssessments ?? []) as CipAssessmentRecord[]).map((record) =>
    cipAssessmentToBrowsableEntry(record, "https://training.rcog.org.uk", cipCatalog),
  );
  const entries = [...browsablePortfolioEntries, ...browsableCipEntries].sort((a, b) => {
    const aSync = a.synced_at ? new Date(a.synced_at).getTime() : 0;
    const bSync = b.synced_at ? new Date(b.synced_at).getTime() : 0;
    if (bSync !== aSync) return bSync - aSync;
    return String(b.kaizen_date ?? "").localeCompare(String(a.kaizen_date ?? ""));
  });
  const totalSyncedCount = (portfolioSyncedCount ?? 0) + (cipSyncedCount ?? 0);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialDayFilter = resolvedSearchParams?.day?.trim() ?? "";
  const initialQuery = resolvedSearchParams?.q?.trim() ?? "";
  const initialYear = normalizeStageName(resolvedSearchParams?.year ?? null);
  const postHistory = parseProfilePosts(profile?.post_history);

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Entries
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-primary">
              My Entries
            </h1>
            <p className="mt-1 text-sm leading-6 text-secondary">
              Your synced evidence history from ePortfolio, including CiP assessments.
            </p>
          </div>
          <a href="/dashboard" className="btn-secondary w-fit px-4 py-2 text-small">
            Back to dashboard
          </a>
        </header>

        <EntriesListClient
          entries={entries}
          totalSyncedCount={totalSyncedCount}
          postHistory={postHistory}
          initialDayFilter={initialDayFilter}
          initialQuery={initialQuery}
          initialYearFilter={initialYear}
        />
      </div>
    </main>
  );
}
