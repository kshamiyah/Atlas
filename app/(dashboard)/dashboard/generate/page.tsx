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
        <header className="relative overflow-hidden rounded-3xl border border-subtle bg-surface-2 p-6 md:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(640px 210px at 15% -10%, rgba(0,113,227,0.15), transparent 70%), radial-gradient(520px 180px at 85% 0%, rgba(124,58,237,0.10), transparent 75%)",
            }}
          />
          <div className="relative space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              AI Writing Workspace
            </p>
            <h1 className="text-heading-1 font-semibold text-primary">
              Generate Entry
            </h1>
            <p className="max-w-3xl text-small leading-relaxed text-secondary">
              Use the left panel to set structure and targets, then describe your case.
              The generated output on the right is editable and ready to copy into Kaizen.
            </p>
          </div>
        </header>

        <GenerateForm />
      </main>
    </div>
  );
}
