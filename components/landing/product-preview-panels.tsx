import type { ReactNode } from "react";
import { ReviewSwipePreview } from "@/components/landing/ReviewSwipePreview";

type PreviewBadge = {
  label: string;
  tone?: "default" | "amber" | "green" | "blue" | "purple";
};

export type ProductPreviewExample = {
  id: string;
  tabLabel: string;
  headerLabel: string;
  badges: PreviewBadge[];
  galleryTitle: string;
  galleryDescription: string;
};

export const PRODUCT_PREVIEW_EXAMPLES: ProductPreviewExample[] = [
  {
    id: "dashboard",
    tabLabel: "Dashboard",
    headerLabel: "Live portfolio view",
    badges: [
      { label: "ST2" },
      { label: "87 days to ARCP", tone: "amber" },
    ],
    galleryTitle: "Dashboard overview",
    galleryDescription: "Next actions, CiP coverage, and sync status in one place.",
  },
  {
    id: "progress",
    tabLabel: "Progress Hub",
    headerLabel: "Progress Hub · priorities",
    badges: [
      { label: "ST2" },
      { label: "4 items ranked", tone: "blue" },
    ],
    galleryTitle: "Progress Hub",
    galleryDescription: "Ranked priorities across CiPs, OSATS, courses, and exams.",
  },
  {
    id: "review",
    tabLabel: "Skill review",
    headerLabel: "AI suggestion review",
    badges: [
      { label: "12 AI suggestions", tone: "purple" },
      { label: "Swipe mode", tone: "blue" },
    ],
    galleryTitle: "Key skill review",
    galleryDescription:
      "Atlas suggests key-skill links for each entry — swipe through the queue and accept or skip each one.",
  },
  {
    id: "write",
    tabLabel: "Write entry",
    headerLabel: "AI entry generator",
    badges: [
      { label: "Reflection" },
      { label: "Ready to fill", tone: "green" },
    ],
    galleryTitle: "AI entry writer",
    galleryDescription: "Turn a case note into a structured ePortfolio entry in seconds.",
  },
];

export function badgeStyles(tone: PreviewBadge["tone"] = "default") {
  if (tone === "amber") {
    return {
      borderColor: "rgba(245,158,11,0.35)",
      color: "var(--accent-amber)",
      background: "rgba(245,158,11,0.10)",
    };
  }
  if (tone === "green") {
    return {
      borderColor: "rgba(22,163,74,0.35)",
      color: "var(--accent-green)",
      background: "rgba(22,163,74,0.10)",
    };
  }
  if (tone === "blue") {
    return {
      borderColor: "rgba(0,113,227,0.35)",
      color: "var(--accent-blue)",
      background: "rgba(0,113,227,0.10)",
    };
  }
  if (tone === "purple") {
    return {
      borderColor: "rgba(124,58,237,0.35)",
      color: "var(--accent-purple)",
      background: "rgba(124,58,237,0.10)",
    };
  }
  return {
    borderColor: "var(--border-subtle)",
    color: "var(--text-secondary)",
    background: "var(--surface-3)",
  };
}

const CIP_BARS = [
  { label: "CiP 1", pct: 72, tone: "green" as const },
  { label: "CiP 3", pct: 34, tone: "amber" as const },
  { label: "CiP 7", pct: 58, tone: "blue" as const },
  { label: "CiP 12", pct: 19, tone: "red" as const },
];

function barColor(tone: (typeof CIP_BARS)[number]["tone"]) {
  if (tone === "green") return "var(--accent-green)";
  if (tone === "amber") return "var(--accent-amber)";
  if (tone === "red") return "var(--accent-red)";
  return "var(--accent-blue)";
}

