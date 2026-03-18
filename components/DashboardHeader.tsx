"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type DashboardHeaderProps = {
  userEmail: string | undefined;
};

export function DashboardHeader({ userEmail }: DashboardHeaderProps) {
  const router = useRouter();

  async function signOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight text-slate-50">
          PortfolioIQ
        </h1>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-xs text-slate-400">{userEmail}</span>
          )}
          <Link
            href="/dashboard/generate"
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Generate
          </Link>
          <Link
            href="/dashboard/key-skill-review"
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Key Skills
          </Link>
          <Link
            href="/dashboard/gap-report"
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Gap report
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
