import Link from "next/link";
import { getStageGroupForStage } from "@/lib/profile/stage";

export type StageItem = {
  id: string;
  name: string;
  stage_group: string;
};

type CurrentStageBadgeProps = {
  currentStageId: string | null;
  stages: StageItem[];
};

export function StageSelector({ currentStageId, stages }: CurrentStageBadgeProps) {
  const currentStage = stages.find((stage) => stage.id === currentStageId);
  if (!currentStageId || !currentStage) return null;

  const stageGroup =
    getStageGroupForStage(currentStage.name) ?? currentStage.stage_group ?? null;

  return (
    <Link
      href="/dashboard/profile"
      title="View training details on Profile"
      className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-secondary transition hover:bg-surface-3"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
      <span className="truncate">{currentStage.name}</span>
      {stageGroup ? (
        <span className="hidden text-muted sm:inline">· {stageGroup}</span>
      ) : null}
    </Link>
  );
}
