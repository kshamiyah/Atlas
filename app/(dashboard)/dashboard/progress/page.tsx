import { Suspense } from "react";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { ProgressHubClient } from "@/components/progress/ProgressHubClient";
import { resolveStageContext } from "@/lib/profile/stage";

export default async function ProgressPage() {
  const { supabase, userId } = await resolveRequestAuth();

  let initialYear = null;
  let currentYear = null;

  if (userId) {
    const [{ data: profile }, { data: stageRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("current_stage_id, current_grade")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("stages").select("id, name, stage_group").order("sort_order", { ascending: true }),
    ]);

    const currentStageName =
      profile?.current_stage_id
        ? (stageRows ?? []).find((row) => row.id === profile.current_stage_id)?.name ??
          profile?.current_grade ??
          null
        : profile?.current_grade ?? null;

    const stageContext = resolveStageContext({
      selectedStageId: profile?.current_stage_id ?? null,
      selectedStageName: currentStageName,
      stageRows: stageRows ?? [],
    });

    initialYear = stageContext.checkpointStageName;
    currentYear = stageContext.checkpointStageName;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-small text-muted">
          Loading…
        </div>
      }
    >
      <ProgressHubClient initialYear={initialYear} currentYear={currentYear} />
    </Suspense>
  );
}
