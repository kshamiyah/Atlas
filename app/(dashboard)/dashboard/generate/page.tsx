import { Suspense } from "react";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GenerateForm } from "@/components/generate/GenerateForm";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

export default async function GeneratePage() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !bypassAuth) redirect("/login");

  return (
    <div className="min-h-full">
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
        <header className="rounded-2xl border border-subtle bg-surface-2 px-4 py-4 md:px-5 md:py-5">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
              Writing workspace
            </p>
            <h1 className="text-heading-2 font-semibold text-primary md:text-heading-1">
              Write an entry
            </h1>
            <p className="max-w-2xl text-small text-secondary">
              Describe your case in plain language. Atlas structures it for Kaizen and
              suggests key skills to link.
            </p>
          </div>
          <ol className="mt-4 flex flex-wrap gap-2 text-[11px]">
            {[
              "Choose entry type",
              "Describe the case",
              "Generate & copy to Kaizen",
            ].map((step, index) => (
              <li
                key={step}
                className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-secondary"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </header>

        <Suspense fallback={<div className="text-small text-muted">Loading…</div>}>
          <GenerateForm />
        </Suspense>
      </main>
    </div>
  );
}
