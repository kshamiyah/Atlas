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
      <section className="rounded-lg border border-subtle bg-surface-2 p-5">
        <h2 className="text-small font-semibold text-primary">
          Key skill gaps
        </h2>
        <p className="mt-2 text-micro text-muted">
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
    <section className="rounded-lg border border-subtle bg-surface-2 p-5">
      <h2 className="text-small font-semibold text-primary mb-3">
        Key skill gaps ({gaps.length})
      </h2>
      <ul className="space-y-3">
        {cipNumbers.map((num) => (
          <li key={num}>
            <span className="text-micro font-medium text-accent-amber">
              CiP {num}
            </span>
            <ul className="mt-1 space-y-0.5 pl-3 text-micro text-muted">
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
