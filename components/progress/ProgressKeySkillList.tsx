"use client";

import type { ProgressKeySkillGroup, ProgressKeySkillRow } from "@/lib/types/progress";

type ProgressKeySkillListProps = {
  groups: ProgressKeySkillGroup[];
  selectedSkillId: string | null;
  onSelectSkill: (cipNumber: number, skillId: string) => void;
};

export function ProgressKeySkillList({
  groups,
  selectedSkillId,
  onSelectSkill,
}: ProgressKeySkillListProps) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.cip_number}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            CiP {g.cip_number}
          </p>
          <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-secondary">
            {g.cip_title}
          </p>
          <ul className="space-y-1" role="list">
            {g.key_skills.map((s) => (
              <li key={s.key_skill_id}>
                <SkillRowButton
                  skill={s}
                  selected={s.key_skill_id === selectedSkillId}
                  onSelect={() => onSelectSkill(g.cip_number, s.key_skill_id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SkillRowButton({
  skill,
  selected,
  onSelect,
}: {
  skill: ProgressKeySkillRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-xl border px-3 py-2 text-left transition-colors",
        selected
          ? "border-accent-primary bg-accent-primary/10 ring-1 ring-accent-primary/30"
          : "border-subtle bg-surface-1/60 hover:border-subtle hover:bg-surface-2/80",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro font-semibold text-primary">
            #{skill.skill_number}{" "}
            <span className="font-normal">{skill.title}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {skill.is_confirmed ? (
              <span className="text-accent-green">Confirmed</span>
            ) : (
              <span className="text-accent-amber">Not confirmed</span>
            )}
            <span className="mx-1 opacity-40">·</span>
            Descriptors {skill.descriptor_coverage.pct}%
          </p>
        </div>
      </div>
    </button>
  );
}
