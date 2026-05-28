import Link from "next/link";

/**
 * Shown after extension flow login. Extension content script on this page
 * fetches /api/auth/session and stores the token in chrome.storage.
 * This page just tells the user to close the tab.
 */
type ExtensionDonePageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function ExtensionDonePage({
  searchParams,
}: ExtensionDonePageProps) {
  const params = await searchParams;
  const nextHref =
    params.next && params.next.startsWith("/") ? params.next : "/dashboard/setup?connected=1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-lg">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Atlas is connected
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
            Your sign-in is ready for the extension. Next, return to your RCOG ePortfolio and run your
            first sync so Atlas can build your portfolio summary.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            "Return to your RCOG ePortfolio",
            "Open the Atlas extension popup",
            "Press Sync Everything",
          ].map((step, index) => (
            <div
              key={step}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Step {index + 1}
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-slate-200">
                {step}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={nextHref}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
          >
            Open setup checklist
          </Link>
          <Link
            href="/dashboard/setup?connected=1"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/60"
          >
            Back to Atlas
          </Link>
        </div>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          If the extension did not receive the token, reopen the extension popup and try
          &quot;Connect to Atlas&quot; again.
        </p>
      </div>
    </main>
  );
}
