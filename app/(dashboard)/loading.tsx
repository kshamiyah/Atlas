export default function DashboardLoading() {
  return (
    <div className="min-h-full animate-pulse">
      <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">
        <div className="flex flex-col gap-5 md:gap-6">
          <header className="space-y-3 border-b border-subtle pb-5">
            <div className="h-3 w-20 rounded bg-surface-3" />
            <div className="h-10 w-64 max-w-full rounded bg-surface-3" />
            <div className="h-4 w-full max-w-xl rounded bg-surface-3" />
            <div className="flex flex-wrap gap-2 pt-1">
              <div className="h-8 w-28 rounded-lg bg-surface-3" />
              <div className="h-8 w-36 rounded-lg bg-surface-3" />
              <div className="h-8 w-32 rounded-lg bg-surface-3" />
            </div>
          </header>

          <div className="rounded-[1.75rem] border border-subtle bg-surface-2/92 p-6">
            <div className="h-3 w-32 rounded bg-surface-3" />
            <div className="mt-4 h-8 w-4/5 max-w-md rounded bg-surface-3" />
            <div className="mt-3 h-4 w-full max-w-lg rounded bg-surface-3" />
            <div className="mt-6 flex gap-2">
              <div className="h-9 w-28 rounded-full bg-surface-3" />
              <div className="h-9 w-32 rounded-full bg-surface-3" />
            </div>
          </div>

          <div className="rounded-lg border border-subtle bg-surface-2/92 p-4">
            <div className="flex flex-wrap gap-3">
              <div className="h-6 w-24 rounded bg-surface-3" />
              <div className="h-6 w-20 rounded bg-surface-3" />
              <div className="h-6 w-28 rounded bg-surface-3" />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-subtle bg-surface-2/92">
            <div className="h-48 bg-surface-3/80" />
          </div>

          <div className="overflow-hidden rounded-lg border border-subtle bg-surface-2/92">
            <div className="border-b border-subtle px-5 py-4">
              <div className="h-4 w-36 rounded bg-surface-3" />
            </div>
            <div className="space-y-3 p-5">
              <div className="h-10 rounded bg-surface-3" />
              <div className="h-10 rounded bg-surface-3" />
              <div className="h-10 rounded bg-surface-3" />
            </div>
          </div>

          <div className="rounded-lg border border-subtle bg-surface-2/92 p-5">
            <div className="h-4 w-40 rounded bg-surface-3" />
            <div className="mt-4 h-24 rounded bg-surface-3" />
          </div>
        </div>
      </main>
    </div>
  );
}
