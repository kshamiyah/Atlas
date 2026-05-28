import { redirect } from "next/navigation";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { EntriesListClient } from "@/components/dashboard/EntriesListClient";
import { parseProfilePosts } from "@/lib/progress/year-portfolio";
import { normalizeStageName } from "@/lib/profile/stage";

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
  const countQuery = supabase
    .from("kaizen_entries")
    .select("id", { count: "exact", head: true });

  if (userId) {
    entriesQuery.eq("user_id", userId);
    countQuery.eq("user_id", userId);
  }

  const [{ data: entries }, { count: totalSyncedCount }, { data: profile }] = await Promise.all([
    entriesQuery,
    countQuery,
    profileQuery,
  ]);
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
              Your synced evidence history from ePortfolio.
            </p>
          </div>
          <a href="/dashboard" className="btn-secondary w-fit px-4 py-2 text-small">
            Back to dashboard
          </a>
        </header>

        <EntriesListClient
          entries={entries ?? []}
          totalSyncedCount={totalSyncedCount ?? 0}
          postHistory={postHistory}
          initialDayFilter={initialDayFilter}
          initialQuery={initialQuery}
          initialYearFilter={initialYear}
        />
      </div>
    </main>
  );
}
