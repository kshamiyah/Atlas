import type { GapReportCip } from "@/lib/types/gap-report";

type Action = {
  priority: "high" | "medium" | "low";
  title: string;
  sub: string;
  href: string;
  cta: string;
};

const PRIORITY_STYLES = {
  high: {
    dot: "bg-accent-red",
    text: "text-accent-red",
    border: "border-accent-red/20",
    bg: "bg-accent-red/[0.05]",
  },
  medium: {
    dot: "bg-accent-amber",
    text: "text-accent-amber",
    border: "border-accent-amber/20",
    bg: "bg-accent-amber/[0.05]",
  },
  low: {
    dot: "bg-accent-blue",
    text: "text-accent-blue",
    border: "border-accent-blue/20",
    bg: "bg-accent-blue/[0.05]",
  },
} as const;

function buildActions(cips: GapReportCip[]): Action[] {
  const actions: Action[] = [];

  // Sort by coverage ascending to find worst
  const sorted = [...cips].sort((a, b) => a.coverage_pct - b.coverage_pct);

  // CiPs with 0% (not started)
  const notStarted = sorted.filter((c) => c.coverage_pct === 0);
  if (notStarted.length > 0) {
    const names = notStarted
      .slice(0, 2)
      .map((c) => `CiP ${c.cip_number}`)
      .join(" and ");
    actions.push({
      priority: "high",
      title: `${names} ${notStarted.length === 1 ? "has" : "have"} no confirmed skills yet`,
      sub: `${notStarted.length} CiP${notStarted.length > 1 ? "s" : ""} with 0% evidence — start here to move the needle fast.`,
      href: "/dashboard/key-skill-review",
      cta: "Review Skills",
    });
  }

  // CiPs below 50% (struggling)
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

  // Anything with confirmed < total (suggest reviewing)
  const unconfirmedTotal = cips.reduce(
    (sum, c) => sum + (c.total_skills - c.confirmed_skills),
    0
  );
  if (unconfirmedTotal > 0) {
    actions.push({
      priority: "low",
      title: `${unconfirmedTotal} key skill suggestion${unconfirmedTotal !== 1 ? "s" : ""} pending review`,
      sub: "Confirm or reject AI-matched skills to improve your coverage accuracy.",
      href: "/dashboard/key-skill-review",
      cta: "Review Now",
    });
  }

  return actions.slice(0, 3);
}

type Props = {
  cips: GapReportCip[];
  isLoading: boolean;
};

export function PriorityActionStrip({ cips, isLoading }: Props) {
  if (isLoading || cips.length === 0) return null;

  const actions = buildActions(cips);
  if (actions.length === 0) return null;

  // All confirmed — nothing to do
  const allDone = cips.every((c) => c.coverage_pct === 100);
  if (allDone) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent-green/25 bg-accent-green/[0.06] px-5 py-3.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-small font-medium text-accent-green">
          All key skills confirmed across every CiP — you're ready for ARCP.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-micro font-semibold uppercase tracking-wider text-muted">
        What to do next
      </p>
      <div className="flex flex-col gap-2">
        {actions.map((action, i) => {
          const style = PRIORITY_STYLES[action.priority];
          return (
            <div
              key={i}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${style.bg} ${style.border}`}
            >
              <div className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
              <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-small font-medium text-primary">
                  {action.title}
                </span>
                <span className="text-micro text-secondary">{action.sub}</span>
              </div>
              <a
                href={action.href}
                className="btn-secondary shrink-0 px-3 py-1.5 text-micro"
              >
                {action.cta} →
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
