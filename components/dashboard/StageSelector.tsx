"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { getStageGroupForStage } from "@/lib/profile/stage";

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
      if (saving || stageId === currentStageId) {
        setShowPicker(false);
        return;
      }
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
    const g = getStageGroupForStage(s.name) ?? s.stage_group ?? "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  if (!currentStageId) return null;

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setShowPicker((v) => !v)}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-secondary transition hover:bg-surface-3 disabled:opacity-50"
      >
        <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
        <span className="truncate">{currentStage?.name ?? "—"}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${showPicker ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-lg border border-subtle bg-surface-2 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Training stage
              </p>
              <p className="mt-1 text-[12px] text-secondary">
                {getStageGroupForStage(currentStage?.name) ?? currentStage?.stage_group ?? "Current stage"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-[11px] font-medium text-muted transition hover:text-secondary"
            >
              Close
            </button>
          </div>

          <div className="space-y-2.5">
            {Object.entries(groups).map(([groupName, groupStages]) => (
              <div key={groupName} className="space-y-1.5">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {groupName}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {groupStages.map((stage) => {
                    const isActive = currentStageId === stage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={saving}
                        onClick={() => handleSelect(stage.id)}
                        className="rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
                        style={
                          isActive
                            ? {
                                backgroundColor: "var(--text-primary)",
                                color: "var(--surface-1)",
                                border: "1px solid transparent",
                              }
                            : {
                                backgroundColor: "var(--surface-3)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-subtle)",
                              }
                        }
                      >
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
