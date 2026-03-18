type Stat = {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "green" | "amber" | "blue" | "default";
};

function StatCard({ label, value, sub, accent = "default" }: Stat) {
  const valueClass =
    accent === "green"
      ? "text-accent-green"
      : accent === "amber"
        ? "text-accent-amber"
        : accent === "blue"
          ? "text-accent-blue"
          : "text-primary";

  return (
    <div className="card-interactive flex flex-col gap-0.5 rounded-xl border border-subtle bg-surface-2 px-4 py-3.5">
      <span className="text-micro text-muted">{label}</span>
      <span
        className={`text-heading-2 font-bold tabular-nums leading-tight ${valueClass}`}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

type DashboardStatsRowProps = {
  totalEntries: number;
  confirmedSkills: number;
  cipsInProgress: number;
  totalCips: number;
  entriesThisWeek: number;
  isLoading?: boolean;
};

export function DashboardStatsRow({
  totalEntries,
  confirmedSkills,
  cipsInProgress,
  totalCips,
  entriesThisWeek,
  isLoading,
}: DashboardStatsRowProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[78px] animate-pulse rounded-xl bg-surface-3" />
        ))}
      </div>
    );
  }

  const weekAccent =
    entriesThisWeek >= 3 ? "green" : entriesThisWeek >= 1 ? "amber" : "default";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total entries"
        value={totalEntries}
        sub="synced from Kaizen"
      />
      <StatCard
        label="Confirmed skills"
        value={confirmedSkills}
        sub="key skills with evidence"
        accent="green"
      />
      <StatCard
        label="CiPs in progress"
        value={totalCips > 0 ? `${cipsInProgress}/${totalCips}` : "—"}
        sub="at least 1 confirmed skill"
        accent={
          cipsInProgress === totalCips && totalCips > 0
            ? "green"
            : cipsInProgress > 0
              ? "blue"
              : "default"
        }
      />
      <StatCard
        label="This week"
        value={entriesThisWeek}
        sub="new entries"
        accent={weekAccent}
      />
    </div>
  );
}
