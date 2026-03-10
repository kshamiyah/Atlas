type GapRow = {
  cip_number: number;
  key_skill_name: string;
  covered: boolean;
};

type KeySkillGapsSectionProps = {
  gaps: GapRow[];
};

export function KeySkillGapsSection({ gaps }: KeySkillGapsSectionProps) {
  if (gaps.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="text-sm font-semibold text-slate-200">
          Key skill gaps
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          No gaps recorded, or CiP detail not synced yet. Open each CiP detail page
          in Kaizen and use &quot;Sync CiP Detail&quot; in the extension.
        </p>
      </section>
    );
  }

  const byCip = gaps.reduce<Record<number, string[]>>((acc, g) => {
    if (!acc[g.cip_number]) acc[g.cip_number] = [];
    acc[g.cip_number].push(g.key_skill_name);
    return acc;
  }, {});

  const cipNumbers = Object.keys(byCip)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">
        Key skill gaps ({gaps.length})
      </h2>
      <ul className="space-y-3">
        {cipNumbers.map((num) => (
          <li key={num}>
            <span className="text-xs font-medium text-amber-400/90">
              CiP {num}
            </span>
            <ul className="mt-1 space-y-0.5 pl-3 text-xs text-slate-400">
              {(byCip[num] ?? []).map((name, i) => (
                <li key={`${num}-${i}`}>{name || "Unnamed key skill"}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
