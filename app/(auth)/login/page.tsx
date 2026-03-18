import { getServerSupabaseClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-slate-300">
          Magic link only for now. Enter your email and check your inbox.
        </p>

        <form action={sendMagicLink} className="space-y-4">
          {isExtension && (
            <input type="hidden" name="source" value="extension" />
          )}
          <div className="space-y-1 text-sm">
            <label htmlFor="email" className="block text-slate-200">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
          >
            Send magic link
          </button>
        </form>
      </div>
    </main>
  );
}
