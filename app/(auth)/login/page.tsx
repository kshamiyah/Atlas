import { getServerSupabaseClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginHashSessionBridge } from "@/components/auth/LoginHashSessionBridge";

type LoginPageProps = {
  searchParams: Promise<{ source?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const isExtension = params.source === "extension";

  if (user) {
    redirect(isExtension ? "/auth/extension-done" : "/dashboard");
  }

  async function sendMagicLink(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim();
    if (!email) return;

    const supabase = await getServerSupabaseClient();
    const reqHeaders = await headers();
    const host =
      reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
    const protocol = reqHeaders.get("x-forwarded-proto") ?? "http";
    const requestOrigin = host ? `${protocol}://${host}` : null;
    const origin =
      process.env.SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      requestOrigin;
    if (!origin) {
      console.error(
        "[login] Missing SITE_URL/NEXT_PUBLIC_SITE_URL and could not infer request origin.",
      );
      return;
    }
    const source = formData.get("source");
    const base = `${origin}/auth/callback`;
    const callbackUrl =
      source === "extension" ? `${base}?source=extension` : base;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      console.error("[login] Failed to send magic link:", error.message);
    }
  }

  return (
    <main className="flex min-h-screen">
      <LoginHashSessionBridge />
      {/* ── Left panel — branded hero ─────────────────────────────────────── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex lg:w-[55%]"
        style={{
          background:
            "linear-gradient(135deg, #0f0e0d 0%, #161514 55%, #1c1b1a 100%)",
        }}
      >
        {/* Subtle noise vignette — no colour */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 15% 60%, rgba(255,255,255,0.025), transparent 65%)",
          }}
        />
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold shadow-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#1c1b1a" }}
          >
            P
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            PortfolioIQ
          </span>
        </div>

        {/* Main hero content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.40)" }}
            >
              RCOG Portfolio Tracker
            </p>
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">
              Track every entry.
              <br />
              Own your ARCP.
            </h2>
            <p className="max-w-sm text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              The intelligent portfolio companion for RCOG trainees — built to
              cut review time and surface the evidence that matters.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-3">
            {[
              "Syncs directly from Kaizen — no manual entry",
              "AI matches entries to key skills & descriptors",
              "Gap report by training stage, ready in seconds",
            ].map((text) => (
              <li key={text} className="flex items-start gap-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 shrink-0"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom quote */}
        <div
          className="relative z-10 rounded-xl p-4"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-sm italic leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            &ldquo;Designed for the way trainees actually work — not the way
            deaneries wish they did.&rdquo;
          </p>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div
        className="flex flex-1 flex-col items-center justify-center px-6 py-12"
        style={{ backgroundColor: "var(--surface-1)" }}
      >
        {/* Mobile logo (hidden on desktop) */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold bg-accent-primary"
            style={{ color: "var(--surface-1)" }}
          >
            P
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            PortfolioIQ
          </span>
        </div>

        <div className="w-full max-w-sm animate-fade-up space-y-7">
          {/* Heading */}
          <div className="space-y-2">
            <h1
              className="text-[34px] font-bold leading-tight"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.022em" }}
            >
              Welcome back
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Enter your email and we&apos;ll send you a sign-in link instantly.
            </p>
          </div>

          {/* Form */}
          <form action={sendMagicLink} className="space-y-3">
            {isExtension && (
              <input type="hidden" name="source" value="extension" />
            )}

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="login-input w-full rounded-xl px-4 py-3.5 text-[15px] outline-none transition"
              placeholder="you@nhs.net"
            />

            <button type="submit" className="btn-primary w-full py-3.5 text-[15px]">
              Send magic link →
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              No password needed
            </span>
            <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
          </div>

          <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
            For RCOG trainees only.{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              Check your inbox after submitting.
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
