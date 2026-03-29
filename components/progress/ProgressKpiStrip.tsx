import type { ProgressSummaryResponse } from "@/lib/types/progress";

type Kpis = ProgressSummaryResponse["kpis"];
type Checkpoint = ProgressSummaryResponse["checkpoint"];

function formatPct(pct: number): string {
  return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
}

export function ProgressKpiStrip({
  kpis,
  checkpoint,
}: {
  kpis: Kpis;
  checkpoint: Checkpoint;
}) {
  const items = [
    {
      key: "cips_checkpoint",
      label: "CiP checkpoint readiness",
      sub:
        checkpoint.type === "annual"
          ? "CiPs currently on annual ARCP trajectory"
          : "CiPs meeting current checkpoint standard",
      block: kpis.cips_checkpoint,
      accent: "var(--accent-blue)",
    },
    {
      key: "cips",
      label: "CiPs fully complete",
      sub: "Strict stage standard (all key skills confirmed)",
      block: kpis.cips,
      accent: "var(--accent-primary)",
    },
    {
      key: "key_skills",
      label: "Key skill coverage",
      sub: "Distinct skills with confirmed evidence",
      block: kpis.key_skills,
      accent: "var(--accent-green)",
    },
    {
      key: "descriptors",
      label: "Descriptor coverage",
      sub: "Descriptors with covered=true in scope",
      block: kpis.descriptors,
      accent: "var(--accent-amber)",
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-2xl border border-subtle bg-surface-2/80 p-4 shadow-sm backdrop-blur"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            {item.label}
          </p>
          <p className="mt-2 text-heading-2 font-semibold tabular-nums text-primary">
            {formatPct(item.block.pct)}
          </p>
          <p className="mt-1 text-micro text-secondary">
            {item.block.covered} / {item.block.total}
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3"
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, item.block.pct))}%`,
                backgroundColor: item.accent,
                maxWidth: "100%",
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">{item.sub}</p>
        </div>
      ))}
    </div>
  );
}
