export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="text-lg font-semibold tracking-tight">
          PortfolioIQ · Health Check
        </h1>
        <p className="text-sm text-slate-300">
          Backend and auth foundation for RCOG portfolio analytics. No UI yet –
          this page only exists to confirm the app and Supabase client are
          wired up.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-300">
          <li>· Next.js App Router (TypeScript, Tailwind)</li>
          <li>· Supabase client/SSR helpers configured</li>
          <li>· Auth routes and dashboard shell scaffolded</li>
        </ul>
      </div>
    </main>
  );
}

