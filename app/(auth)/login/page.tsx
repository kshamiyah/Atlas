import { getServerSupabaseClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/auth/LoginPanel";
import type { LoginFormState } from "@/lib/auth/login-form-state";

type LoginPageProps = {
  searchParams: Promise<{ source?: string; redirectTo?: string; next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  const isExtension = params.source === "extension";
  const requestedNext = params.redirectTo ?? params.next ?? null;
  const safeNext =
    requestedNext && requestedNext.startsWith("/") ? requestedNext : null;

  if (user) {
    if (isExtension) {
      const extensionDoneUrl = safeNext
        ? `/auth/extension-done?next=${encodeURIComponent(safeNext)}`
        : "/auth/extension-done";
      redirect(extensionDoneUrl);
    }
    redirect("/dashboard");
  }

  async function sendMagicLink(
    _prevState: LoginFormState,
    formData: FormData,
  ): Promise<LoginFormState> {
    "use server";

    const email = String(formData.get("email") || "").trim();
    if (!email) {
      return { status: "error", message: "Enter your email address to continue." };
    }

    const supabase = await getServerSupabaseClient();
    const reqHeaders = await headers();
    const host =
      reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
    const protocol = reqHeaders.get("x-forwarded-proto") ?? "http";
    const requestOrigin = host ? `${protocol}://${host}` : null;
    const configuredOrigin =
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
    const origin =
      process.env.NODE_ENV === "production"
        ? configuredOrigin ?? requestOrigin
        : requestOrigin ?? configuredOrigin;
    if (!origin) {
      console.error(
        "[login] Missing SITE_URL/NEXT_PUBLIC_SITE_URL and could not infer request origin.",
      );
      return {
        status: "error",
        message:
          "Sign-in is temporarily unavailable. Please try again in a few minutes.",
      };
    }
    const source = formData.get("source");
    const nextRaw = String(formData.get("next") || "").trim();
    const nextValue = nextRaw.startsWith("/") ? nextRaw : "";
    const callbackUrl = new URL("/auth/callback", origin);
    if (source === "extension") {
      callbackUrl.searchParams.set("source", "extension");
    }
    if (nextValue) {
      callbackUrl.searchParams.set("next", nextValue);
    }
    console.log("[login] magic link redirect debug", {
      host,
      protocol,
      requestOrigin,
      configuredOrigin,
      chosenOrigin: origin,
      callbackUrl: callbackUrl.toString(),
      source: source === "extension" ? "extension" : "web",
      nextValue: nextValue || null,
    });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      console.error("[login] Failed to send magic link:", error.message);
      return {
        status: "error",
        message:
          error.message ||
          "We couldn't send your sign-in link. Check the email address and try again.",
      };
    }

    return { status: "success", email };
  }

  return (
    <main className="flex min-h-screen">
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
            A
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            Atlas
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
              "Syncs directly from ePortfolio — no manual entry",
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
            A
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Atlas
          </span>
        </div>

        <LoginPanel
          sendMagicLink={sendMagicLink}
          isExtension={isExtension}
          safeNext={safeNext}
          authCallbackError={params.error}
        />
      </div>
    </main>
  );
}
