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
    const g = s.stage_group || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  if (!currentStageId) return null;

  return (
    <div>
      {/* Inline stage display */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
        <span className="text-micro text-muted">
          {currentStage?.name ?? "—"}
          <span className="mx-1 opacity-40">·</span>
          {currentStage?.stage_group}
        </span>
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          disabled={saving}
          className="text-micro text-muted underline-offset-2 hover:text-secondary transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Change"}
        </button>
      </div>

      {/* Stage picker — expands inline */}
      {showPicker && (
        <div
          className="mt-3 pt-3 space-y-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p className="text-micro text-muted">
            Select your current training stage:
          </p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(groups).map(([groupName, groupStages]) => (
              <div key={groupName} className="space-y-1.5">
                <p
                  className="text-micro font-semibold uppercase tracking-wide"
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
                        className="rounded-full px-3 py-1 text-micro font-medium transition-colors disabled:opacity-50"
                        style={
                          isActive
                            ? {
                                backgroundColor: "var(--accent-primary)",
                                color: "var(--surface-2)",
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

          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="text-micro text-muted underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
