import { Suspense } from "react";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { ProgressHubClient } from "@/components/progress/ProgressHubClient";
import { resolveStageContext } from "@/lib/profile/stage";

export default async function ProgressPage() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialStageScope: string | null = null;

  if (user?.id) {
    const [{ data: profile }, { data: stageRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("current_stage_id, current_grade")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("stages").select("id, name, stage_group"),
    ]);

    const currentStageName =
      profile?.current_stage_id
        ? (stageRows ?? []).find((row) => row.id === profile.current_stage_id)?.name ??
          profile?.current_grade ??
          null
        : profile?.current_grade ?? null;

    initialStageScope =
      resolveStageContext({
        selectedStageId: profile?.current_stage_id ?? null,
        selectedStageName: currentStageName,
        stageRows: stageRows ?? [],
      }).curriculumBandId ?? null;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-small text-muted">
          Loading…
        </div>
      }
    >
      <ProgressHubClient initialStageScope={initialStageScope} />
    </Suspense>
  );
}
