import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Nav */}
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">
            PortfolioIQ
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-400">
          For RCOG trainees
        </p>
        <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-5xl">
          Your ARCP dashboard,{" "}
          <span className="text-emerald-400">intelligently built</span>
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-slate-400">
          PortfolioIQ syncs your Kaizen data, visualises your CiP progress and
          key skill gaps, and uses AI to turn rough case notes into polished
          portfolio entries — ready to paste.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Get started free
          </Link>
          <a
            href="https://github.com/kshamiyah/PortfolioIQ"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
          >
            View on GitHub
          </a>
        </div>
      </main>

      {/* Feature cards */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="mb-3 text-2xl">🔄</div>
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              One-click sync
            </h2>
            <p className="text-xs leading-relaxed text-slate-400">
              Install the Chrome extension and push your Kaizen CiP assessments,
              mini-CEX records, and procedure logbook straight into your
              dashboard.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="mb-3 text-2xl">📊</div>
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              ARCP analytics
            </h2>
            <p className="text-xs leading-relaxed text-slate-400">
              See exactly which CiPs need more evidence, which key skills you
              haven't logged yet, and where your portfolio stands — at a glance.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="mb-3 text-2xl">✨</div>
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              AI entry generator
            </h2>
            <p className="text-xs leading-relaxed text-slate-400">
              Describe a case in plain English. GPT-4o expands it into a
              structured portfolio entry for every field in Kaizen — then the
              extension pastes it for you.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-600">
        PortfolioIQ is an independent tool and is not affiliated with RCOG or
        Kaizen.
      </footer>
    </div>
  );
}
