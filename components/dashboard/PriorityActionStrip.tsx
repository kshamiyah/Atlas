import type { GapReportCip } from "@/lib/types/gap-report";

type Action = {
  priority: "high" | "medium" | "low";
  title: string;
  sub: string;
  href: string;
  cta: string;
};

const PRIORITY_STYLES = {
  high: { color: "var(--accent-red)", bg: "rgba(239,68,68,0.10)" },
  medium: { color: "var(--accent-amber)", bg: "rgba(245,158,11,0.10)" },
  low: { color: "var(--accent-blue)", bg: "rgba(0,113,227,0.10)" },
} as const;

function buildActions(cips: GapReportCip[], pendingSuggestionCount: number): Action[] {
  const actions: Action[] = [];
  const normalized = cips.map((cip) => ({
    ...cip,
    coverage_pct: Math.round(Math.min(100, Math.max(0, cip.coverage_pct))),
  }));
  const sorted = [...normalized].sort((a, b) => a.coverage_pct - b.coverage_pct);

  const notStarted = sorted.filter((c) => c.coverage_pct === 0);
  if (notStarted.length > 0) {
    const names = notStarted
      .slice(0, 2)
      .map((c) => `CiP ${c.cip_number}`)
      .join(" and ");
    actions.push({
      priority: "high",
      title: `${names} ${notStarted.length === 1 ? "has" : "have"} no confirmed skills yet`,
      sub: `${notStarted.length} CiP${notStarted.length > 1 ? "s" : ""} at 0% — start here to move the needle fast.`,
      href: "/dashboard/key-skill-review",
      cta: "Review Skills",
    });
  }

  const struggling = sorted.filter((c) => c.coverage_pct > 0 && c.coverage_pct < 50);
  if (struggling.length > 0) {
    const worst = struggling[0];
    const needed = worst.total_skills - worst.confirmed_skills;
    actions.push({
      priority: "medium",
      title: `CiP ${worst.cip_number} needs ${needed} more confirmed skill${needed !== 1 ? "s" : ""}`,
      sub: `Currently ${worst.coverage_pct}% complete. ${worst.cip_title}.`,
      href: "/dashboard/gap-report",
      cta: "View Gap Report",
    });
  }

  if (pendingSuggestionCount > 0) {
    actions.push({
      priority: "low",
      title: `${pendingSuggestionCount} key skill suggestion${pendingSuggestionCount !== 1 ? "s" : ""} pending review`,
      sub: "Confirm or reject AI-matched skills to improve your coverage accuracy.",
      href: "/dashboard/key-skill-review",
      cta: "Review Now",
    });
  }

  return actions.slice(0, 3);
}

type Props = {
  cips: GapReportCip[];
  pendingSuggestionCount: number;
  isLoading: boolean;
};

export function PriorityActionStrip({ cips, pendingSuggestionCount, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="card flex h-full flex-col gap-3 p-6">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-3" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-surface-3" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-full animate-pulse rounded bg-surface-3" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-surface-3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (cips.length === 0) return null;

  const allDone = cips.every(
    (c) => Math.round(Math.min(100, Math.max(0, c.coverage_pct))) === 100,
  );
  if (allDone) {
    return (
      <div className="card flex h-full items-center justify-center gap-3 p-6">
        <div className="text-center">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: "rgba(22,163,74,0.10)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-small font-semibold text-primary">All done</p>
          <p className="mt-1 text-micro text-muted">
            All key skills confirmed — you&apos;re ready for ARCP.
          </p>
        </div>
      </div>
    );
  }

  const actions = buildActions(cips, pendingSuggestionCount);
  if (actions.length === 0) return null;

  return (
    <div className="card flex h-full flex-col p-6">
      <div className="mb-5 space-y-1">
        <h3
          className="text-small font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          Next actions
        </h3>
        <p className="max-w-md text-xs leading-5 text-muted">
          Highest-impact tasks to improve coverage without losing time in the detail.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {actions.map((action, i) => {
          const style = PRIORITY_STYLES[action.priority];
          return (
            <div key={i} className="rounded-[1.2rem] border border-subtle bg-surface-1/88 p-4 backdrop-blur">
              <div className="flex gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                style={{ background: style.bg, color: style.color }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-5 text-primary">
                  {action.title}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {action.sub}
                </p>
                <a
                  href={action.href}
                  className="mt-2 inline-block text-[11px] font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--accent-blue)" }}
                >
                  {action.cta} →
                </a>
              </div>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
