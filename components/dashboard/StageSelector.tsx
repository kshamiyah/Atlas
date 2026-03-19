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

  // No stage yet — prompt to sync
  if (!currentStageId) {
    return (
      <section className="card flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-accent-amber" />
          <p className="text-small text-secondary">
            Sync your portfolio to detect your training stage automatically.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card px-4 py-3">
      {/* Top row — always visible */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Live dot */}
          <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />

          {/* Stage info */}
          <div className="flex items-center gap-1.5">
            <span className="text-micro text-muted">Training stage</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-micro font-semibold"
              style={{
                backgroundColor: "rgba(22,163,74,0.08)",
                color: "var(--accent-green)",
                border: "1px solid rgba(22,163,74,0.18)",
              }}
            >
              {currentStage?.name ?? "—"}
              <span style={{ color: "var(--accent-green)", opacity: 0.55 }}>
                · {currentStage?.stage_group}
              </span>
            </span>
            <span className="text-micro text-muted">synced from Kaizen</span>
          </div>
        </div>

        {/* Change button — visible, not hidden */}
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          disabled={saving}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-micro font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: showPicker ? "var(--surface-4)" : "var(--surface-3)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {saving ? "Saving…" : "Change"}
          {/* Chevron */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: showPicker ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Stage picker — expands inline */}
      {showPicker && (
        <div
          className="mt-3 space-y-3 border-t pt-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p className="text-micro text-muted">Select your current training stage:</p>
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
                                backgroundColor: "rgba(22,163,74,0.10)",
                                color: "var(--accent-green)",
                                border: "1px solid rgba(22,163,74,0.22)",
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
    </section>
  );
}
