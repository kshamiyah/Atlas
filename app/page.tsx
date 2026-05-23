import Link from "next/link";

export default function HomePage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--surface-1)", color: "var(--text-primary)" }}
    >
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-10 px-6 py-3.5 backdrop-blur-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface-1) 85%, transparent)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
              style={{
                backgroundColor: "var(--accent-primary)",
                color: "var(--surface-1)",
              }}
            >
              A
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Atlas
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign in
            </Link>
            <Link href="/login" className="btn-primary text-xs px-3 py-1.5">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-20 text-center">
        {/* Eyebrow pill */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: "var(--surface-3)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--accent-green)" }}
          />
          Built for RCOG trainees
        </div>

        <h1
          className="mb-5 text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl"
          style={{ color: "var(--text-primary)" }}
        >
          Your ARCP readiness,
          <br />
          at a glance.
        </h1>

        <p
          className="mx-auto mb-10 max-w-xl text-lg leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Atlas syncs your Kaizen data, maps entries to key skills, and
          surfaces exactly where your portfolio needs work — before your ARCP does.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="btn-primary px-5 py-2.5 text-sm">
            Get started free →
          </Link>
          <a
            href="https://github.com/kshamiyah/PortfolioIQ"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary px-5 py-2.5 text-sm"
          >
            View on GitHub
          </a>
        </div>
      </main>

      {/* ── Feature cards ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: "⚡",
              title: "One-click sync",
              body: "Install the Chrome extension and push your Kaizen entries — CiP assessments, mini-CEX, procedure logbook — straight into your dashboard.",
            },
            {
              icon: "📊",
              title: "ARCP gap report",
              body: "See exactly which CiPs need more evidence, which key skills are unconfirmed, and where your portfolio stands — filtered by training stage.",
            },
            {
              icon: "✦",
              title: "AI entry generator",
              body: "Describe a case in plain English. GPT-4o expands it into a structured Kaizen entry with every field filled — ready to paste.",
            },
          ].map((f) => (
            <div key={f.title} className="card p-6">
              <div
                className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl text-base"
                style={{
                  backgroundColor: "var(--surface-3)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {f.icon}
              </div>
              <h2
                className="mb-2 text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {f.title}
              </h2>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section
        className="border-y px-6 py-16"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="mx-auto max-w-3xl">
          <p
            className="mb-2 text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            How it works
          </p>
          <h2
            className="mb-12 text-center text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            From Kaizen to ARCP-ready in minutes
          </h2>

          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Sync your entries",
                body: "Install the extension, open Kaizen, hit Sync. All your entries land in Atlas automatically.",
              },
              {
                step: "02",
                title: "Review AI matches",
                body: "The matcher links each entry to key skills and descriptors. Confirm, reject, or add your own in one pass.",
              },
              {
                step: "03",
                title: "See your gaps",
                body: "The gap report shows exactly which CiPs and key skills need evidence — filtered to your current training stage.",
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col gap-3">
                <span
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: "var(--border-emphasis)" }}
                >
                  {s.step}
                </span>
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA strip ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2
          className="mb-3 text-2xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Ready to own your ARCP?
        </h2>
        <p
          className="mb-8 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Free to use. No password required.
        </p>
        <Link href="/login" className="btn-primary px-6 py-3 text-sm">
          Get started free →
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="px-6 py-6 text-center text-xs"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Atlas is an independent tool and is not affiliated with RCOG or Kaizen.
      </footer>
    </div>
  );
}
