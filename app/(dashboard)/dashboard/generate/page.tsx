import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/DashboardHeader";
import { GenerateForm } from "@/components/generate/GenerateForm";

export default async function GeneratePage() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <DashboardHeader userEmail={user.email} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Generate entry
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Describe a clinical experience in plain language. The AI will expand
            it into a structured portfolio entry ready to copy into Kaizen.
          </p>
        </div>
        <GenerateForm />
      </main>
    </div>
  );
}
