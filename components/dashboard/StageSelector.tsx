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

export function StageSelector({
  currentStageId,
  stages,
}: StageSelectorProps) {
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
    [currentStageId, router, saving]
  );

  const currentStage = stages.find((s) => s.id === currentStageId);
  const groups = stages.reduce<Record<string, StageItem[]>>((acc, s) => {
    const g = s.stage_group || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  const showPills = showPicker || !currentStageId;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      {!currentStageId && (
        <p className="mb-3 text-sm font-medium text-slate-200">
          Select your training stage
        </p>
      )}
      {currentStageId && !showPicker && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">Stage:</span>
          <span className="inline-flex items-center rounded-full bg-sky-500/20 px-3 py-1 text-sm font-medium text-sky-300 ring-1 ring-sky-500/40">
            {currentStage?.name ?? "—"}
          </span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="text-xs text-slate-400 underline hover:text-slate-300"
          >
            Change
          </button>
        </div>
      )}
      {showPills && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(groups).map(([groupName, groupStages]) => (
            <div key={groupName} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{groupName}:</span>
              {groupStages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelect(stage.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 ${
                    currentStageId === stage.id
                      ? "bg-sky-500/30 text-sky-200 ring-1 ring-sky-500/50"
                      : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                >
                  {stage.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {saving && (
        <p className="mt-2 text-xs text-slate-500">Saving…</p>
      )}
    </section>
  );
}
