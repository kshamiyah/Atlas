const OUTCOMES = [
  {
    label: "Sync",
    title: "Pull your whole RCOG ePortfolio into one place",
    body: "CiP assessments, OSATS, procedures, reflections, and profile context — via the Chrome extension, not copy-paste.",
  },
  {
    label: "Prioritise",
    title: "Know what to work on before panel day",
    body: "Coverage by CiP and training stage, plus a ranked list of gaps across OSATS, courses, and exams.",
  },
  {
    label: "Review",
    title: "Confirm skill links in one sitting",
    body: "Atlas maps entries to key skills and descriptors. You approve, reject, or adjust — then move on.",
  },
  {
    label: "Write",
    title: "Draft ePortfolio entries without the blank page",
    body: "Describe a case in plain English. Atlas fills the fields and can push them straight into ePortfolio.",
  },
];

export function LandingOutcomes() {
  return (
    <section className="relative px-5 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[2rem] border border-subtle bg-surface-2/92 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="border-b border-subtle px-6 py-5 md:px-8 md:py-6">
            <h2 className="text-center text-lg font-semibold tracking-[-0.02em] text-primary md:text-xl">
              What Atlas does for trainees
            </h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm leading-6 text-secondary">
              Less time cross-checking ePortfolio against the curriculum. More time closing real gaps.
            </p>
          </div>

          <ul className="divide-y divide-subtle">
            {OUTCOMES.map((item, index) => (
              <li key={item.label} className="flex gap-4 px-6 py-5 md:gap-5 md:px-8 md:py-6">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                  style={{
                    background: "rgba(0,113,227,0.10)",
                    color: "var(--accent-blue)",
                    border: "1px solid rgba(0,113,227,0.18)",
                  }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {item.label}
                  </p>
                  <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.02em] text-primary">
                    {item.title}
                  </h3>
                  <p className="text-[13px] leading-6 text-secondary">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
