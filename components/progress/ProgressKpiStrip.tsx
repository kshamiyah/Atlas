import type { ProgressSummaryResponse } from "@/lib/types/progress";

type Kpis = ProgressSummaryResponse["kpis"];
type Checkpoint = ProgressSummaryResponse["checkpoint"];

function formatPct(pct: number): string {
  return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
}

export function ProgressKpiStrip({
  kpis,
  checkpoint,
  showBandCoverageHint = false,
}: {
  kpis: Kpis;
  checkpoint: Checkpoint;
  /** When viewing a year within a shared curriculum band (e.g. ST1 vs ST2). */
  showBandCoverageHint?: boolean;
}) {
  const isWaypoint = checkpoint.type === "waypoint";
  const isStageEnd = checkpoint.type === "stage_end";

  const items = [
    {
      key: "cip_assessments",
      label: "CiP assessments",
      sub: checkpoint.current_stage
        ? `Supervisor judgments recorded for ${checkpoint.current_stage} ARCP (14 CiPs required)`
        : "Supervisor judgments for all 14 CiPs",
      block: kpis.cip_assessments,
      accent: "var(--accent-purple, #8b5cf6)",
      supporting: `${kpis.cip_assessments_on_track.covered} on track for stage entrustment and expectations`,
    },
    {
      key: "cips_checkpoint",
      label: isWaypoint || isStageEnd ? "Waypoint-ready CiPs" : "CiP readiness",
      sub: isWaypoint
        ? `${checkpoint.current_stage ?? "This year"} is a waypoint ARCP — each CiP needs 100% key skills and descriptors to count as ready`
        : isStageEnd
          ? `${checkpoint.current_stage ?? "This year"} stage-end ARCP — each CiP needs full completion to count as ready`
          : `CiPs on track for ${checkpoint.current_stage ?? "this"} annual ARCP expectations`,
      block: kpis.cips_checkpoint,
      accent: "var(--accent-blue)",
      supporting: `${kpis.cips.covered} CiPs · all key skills confirmed · ${kpis.key_skills.pct}% key skill coverage in band`,
    },
    {
      key: "key_skills",
      label: "Key skill coverage",
      sub: "Key skills with confirmed evidence in this curriculum band",
      block: kpis.key_skills,
      accent: "var(--accent-green)",
    },
    {
      key: "descriptors",
      label: "Descriptor coverage",
      sub: "Descriptors with confirmed evidence in this curriculum band",
      block: kpis.descriptors,
      accent: "var(--accent-amber)",
    },
  ] as const;

  return (
    <div className="space-y-3">
      {showBandCoverageHint ? (
        <p className="rounded-xl border border-subtle bg-surface-2/70 px-3 py-2 text-[11px] leading-relaxed text-secondary">
          Key skill and descriptor coverage is shared across the ST1–ST2 curriculum band — your
          ST1 evidence counts here too. The first card only measures{" "}
          <span className="font-medium text-primary">waypoint-ready</span> CiPs, which uses a
          stricter bar than ST1 annual pacing.
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-2xl border border-subtle bg-surface-2/60 p-4 shadow-sm backdrop-blur"
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
          {"supporting" in item && item.supporting ? (
            <p className="mt-2 text-micro text-secondary">{item.supporting}</p>
          ) : null}
        </div>
      ))}
      </div>
    </div>
  );
}
