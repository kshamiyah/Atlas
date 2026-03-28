"use client";

import type { ProgressDescriptorCipGroup, ProgressDescriptorRow } from "@/lib/types/progress";

type ProgressDescriptorListProps = {
  groups: ProgressDescriptorCipGroup[];
  selectedDescriptorId: string | null;
  onSelect: (cipNumber: number, skillId: string, descriptorId: string) => void;
};

export function ProgressDescriptorList({
  groups,
  selectedDescriptorId,
  onSelect,
}: ProgressDescriptorListProps) {
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.cip_number}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            CiP {g.cip_number}
          </p>
          <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-secondary">{g.cip_title}</p>
          {g.skills.map((sk) => (
            <div key={sk.key_skill_id} className="mb-3">
              <p className="mb-1 text-[11px] font-medium text-primary">
                #{sk.skill_number} {sk.title}
              </p>
              <p className="mb-1.5 text-[10px] text-muted">
                {sk.descriptor_coverage.covered}/{sk.descriptor_coverage.total} covered (
                {sk.descriptor_coverage.pct}%)
              </p>
              <ul className="space-y-1">
                {sk.descriptors.map((d) => (
                  <li key={d.descriptor_id}>
                    <DescriptorLine
                      d={d}
                      selected={d.descriptor_id === selectedDescriptorId}
                      cipNumber={g.cip_number}
                      skillId={sk.key_skill_id}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DescriptorLine({
  d,
  selected,
  cipNumber,
  skillId,
  onSelect,
}: {
  d: ProgressDescriptorRow;
  selected: boolean;
  cipNumber: number;
  skillId: string;
  onSelect: (cip: number, sid: string, did: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cipNumber, skillId, d.descriptor_id)}
      className={[
        "w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-snug transition-colors",
        selected
          ? "border-accent-primary bg-accent-primary/10 ring-1 ring-accent-primary/30"
          : "border-subtle bg-surface-1/60 hover:bg-surface-2/80",
      ].join(" ")}
    >
      <span className={d.covered ? "text-accent-green" : "text-accent-amber"}>
        {d.covered ? "✓" : "○"}
      </span>{" "}
      <span className="text-secondary">{d.text}</span>
    </button>
  );
}
