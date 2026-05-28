import Link from "next/link";
import { SetupAutoRefresh } from "@/components/dashboard/SetupAutoRefresh";
import { CHROME_EXTENSION_INSTALL_URL } from "@/lib/constants/extension";

type OnboardingSetupSectionProps = {
  connected: boolean;
  hasAnySync: boolean;
  totalEntries: number;
  connectHref: string;
};

type Step = {
  title: string;
  body: string;
  status: "done" | "next" | "waiting";
};

function StepBadge({ status }: { status: Step["status"] }) {
  if (status === "done") {
    return (
      <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
        Done
      </span>
    );
  }

  if (status === "next") {
    return (
      <span className="rounded-full bg-blue-500/12 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
        Next
      </span>
    );
  }

  return (
    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[10px] font-semibold text-muted">
      Waiting
    </span>
  );
}

export function OnboardingSetupSection({
  connected,
  hasAnySync,
  totalEntries,
  connectHref,
}: OnboardingSetupSectionProps) {
  const extensionReady = connected || hasAnySync;
  const syncComplete = hasAnySync || totalEntries > 0;
  const completedCount = stepsCompleteCount(extensionReady, syncComplete);
  const activeStep = !extensionReady
    ? "Install the Chrome extension"
    : !syncComplete
      ? "Sync your ePortfolio"
      : "Review your summary";

  const steps: Step[] = [
    {
      title: "Account ready",
      body: "You’re signed in. Next we’ll connect your ePortfolio and build your first summary.",
      status: "done",
    },
    {
      title: "Install the Chrome extension",
      body: "The Atlas extension handles ePortfolio sync and form-fill actions from your browser.",
      status: extensionReady ? "done" : "next",
    },
    {
      title: "Connect Atlas to this browser",
      body: "Authorize Atlas so the extension can send your ePortfolio data into your workspace.",
      status: extensionReady ? "done" : "waiting",
    },
    {
      title: "Sync your ePortfolio",
      body: "Open your RCOG ePortfolio and run Sync Everything in the Atlas extension popup.",
      status: syncComplete ? "done" : extensionReady ? "next" : "waiting",
    },
    {
      title: "Review your summary",
      body: "Once the first sync lands, Atlas will take you to your dashboard and recommended next actions.",
      status: syncComplete ? "next" : "waiting",
    },
  ];

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <div className="animate-stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:gap-8">
          <section className="relative overflow-hidden rounded-[2rem] border border-subtle bg-surface-2/92 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur md:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(620px 220px at 16% 0%, rgba(0,113,227,0.12), transparent 68%), radial-gradient(520px 260px at 100% 22%, rgba(22,163,74,0.10), transparent 70%)",
              }}
            />

            <div className="relative space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-1/90 px-3 py-1 text-[11px] font-medium text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                Setup Atlas
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    First session
                  </p>
                  <h1 className="max-w-2xl text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.04em] text-primary md:text-[3.4rem]">
                  Connect your ePortfolio once. Get your ARCP picture clearly.
                  </h1>
                </div>
                <p className="max-w-[44rem] text-[15px] leading-7 text-secondary md:text-[17px]">
                  Atlas is best when it can see your portfolio. We&apos;ll guide you through
                  extension setup, ePortfolio sync, and your first summary so you&apos;re never guessing
                  what to do next.
                </p>
              </div>

              <div className="grid gap-3 rounded-[1.5rem] border border-subtle bg-surface-1/88 p-4 backdrop-blur md:grid-cols-3 md:p-5">
                {[
                  { label: "Import", value: "Entries, CiPs, profile context" },
                  { label: "Time", value: connected ? "About 1 to 3 minutes" : "Usually under 3 minutes" },
                  { label: "Outcome", value: "Readiness signals and next actions" },
                ].map((item) => (
                  <div key={item.label} className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      {item.label}
                    </p>
                    <p className="text-[13px] font-medium leading-6 text-primary">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {!extensionReady ? (
                <div className="rounded-[1.75rem] border border-subtle bg-surface-1/92 p-6">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Step 1
                    </p>
                    <h2 className="text-[1.35rem] font-semibold tracking-[-0.025em] text-primary">
                      Install the Atlas extension
                    </h2>
                    <p className="max-w-xl text-[14px] leading-6 text-secondary">
                      Start here. The extension handles ePortfolio sync and lets Atlas bring your
                      portfolio into one place.
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={CHROME_EXTENSION_INSTALL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-sm font-medium text-[var(--surface-1)] transition hover:opacity-90"
                    >
                      Install Chrome extension
                    </a>
                    <Link
                      href={connectHref}
                      className="rounded-full border border-subtle bg-surface-2 px-5 py-2.5 text-sm font-medium text-primary transition hover:bg-surface-3"
                    >
                      I already installed it
                    </Link>
                  </div>
                </div>
              ) : !syncComplete ? (
                <div className="rounded-[1.75rem] border border-emerald-300/35 bg-surface-1/92 p-6">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Step 2
                    </p>
                    <h2 className="text-[1.35rem] font-semibold tracking-[-0.025em] text-primary">
                      Atlas is connected
                    </h2>
                    <p className="max-w-xl text-[14px] leading-6 text-secondary">
                      Open your RCOG ePortfolio, then click <span className="font-semibold text-primary">Sync Everything</span> in the Atlas extension popup.
                      We&apos;ll keep checking here and move you into your dashboard once the first sync arrives.
                    </p>
                  </div>
                  <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                    {[
                      "Open your RCOG ePortfolio",
                      "Click the Atlas extension",
                      "Press Sync Everything",
                    ].map((instruction, index) => (
                      <div key={instruction} className="rounded-[1.25rem] border border-subtle bg-surface-2/92 p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                          Step {index + 1}
                        </p>
                        <p className="mt-2 text-[13px] font-medium leading-5 text-primary">{instruction}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-emerald-300/35 bg-surface-1/92 p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Ready
                  </p>
                  <h2 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.025em] text-primary">
                    Your first sync is in
                  </h2>
                  <p className="mt-2 max-w-xl text-[14px] leading-6 text-secondary">
                    Atlas has what it needs to build your first summary. Continue to the dashboard
                    to review your next actions and portfolio signals.
                  </p>
                </div>
              )}

              <SetupAutoRefresh enabled={extensionReady && !syncComplete} />
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-subtle bg-surface-2/92 p-6 backdrop-blur">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Progress
                </p>
                <h2 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-primary">
                  {completedCount}/5 complete
                </h2>
                <p className="text-[13px] leading-6 text-secondary">
                  Active now: {activeStep}
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {steps.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        step.status === "done"
                          ? "bg-emerald-300/15 text-emerald-700"
                          : step.status === "next"
                            ? "bg-blue-500/12 text-blue-700"
                            : "bg-surface-3 text-muted",
                      ].join(" ")}
                    >
                          {step.status === "done" ? "✓" : index + 1}
                    </span>
                    <div className="min-w-0 flex-1 border-l border-subtle pl-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-semibold leading-5 text-primary">{step.title}</p>
                        <StepBadge status={step.status} />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-subtle bg-surface-2/92 p-6 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                After sync
              </p>
              <h2 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-primary">
                What Atlas will show you
              </h2>
              <ul className="mt-4 space-y-3">
                {[
                  "Atlas imports your recent entries and profile context.",
                  "Your dashboard highlights next actions and readiness signals.",
                  "You can review suggested skills or jump straight into Progress Hub.",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
                    <span className="text-xs leading-relaxed text-secondary">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function stepsCompleteCount(extensionReady: boolean, syncComplete: boolean) {
  let completed = 1;
  if (extensionReady) completed += 2;
  if (syncComplete) completed += 1;
  return completed;
}
