export function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Bulk actions skeleton */}
      <div className="card animate-pulse p-4 space-y-3">
        <div className="h-3.5 w-24 rounded bg-surface-4" />
        <div className="h-3 w-64 rounded bg-surface-4" />
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="h-8 w-56 rounded-lg bg-surface-4" />
          <div className="h-8 w-40 rounded-lg bg-surface-4" />
          <div className="h-8 w-64 rounded-lg bg-surface-4" />
        </div>
      </div>

      {/* Coverage summary skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-3 space-y-2">
            <div className="h-3 w-20 rounded bg-surface-4" />
            <div className="h-7 w-10 rounded bg-surface-4" />
          </div>
        ))}
      </div>

      {/* Filter skeleton */}
      <div className="card animate-pulse p-4 space-y-3">
        <div className="h-3.5 w-20 rounded bg-surface-4" />
        <div className="flex gap-3">
          <div className="h-8 flex-1 rounded-lg bg-surface-4" />
          <div className="h-8 w-32 rounded-lg bg-surface-4" />
          <div className="h-8 w-32 rounded-lg bg-surface-4" />
          <div className="h-8 w-32 rounded-lg bg-surface-4" />
        </div>
      </div>

      {/* Review card skeletons */}
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
  );
}
