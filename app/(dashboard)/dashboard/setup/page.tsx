import { redirect } from "next/navigation";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { OnboardingSetupSection } from "@/components/dashboard/OnboardingSetupSection";
import {
  firstSyncRedirectPath,
  getPortfolioReadiness,
} from "@/lib/dashboard/portfolio-readiness";

type SetupPageProps = {
  searchParams: Promise<{ connected?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    redirect("/login");
  }

  const params = await searchParams;
  const connected = params.connected === "1";
  const readiness = await getPortfolioReadiness(supabase, userId);

  if (readiness.hasData) {
    redirect(firstSyncRedirectPath(readiness));
  }

  const connectHref = `/login?source=extension&next=${encodeURIComponent("/dashboard/setup?connected=1")}`;

  return (
    <OnboardingSetupSection
      connected={connected}
      hasAnySync={readiness.syncLogCount > 0}
      totalEntries={readiness.totalEntries}
      connectHref={connectHref}
    />
  );
}