export function PreviewShell({
  example,
  compact = false,
  children,
}: {
  example: ProductPreviewExample;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[1.75rem] border border-subtle bg-surface-2/95 backdrop-blur",
        compact
          ? "shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
          : "shadow-[0_24px_80px_rgba(15,23,42,0.10)]",
      ].join(" ")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(520px 200px at 0% 0%, rgba(0,113,227,0.08), transparent 65%), radial-gradient(420px 180px at 100% 30%, rgba(22,163,74,0.07), transparent 68%)",
        }}
      />

      <div className="relative border-b border-subtle px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-accent-green" />
            <span className="text-[11px] font-medium text-secondary">{example.headerLabel}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {example.badges.map((badge) => {
              const styles = badgeStyles(badge.tone);
              return (
                <span
                  key={badge.label}
                  className="rounded-md border px-2 py-0.5 text-[10px] font-medium"
                  style={styles}
                >
                  {badge.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className={compact ? "relative space-y-3 p-3.5" : "relative space-y-4 p-4 md:p-5"}>
        {children}
      </div>
    </div>
  );
}

export function DashboardPreviewPanel({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <div className="rounded-[1.25rem] border border-subtle bg-surface-1/90 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          What needs attention now
        </p>
        <h3 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-primary">
          Lift CiP 3 above 50%
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-secondary">
          Personalised procedures has 34% key-skill coverage. A few confirmed reviews move the
          picture quickly.
        </p>
        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent-primary px-3 py-1 text-[10px] font-medium text-surface-2">
              Review skills
            </span>
            <span className="rounded-full border border-subtle bg-surface-2 px-3 py-1 text-[10px] font-medium text-primary">
              Open Progress Hub
            </span>
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.25rem] border border-subtle bg-surface-1/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-primary">CiP coverage</p>
          <p className="text-[10px] text-muted">ST1–ST2 band</p>
        </div>
        <div className="space-y-2.5">
          {(compact ? CIP_BARS.slice(0, 3) : CIP_BARS).map((bar) => (
            <div key={bar.label} className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-[10px] font-medium text-muted">{bar.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-4">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${bar.pct}%`, backgroundColor: barColor(bar.tone) }}
                />
              </div>
              <span className="w-8 text-right text-[10px] font-medium text-secondary">
                {bar.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {!compact ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Entries synced", value: "130" },
            { label: "Skills to review", value: "12" },
            { label: "OSATS complete", value: "8/11" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-subtle bg-surface-1/88 px-2.5 py-2.5 text-center"
            >
              <p className="text-sm font-semibold tracking-[-0.02em] text-primary">{stat.value}</p>
              <p className="mt-0.5 text-[9px] leading-snug text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ProgressPreviewPanel({ compact = false }: { compact?: boolean }) {
  const priorities = [
    {
      rank: 1,
      label: "CiP 3 · Personalised procedures",
      detail: "34% coverage · 6 key skills still open",
      tone: "amber" as const,
    },
    {
      rank: 2,
      label: "OSATS · Basic caesarean (463)",
      detail: "Needs 1 more consultant sign-off",
      tone: "blue" as const,
    },
    {
      rank: 3,
      label: "Mandatory course · PROMPT",
      detail: "Not recorded for ST2 checkpoint",
      tone: "red" as const,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "CiPs at risk", value: "2" },
          { label: "Missing OSATS", value: "3" },
          { label: "Exams due", value: "1" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-subtle bg-surface-1/88 px-2.5 py-2.5 text-center"
          >
            <p className="text-sm font-semibold tracking-[-0.02em] text-primary">{stat.value}</p>
            <p className="mt-0.5 text-[9px] leading-snug text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[1.25rem] border border-subtle bg-surface-1/90 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Recommended next actions
        </p>
        <div className="mt-3 space-y-2.5">
          {priorities.slice(0, compact ? 2 : 3).map((item) => (
            <div
              key={item.rank}
              className="flex items-start gap-3 rounded-xl border border-subtle bg-surface-2/80 px-3 py-2.5"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{
                  background:
                    item.tone === "amber"
                      ? "rgba(245,158,11,0.12)"
                      : item.tone === "red"
                        ? "rgba(220,38,38,0.10)"
                        : "rgba(0,113,227,0.10)",
                  color:
                    item.tone === "amber"
                      ? "var(--accent-amber)"
                      : item.tone === "red"
                        ? "var(--accent-red)"
                        : "var(--accent-blue)",
                }}
              >
                {item.rank}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-5 text-primary">{item.label}</p>
                <p className="text-[10px] leading-relaxed text-secondary">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function ReviewPreviewPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-subtle bg-surface-1/90 p-4">
      <ReviewSwipePreview compact={compact} />
    </div>
  );
}

export function WritePreviewPanel({ compact = false }: { compact?: boolean }) {
  const fields = [
    { label: "Title", value: "Reflection on postpartum haemorrhage management" },
    { label: "What happened", value: "Emergency call to labour ward for PPH after SVD..." },
    { label: "Learning points", value: "Early recognition of atonic uterus and escalation..." },
  ];

  return (
    <>
      <div className="rounded-[1.25rem] border border-subtle bg-surface-1/90 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Your case note
        </p>
        <div className="mt-2 rounded-xl border border-subtle bg-surface-2/80 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-secondary">
            {compact
              ? "PPH case on labour ward. I led initial management and called consultant early..."
              : "PPH case on labour ward. I led initial management, ran through the four Ts, and called the consultant early when bleeding continued after uterotonics."}
          </p>
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-emerald-300/35 bg-surface-1/90 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
            Generated ePortfolio fields
          </p>
          <span className="text-[9px] font-medium text-muted">GPT-4o</span>
        </div>
        <div className="mt-3 space-y-2">
          {fields.slice(0, compact ? 2 : 3).map((field) => (
            <div key={field.label} className="rounded-lg border border-subtle bg-surface-2/80 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                {field.label}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-primary">{field.value}</p>
            </div>
          ))}
        </div>
        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent-primary px-3 py-1 text-[10px] font-medium text-surface-2">
              Fill in ePortfolio
            </span>
            <span className="rounded-full border border-subtle bg-surface-2 px-3 py-1 text-[10px] font-medium text-primary">
              Edit fields
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function PreviewPanelContent({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  if (id === "progress") return <ProgressPreviewPanel compact={compact} />;
  if (id === "review") return <ReviewPreviewPanel compact={compact} />;
  if (id === "write") return <WritePreviewPanel compact={compact} />;
  return <DashboardPreviewPanel compact={compact} />;
}
