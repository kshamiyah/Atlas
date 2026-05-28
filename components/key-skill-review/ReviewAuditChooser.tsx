"use client";

type AuditRunMode = "everything" | "suggested_links" | "over_cap" | "replacements";

type AuditModeOption = {
  mode: AuditRunMode;
  label: string;
  description: string;
  count: number;
};

type ReviewAuditChooserProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isAuditing: boolean;
  auditButtonState: "idle" | "success";
  disabled: boolean;
  selectedAuditRunMode: AuditRunMode;
  onSelectAuditRunMode: (mode: AuditRunMode) => void;
  auditModeOptions: AuditModeOption[];
  selectedAuditRunEntryCount: number;
  onRunAudit: (mode: AuditRunMode) => void | Promise<void>;
};

const SHORT_DESCRIPTIONS: Record<AuditRunMode, string> = {
  everything: "Full portfolio sweep",
  suggested_links: "Entries with open slots",
  over_cap: "Too many linked skills",
  replacements: "Swap or cleanup candidates",
};

function scopeLine(
  selectedAuditRunMode: AuditRunMode,
  selectedAuditRunEntryCount: number,
): { text: string; empty: boolean } {
  if (selectedAuditRunMode === "everything") {
    return { text: "Runs across your whole portfolio.", empty: false };
  }
  if (selectedAuditRunEntryCount === 0) {
    return { text: "No entries match this scope yet.", empty: true };
  }
  return {
    text: `${selectedAuditRunEntryCount} entr${selectedAuditRunEntryCount === 1 ? "y" : "ies"} in scope.`,
    empty: false,
  };
}

export function ReviewAuditChooser({
  isOpen,
  onOpenChange,
  isAuditing,
  auditButtonState,
  disabled,
  selectedAuditRunMode,
  onSelectAuditRunMode,
  auditModeOptions,
  selectedAuditRunEntryCount,
  onRunAudit,
}: ReviewAuditChooserProps) {
  const canStart =
    !disabled &&
    !isAuditing &&
    (selectedAuditRunMode === "everything" || selectedAuditRunEntryCount > 0);

  const scope = scopeLine(selectedAuditRunMode, selectedAuditRunEntryCount);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isAuditing || disabled) return;
          onOpenChange(!isOpen);
        }}
        disabled={disabled || isAuditing}
        className={[
          "inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
          isAuditing
            ? "bg-primary text-white"
            : auditButtonState === "success"
              ? "bg-surface-3 text-primary"
              : isOpen
                ? "bg-surface-3 text-primary"
                : "bg-surface-2 text-primary hover:bg-surface-3",
          "disabled:cursor-not-allowed disabled:opacity-40",
        ].join(" ")}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={
          isAuditing ? "Audit running" : isOpen ? "Close audit options" : "Run audit"
        }
      >
        {isAuditing ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Auditing…
          </>
        ) : auditButtonState === "success" ? (
          "Audit complete"
        ) : (
          <>
            Run audit
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={`opacity-50 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        )}
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Audit options"
        aria-hidden={!isOpen || isAuditing}
        className={[
          "absolute right-0 top-full z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] origin-top-right transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen && !isAuditing
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0",
        ].join(" ")}
      >
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-surface-2/95 shadow-[0_12px_48px_rgba(0,0,0,0.14),0_0_0_0.5px_rgba(0,0,0,0.06)] backdrop-blur-2xl dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
            <div>
              <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-primary">
                Run audit
              </h3>
              <p className="mt-0.5 text-[11px] text-muted">Choose a scope</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.06] text-muted transition hover:bg-black/[0.1] hover:text-primary dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
              aria-label="Close"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="px-3 pb-3">
            <div
              className="overflow-hidden rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06]"
              role="radiogroup"
              aria-label="Audit scope"
            >
              {auditModeOptions.map((option, index) => {
                const selected = selectedAuditRunMode === option.mode;
                const subtitle =
                  SHORT_DESCRIPTIONS[option.mode] ?? option.description;

                return (
                  <button
                    key={option.mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelectAuditRunMode(option.mode)}
                    className={[
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                      index > 0 ? "border-t border-black/[0.06] dark:border-white/[0.06]" : "",
                      selected ? "bg-accent-blue/[0.08]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium tracking-[-0.01em] text-primary">
                          {option.label}
                        </span>
                        <span
                          className={[
                            "shrink-0 text-[12px] tabular-nums",
                            selected ? "font-medium text-accent-blue" : "text-muted",
                          ].join(" ")}
                        >
                          {option.count}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-tight text-muted">{subtitle}</p>
                    </div>

                    <span
                      className={[
                        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition",
                        selected
                          ? "border-accent-blue bg-accent-blue text-white"
                          : "border-black/15 bg-transparent dark:border-white/20",
                      ].join(" ")}
                      aria-hidden
                    >
                      {selected ? (
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <p
              className={[
                "mt-2.5 px-1 text-center text-[11px] leading-snug",
                scope.empty ? "text-accent-amber" : "text-muted",
              ].join(" ")}
            >
              {scope.text}
            </p>

            <button
              type="button"
              onClick={() => void onRunAudit(selectedAuditRunMode)}
              disabled={!canStart}
              className="mt-2.5 flex h-9 w-full items-center justify-center rounded-[10px] bg-accent-blue text-[13px] font-semibold tracking-[-0.01em] text-white transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start audit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
