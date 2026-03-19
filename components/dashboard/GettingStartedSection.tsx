import Link from "next/link";

type Step = {
  label: string;
  description: string;
  done: boolean;
  href?: string;
  hrefLabel?: string;
  external?: boolean;
};

type GettingStartedSectionProps = {
  hasSynced: boolean;
};

export function GettingStartedSection({ hasSynced }: GettingStartedSectionProps) {
  const steps: Step[] = [
    {
      label: "Create your account",
      description: "You're signed in and ready to go.",
      done: true,
    },
    {
      label: "Install the Chrome extension",
      description: "The extension connects PortfolioIQ to your Kaizen ePortfolio.",
      done: hasSynced,
      href: "https://chrome.google.com/webstore",
      hrefLabel: "Chrome Web Store →",
      external: true,
    },
    {
      label: "Sync your Kaizen entries",
      description: "Open any Kaizen page and click \u201cSync to PortfolioIQ\u201d in the extension.",
      done: hasSynced,
    },
    {
      label: "Generate your first AI entry",
      description: "Describe a case in plain English and let GPT-4o write it up.",
      done: false,
      href: "/dashboard/generate",
      hrefLabel: "Try it →",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Getting started
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {completedCount} of {steps.length} steps complete
          </p>
        </div>
        {/* Progress pill */}
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: completedCount === steps.length
              ? "rgba(22,163,74,0.10)"
              : "var(--surface-3)",
            color: completedCount === steps.length
              ? "var(--accent-green)"
              : "var(--text-secondary)",
          }}
        >
          {progressPct}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--surface-4)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            backgroundColor: completedCount === steps.length
              ? "var(--accent-green)"
              : "var(--accent-primary)",
          }}
        />
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            {/* Step indicator */}
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-micro font-bold"
              style={
                step.done
                  ? {
                      backgroundColor: "rgba(22,163,74,0.12)",
                      color: "var(--accent-green)",
                    }
                  : {
                      backgroundColor: "var(--surface-3)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                    }
              }
            >
              {step.done ? "✓" : i + 1}
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-medium"
                style={{
                  color: step.done ? "var(--text-muted)" : "var(--text-primary)",
                  textDecoration: step.done ? "line-through" : "none",
                }}
              >
                {step.label}
              </p>
              {!step.done && (
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {step.description}
                </p>
              )}
              {!step.done && step.href && (
                <Link
                  href={step.href}
                  className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                  {...(step.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {step.hrefLabel}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
