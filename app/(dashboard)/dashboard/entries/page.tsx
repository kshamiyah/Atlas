import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { EntriesListClient } from "@/components/dashboard/EntriesListClient";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ day?: string; q?: string }>;
}) {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) {
    redirect("/login");
  }

  const query = supabase
    .from("kaizen_entries")
    .select("id, title, kaizen_date, assessment_type, status, synced_at")
    .order("synced_at", { ascending: false })
    .limit(200);

  const { data: entries } = user ? await query.eq("user_id", user.id) : await query;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialDayFilter = resolvedSearchParams?.day?.trim() ?? "";
  const initialQuery = resolvedSearchParams?.q?.trim() ?? "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Entries
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-primary">
              Synced entries
            </h1>
            <p className="mt-1 text-sm leading-6 text-secondary">
              Latest Kaizen entries imported into Atlas.
            </p>
          </div>
          <a href="/dashboard" className="btn-secondary w-fit px-4 py-2 text-small">
            Back to dashboard
          </a>
        </header>

        <EntriesListClient
          entries={entries ?? []}
          initialDayFilter={initialDayFilter}
          initialQuery={initialQuery}
        />
      </div>
    </main>
  );
}
