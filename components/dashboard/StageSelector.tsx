"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export type StageItem = {
  id: string;
  name: string;
  stage_group: string;
};

type StageSelectorProps = {
  currentStageId: string | null;
  stages: StageItem[];
};

export function StageSelector({ currentStageId, stages }: StageSelectorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const handleSelect = useCallback(
    async (stageId: string) => {
      if (saving || stageId === currentStageId) return;
      setSaving(true);
      try {
        const res = await fetch("/api/profile/stage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id: stageId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save");
        }
        setShowPicker(false);
        router.refresh();
      } catch (err) {
        console.error("[StageSelector]", err);
      } finally {
        setSaving(false);
      }
    },
    [currentStageId, router, saving],
  );

  const currentStage = stages.find((s) => s.id === currentStageId);
  const groups = stages.reduce<Record<string, StageItem[]>>((acc, s) => {
    const g = s.stage_group || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  // Not yet synced — prompt user to sync
  if (!currentStageId) {
    return (
      <section className="card flex items-center gap-3 px-4 py-3">
        <div className="h-2 w-2 rounded-full bg-accent-amber" />
        <p className="text-small text-secondary">
          Sync your portfolio to detect your training stage automatically.
        </p>
      </section>
    );
  }

  return (
    <section className="card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Synced badge */}
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
          <span className="text-micro text-muted">Current stage</span>
        </div>

        <span className="inline-flex items-center rounded-full bg-accent-green/10 px-2.5 py-0.5 text-micro font-semibold text-accent-green ring-1 ring-accent-green/20">
          {currentStage?.name ?? "—"}
          <span className="ml-1 font-normal text-accent-green/60">
            · {currentStage?.stage_group}
          </span>
        </span>

        <span className="text-micro text-muted">· synced from Kaizen</span>

        {/* Escape hatch — only show if user really needs to override */}
        {!showPicker && (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="text-micro text-muted underline decoration-dotted transition-colors hover:text-primary"
          >
            override
          </button>
        )}
      </div>

      {/* Stage picker — only visible after clicking override */}
      {showPicker && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-subtle pt-3">
          {Object.entries(groups).map(([groupName, groupStages]) => (
            <div key={groupName} className="flex flex-wrap items-center gap-2">
              <span className="text-micro text-muted">{groupName}:</span>
              {groupStages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelect(stage.id)}
                  className={[
                    "rounded-full px-3 py-1 text-micro font-medium transition-colors disabled:opacity-50",
                    currentStageId === stage.id
                      ? "bg-accent-green/10 text-accent-green ring-1 ring-accent-green/20"
                      : "bg-surface-3 text-secondary hover:bg-surface-4 hover:text-primary",
                  ].join(" ")}
                >
                  {stage.name}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="text-micro text-muted underline decoration-dotted transition-colors hover:text-primary"
          >
            cancel
          </button>
        </div>
      )}

      {saving && (
        <p className="mt-2 text-micro text-muted">Saving…</p>
      )}
    </section>
  );
}
