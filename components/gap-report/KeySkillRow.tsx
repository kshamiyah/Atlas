import Link from "next/link";
import type { GapReportKeySkill } from "@/lib/types/gap-report";
import { DescriptorPanel } from "./DescriptorPanel";

type KeySkillRowProps = {
  keySkill: GapReportKeySkill;
  isDescriptorPanelExpanded: boolean;
  onToggleDescriptorPanel: () => void;
  writeEntryHref?: string;
};

export function KeySkillRow({
  keySkill,
  isDescriptorPanelExpanded,
  onToggleDescriptorPanel,
  writeEntryHref,
}: KeySkillRowProps) {
  const isConfirmed = keySkill.is_confirmed;
  const analysisRun = keySkill.descriptors.some((d) => d.confidence !== null);
  const canExpand = keySkill.is_confirmed && analysisRun;
  const hasDescriptorData = analysisRun && keySkill.total_descriptors > 0;
  const descriptorPct =
    hasDescriptorData
      ? Math.min(100, Math.max(0, (keySkill.evidenced_descriptors / keySkill.total_descriptors) * 100))
      : 0;

  const summary = (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          isConfirmed ? "bg-accent-green" : "bg-surface-4"
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <span
          className={
            isConfirmed
              ? "text-xs font-medium text-primary"
              : "text-xs font-medium text-muted"
          }
        >
          {keySkill.title}
        </span>
        {isConfirmed ? (
          <p className="mt-0.5 text-[11px] text-secondary">
            {keySkill.confirmed_entry_count}{" "}
            {keySkill.confirmed_entry_count === 1 ? "entry" : "entries"}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] italic text-muted">
            No evidence yet
          </p>
        )}
        {!isConfirmed && writeEntryHref ? (
          <Link
            href={writeEntryHref}
            className="mt-1.5 inline-flex text-[11px] font-medium text-accent-blue hover:underline"
          >
            Write an entry
          </Link>
        ) : null}
        {isConfirmed && hasDescriptorData && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
              <div
                className="h-full bg-emerald-500/80 transition-all duration-300"
                style={{ width: `${descriptorPct}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted">
              {keySkill.evidenced_descriptors} / {keySkill.total_descriptors}{" "}
              descriptors
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (canExpand) {
    return (
      <div className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
        <button
          type="button"
          onClick={onToggleDescriptorPanel}
          className="-mx-1 w-full rounded-md px-1 text-left transition hover:bg-surface-4/50 focus:outline-none focus:ring-2 focus:ring-subtle focus:ring-offset-2 focus:ring-offset-surface-1"
        >
          {summary}
        </button>
        {isDescriptorPanelExpanded && (
          <DescriptorPanel keySkill={keySkill} />
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1 py-2 first:pt-0 last:pb-0 ${!isConfirmed ? "opacity-70" : ""}`}
    >
      {summary}
    </div>
  );
}
