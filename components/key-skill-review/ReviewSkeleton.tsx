export function ReviewSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="card animate-pulse p-4 space-y-3">
          <div className="h-3.5 w-24 rounded bg-surface-4" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-surface-1 p-3">
                <div className="h-3 w-16 rounded bg-surface-4" />
                <div className="h-6 w-10 rounded bg-surface-4" />
              </div>
            ))}
          </div>
        </div>

        <div className="card animate-pulse p-4 space-y-3">
          <div className="h-3.5 w-20 rounded bg-surface-4" />
          <div className="h-8 w-full rounded-lg bg-surface-4" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-8 rounded-lg bg-surface-4" />
            <div className="h-8 rounded-lg bg-surface-4" />
            <div className="h-8 rounded-lg bg-surface-4" />
          </div>
        </div>

        <div className="card animate-pulse p-4 space-y-3">
          <div className="h-3.5 w-24 rounded bg-surface-4" />
          <div className="h-3 w-48 rounded bg-surface-4" />
          <div className="space-y-2">
            <div className="h-8 rounded-lg bg-surface-4" />
            <div className="h-8 rounded-lg bg-surface-4" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="animate-pulse rounded-xl border border-subtle bg-surface-2 px-4 py-3">
          <div className="h-3 w-44 rounded bg-surface-4" />
        </div>

        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card animate-pulse p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-2/3 rounded bg-surface-4" />
              <div className="h-4 w-4 rounded bg-surface-4" />
            </div>
            <div className="h-3 w-1/3 rounded bg-surface-4" />
            <div className="flex gap-2">
              <div className="h-5 w-24 rounded-full bg-surface-4" />
              <div className="h-5 w-16 rounded-full bg-surface-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
