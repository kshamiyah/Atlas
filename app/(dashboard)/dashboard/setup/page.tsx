import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { OnboardingSetupSection } from "@/components/dashboard/OnboardingSetupSection";

type SetupPageProps = {
  searchParams: Promise<{ connected?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) {
    redirect("/login");
  }

  const params = await searchParams;
  const connected = params.connected === "1";

  const [{ data: syncLog }, { count: totalEntries }] = await Promise.all([
    supabase
      .from("kaizen_sync_log")
      .select("sync_type, synced_at")
      .order("synced_at", { ascending: false })
      .limit(50),
    supabase.from("kaizen_entries").select("id", { count: "exact", head: true }),
  ]);

  const hasAnySync = Boolean(syncLog?.length);

  if (hasAnySync || (totalEntries ?? 0) > 0) {
    redirect("/dashboard?onboarding=complete");
  }

  const connectHref = `/login?source=extension&next=${encodeURIComponent("/dashboard/setup?connected=1")}`;

  return (
    <OnboardingSetupSection
      connected={connected}
      hasAnySync={hasAnySync}
      totalEntries={totalEntries ?? 0}
      connectHref={connectHref}
    />
  );
}
