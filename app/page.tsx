import Link from "next/link";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingOutcomes } from "@/components/landing/LandingOutcomes";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { CHROME_EXTENSION_INSTALL_URL } from "@/lib/constants/extension";

const STEPS = [
  {
    step: "01",
    title: "Connect ePortfolio",
    body: "Install the Atlas extension, sign in once, and sync your portfolio from any ePortfolio tab.",
  },
  {
    step: "02",
    title: "Review AI matches",
    body: "Confirm or adjust key-skill links Atlas suggests for each entry — one pass through the review queue.",
  },
  {
    step: "03",
    title: "Act on your gaps",
    body: "Progress Hub ranks what to do next across CiPs, OSATS, courses, and exams before your ARCP.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-surface-1 text-primary">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 420px at 18% -8%, rgba(0,113,227,0.09), transparent 62%), radial-gradient(900px 360px at 88% 4%, rgba(22,163,74,0.07), transparent 58%)",
        }}
      />

      <LandingNav />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-10 pt-12 md:px-6 md:pb-14 md:pt-16">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-2/90 px-3 py-1.5 text-[11px] font-medium text-secondary backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
            Built for RCOG O&amp;G trainees
          </div>

          <h1 className="text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] text-primary sm:text-5xl md:text-[3.4rem]">
            Your ARCP readiness,{" "}
            <span className="text-accent-blue">at a glance.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-secondary md:text-[17px]">
            Atlas syncs your RCOG ePortfolio, maps entries to key skills, and tells you exactly
            where to focus — before your ARCP panel does.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn-primary px-5 py-2.5 text-sm">
              Get started free →
            </Link>
            <a href="#product-showcase" className="btn-secondary px-5 py-2.5 text-sm">
              See Atlas in action
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Free to use
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Magic-link sign in
            </span>
            <a
              href={CHROME_EXTENSION_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-secondary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <line x1="21.17" y1="8" x2="12" y2="8" />
                <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
              </svg>
              Chrome extension required
            </a>
          </div>
        </div>

        <div id="product-showcase" className="mt-12 md:mt-16">
          <ProductShowcase />
        </div>
      </section>

      <LandingOutcomes />

      {/* How it works */}
      <section id="how-it-works" className="relative px-5 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              How it works
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-primary md:text-3xl">
              From ePortfolio to ARCP-ready in minutes
            </h2>
          </div>

          <div className="relative grid gap-6 md:grid-cols-3 md:gap-5">
            <div
              aria-hidden
              className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-8 hidden h-px md:block"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--border-emphasis), var(--border-emphasis), transparent)",
              }}
            />

            {STEPS.map((step, index) => (
              <article
                key={step.step}
                className="relative rounded-[1.5rem] border border-subtle bg-surface-2/90 p-6 backdrop-blur md:p-7"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{
                      background: "rgba(0,113,227,0.10)",
                      color: "var(--accent-blue)",
                      border: "1px solid rgba(0,113,227,0.20)",
                    }}
                  >
                    {step.step}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted md:hidden">
                      Step {index + 1} of 3
                    </span>
                  ) : null}
                </div>
                <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-primary">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-secondary">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20 pt-4 md:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-subtle bg-surface-2/95 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(620px 220px at 20% 0%, rgba(0,113,227,0.12), transparent 68%), radial-gradient(520px 260px at 100% 40%, rgba(22,163,74,0.10), transparent 70%)",
            }}
          />
          <div className="relative space-y-5">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-primary md:text-3xl">
              Ready to own your ARCP?
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-secondary">
              Sign in with your email, connect your ePortfolio once, and get a clear picture of where your
              portfolio stands today.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="btn-primary px-6 py-3 text-sm">
                Get started free →
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-sm">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-subtle px-5 py-8 md:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted">
            Atlas is an independent tool and is not affiliated with or endorsed by the RCOG.
          </p>
          <a
            href="https://github.com/kshamiyah/PortfolioIQ"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-secondary transition-colors hover:text-primary"
          >
            View on GitHub →
          </a>
        </div>
      </footer>
    </div>
  );
}
