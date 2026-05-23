"use client";

export const PROGRESS_STAGE_TABS = [
  { label: "All bands", sub: null as string | null, value: null as string | null },
  { label: "Stage One", sub: "ST1–ST2", value: "BAND_ST1_2" },
  { label: "Stage Two", sub: "ST3–ST5", value: "BAND_ST3_5" },
  { label: "Stage Three", sub: "ST6–ST7", value: "BAND_ST6_7" },
] as const;

type ProgressScopeBarProps = {
  selectedStageScope: string | null;
  onStageScopeChange: (value: string | null) => void;
  disabled?: boolean;
};

export function ProgressScopeBar({
  selectedStageScope,
  onStageScopeChange,
  disabled,
}: ProgressScopeBarProps) {
  return (
    <div className="mt-4 inline-flex flex-wrap gap-0.5 rounded-full bg-surface-3 p-0.5">
      {PROGRESS_STAGE_TABS.map((tab) => (
        <button
          key={tab.label}
          type="button"
          disabled={disabled}
          onClick={() => onStageScopeChange(tab.value)}
          className={[
            "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150 disabled:opacity-50",
            selectedStageScope === tab.value
              ? "bg-surface-1 text-primary shadow-sm ring-1 ring-subtle"
              : "text-muted hover:text-secondary",
          ].join(" ")}
        >
          {tab.label}
          {tab.sub && <span className="ml-1 opacity-50">{tab.sub}</span>}
        </button>
      ))}
    </div>
  );
}
