import type { GapReportCip } from "@/lib/types/gap-report";

type Status = "on-track" | "attention" | "at-risk";

function computeStatus(cips: GapReportCip[]): {
  status: Status;
  pct: number;
  worstCips: string[];
} {
  const total = cips.reduce((s, c) => s + c.total_skills, 0);
  const confirmed = cips.reduce((s, c) => s + c.confirmed_skills, 0);
  const pct = total === 0 ? 0 : Math.round((confirmed / total) * 100);

  const worstCips = [...cips]
    .filter((c) => c.coverage_pct < 50)
    .sort((a, b) => a.coverage_pct - b.coverage_pct)
    .slice(0, 3)
    .map((c) => `CiP ${c.cip_number}`);

  const status: Status =
    pct >= 70 ? "on-track" : pct >= 40 ? "attention" : "at-risk";

  return { status, pct, worstCips };
}

const STATUS_CONFIG = {
  "on-track": {
    bar: "bg-accent-green",
    bg: "bg-accent-green/[0.06]",
    border: "border-accent-green/25",
    dot: "bg-accent-green",
    label: "On Track",
    labelColor: "text-accent-green",
    message(worstCips: string[], pct: number) {
      return `${pct}% of key skills confirmed. You're making solid progress — keep logging regularly.`;
    },
  },
  attention: {
    bar: "bg-accent-amber",
    bg: "bg-accent-amber/[0.06]",
    border: "border-accent-amber/25",
    dot: "bg-accent-amber",
    label: "Needs Attention",
    labelColor: "text-accent-amber",
    message(worstCips: string[], pct: number) {
      return worstCips.length > 0
        ? `${worstCips.join(", ")} ${worstCips.length === 1 ? "lacks" : "lack"} sufficient confirmed skills. Focus your evidence here before ARCP.`
        : `${pct}% of key skills confirmed. Several CiPs need more evidence before ARCP.`;
    },
  },
  "at-risk": {
    bar: "bg-accent-red",
    bg: "bg-accent-red/[0.06]",
    border: "border-accent-red/25",
    dot: "bg-accent-red",
    label: "At Risk",
    labelColor: "text-accent-red",
    message(_worstCips: string[], pct: number) {
      return `Fewer than half your key skills are confirmed (${pct}%). ARCP readiness is low — review your evidence now.`;
    },
  },
} as const;

type Props = {
  cips: GapReportCip[];
  isLoading: boolean;
};

export function TrafficLightCard({ cips, isLoading }: Props) {
  if (isLoading || cips.length === 0) return null;

  const { status, pct, worstCips } = computeStatus(cips);
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:gap-4 ${cfg.bg} ${cfg.border}`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${cfg.bar}`} />

      {/* Status dot */}
      <div className={`ml-1 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full sm:ml-2 sm:mt-0 ${cfg.dot}`} />

      {/* Message */}
      <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-small font-semibold ${cfg.labelColor}`}>
          {cfg.label}
        </span>
        <span className="text-small text-secondary">
          {cfg.message(worstCips, pct)}
        </span>
      </div>

      {/* CTA */}
      <a
        href="/dashboard/gap-report"
        className="btn-secondary w-fit shrink-0 px-3 py-1.5 text-micro"
      >
        View Gap Report →
      </a>
    </div>
  );
}
