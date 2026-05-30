import type {
  ProgressCipAssessmentStatus,
  ProgressCipAssessmentSummary,
} from "@/lib/types/progress";

function assessmentChip(status: ProgressCipAssessmentStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "on_track":
      return {
        label: "Assessment OK",
        className: "border-accent-green/40 bg-accent-green/12 text-accent-green",
      };
    case "pending_entrustment":
      return {
        label: "Entrustment pending",
        className: "border-accent-amber/40 bg-accent-amber/14 text-accent-amber",
      };
    case "missing":
      return {
        label: "Assessment missing",
        className: "border-accent-amber/40 bg-accent-amber/14 text-accent-amber",
      };
    case "below_expectations":
    case "below_entrustment":
      return {
        label: "Assessment at risk",
        className: "border-accent-red/40 bg-accent-red/12 text-accent-red",
      };
  }
}

export function ProgressCipAssessmentBadge({
  assessment,
  compact = false,
}: {
  assessment: ProgressCipAssessmentSummary;
  compact?: boolean;
}) {
  const chip = assessmentChip(assessment.status);

  if (compact) {
    return (
      <span
        className={[
          "inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
          chip.className,
        ].join(" ")}
      >
        {chip.label}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-subtle bg-surface-1/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          CiP assessment
        </p>
        <span
          className={[
            "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            chip.className,
          ].join(" ")}
        >
          {chip.label}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-secondary">{assessment.status_reason}</p>
    </div>
  );
}

export function ProgressCipAssessmentFields({
  assessment,
}: {
  assessment: ProgressCipAssessmentSummary;
}) {
  const fields: Array<{ label: string; value: string | null }> = [];

  if (assessment.is_clinical) {
    if (assessment.expected_entrustment_label) {
      fields.push({
        label: "Expected entrustment",
        value: assessment.expected_entrustment_label,
      });
    }
    fields.push({
      label: "ES entrustment",
      value: assessment.es_entrustment_label,
    });
    fields.push({
      label: "Trainee entrustment",
      value: assessment.trainee_entrustment_label,
    });
  }

  fields.push({
    label: "Meeting expectations",
    value: assessment.es_meets_expectations_label,
  });

  const visible = fields.filter((field) => field.value);
  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-muted">
        No supervisor judgment synced yet. Request your CiP assessment from your Educational
        Supervisor in Kaizen.
      </p>
    );
  }

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {visible.map((field) => (
        <div key={field.label} className="rounded-lg border border-subtle bg-surface-1/70 px-3 py-2">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {field.label}
          </dt>
          <dd className="mt-1 text-[11px] leading-snug text-primary">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
