"use client";

const DISMISS_KEY = "piq.write.getting-started.dismissed";

type StepStatus = "complete" | "current" | "upcoming";

type GuideStep = {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
};

type WriteGettingStartedProps = {
  hasNotes: boolean;
  hasEntryType: boolean;
  hasGenerated: boolean;
  onDismiss: () => void;
};

function StepIndicator({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-green/35 bg-accent-green/12 text-accent-green">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (status === "current") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-blue/40 bg-accent-blue/12 text-[11px] font-semibold text-accent-blue">
        →
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-2 text-[11px] font-medium text-muted">
      ·
    </span>
  );
}

export function readWriteGettingStartedDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismissWriteGettingStarted(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, "1");
}

export function WriteGettingStarted({
  hasNotes,
  hasEntryType,
  hasGenerated,
  onDismiss,
}: WriteGettingStartedProps) {
  const headline = !hasEntryType
    ? "Choose an entry type first"
    : !hasNotes
      ? "Add your clinical notes"
      : !hasGenerated
        ? "Ready to generate"
        : "Entry generated — copy to ePortfolio next";

  const subhead = !hasEntryType
    ? "Pick the ePortfolio form you need in Entry settings (left on desktop, below notes on mobile)."
    : !hasNotes
      ? "Write what happened in plain language. Atlas structures it for the form you chose."
      : !hasGenerated
        ? "Optional: set date, length, and target key skills, then tap Generate entry."
        : "Review and edit the fields below, then use Fill in ePortfolio with the Atlas extension open.";

  const steps: GuideStep[] = [
    {
      id: "type",
      title: "Choose entry type",
      description:
        "Pick the ePortfolio form you want (e.g. Reflective Practice, Procedure log, OSATS). Atlas will not guess.",
      status: hasEntryType ? "complete" : "current",
    },
    {
      id: "notes",
      title: "Describe the case",
      description:
        "Paste or type your notes. Anonymised is fine. Atlas structures them for the form you chose.",
      status: !hasEntryType ? "upcoming" : hasNotes ? "complete" : "current",
    },
    {
      id: "generate",
      title: "Generate & edit",
      description:
        "Each field can be regenerated or copied individually before you send it to ePortfolio.",
      status:
        !hasEntryType || !hasNotes
          ? "upcoming"
          : hasGenerated
            ? "complete"
            : "current",
    },
    {
      id: "kaizen",
      title: "Fill in ePortfolio",
      description:
        "Use Fill in ePortfolio. The Atlas extension queues your fields and opens the matching new-entry form.",
      status: hasGenerated ? "current" : "upcoming",
    },
  ];

  return (
    <section className="card overflow-hidden p-0">
      <div className="border-b border-subtle bg-gradient-to-r from-accent-blue/8 via-surface-1 to-surface-1 px-4 py-4 md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
              Getting started
            </p>
            <h2 className="mt-1 text-lg font-semibold text-primary">{headline}</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-secondary">
              {subhead}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-3 hover:text-secondary"
          >
            Dismiss
          </button>
        </div>
      </div>

      <ol className="divide-y divide-subtle px-4 py-2 md:px-5">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex gap-3 py-3.5 ${
              step.status === "current" ? "bg-accent-blue/[0.03]" : ""
            }`}
          >
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <StepIndicator status={step.status} />
              {index < steps.length - 1 ? (
                <span
                  className={`mt-1 h-full min-h-6 w-px ${
                    step.status === "complete" ? "bg-accent-green/35" : "bg-subtle"
                  }`}
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-sm font-semibold ${
                    step.status === "upcoming" ? "text-muted" : "text-primary"
                  }`}
                >
                  {step.title}
                </p>
                {step.status === "current" ? (
                  <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-blue">
                    Next step
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] leading-relaxed text-secondary">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
