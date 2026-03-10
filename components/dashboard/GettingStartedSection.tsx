import Link from "next/link";

const STEPS = [
  {
    label: "Create your account",
    done: true,
  },
  {
    label: "Install the Chrome extension",
    done: false,
    href: "https://chrome.google.com/webstore",
    hrefLabel: "Chrome Web Store →",
  },
  {
    label: 'Open a Kaizen page and click "Sync to PortfolioIQ"',
    done: false,
  },
  {
    label: "Generate your first AI entry",
    done: false,
    href: "/dashboard/generate",
    hrefLabel: "Try it →",
  },
] as const;

export function GettingStartedSection() {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-200">
        Getting started
      </h2>
      <p className="mb-5 text-xs text-slate-500">
        Complete these steps to get the most out of PortfolioIQ.
      </p>

      <ol className="space-y-3">
        {STEPS.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done
                  ? "bg-emerald-900/60 text-emerald-400"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <div>
              <p
                className={`text-xs ${
                  step.done ? "text-slate-500 line-through" : "text-slate-300"
                }`}
              >
                {step.label}
              </p>
              {"href" in step && (
                <Link
                  href={step.href}
                  className="mt-0.5 inline-block text-xs text-emerald-500 hover:text-emerald-400"
                  {...(step.href.startsWith("http")
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
    </section>
  );
}
