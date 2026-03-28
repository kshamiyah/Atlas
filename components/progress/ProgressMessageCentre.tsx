import Link from "next/link";
import type { ProgressMessage, ProgressMessagePriority } from "@/lib/types/progress";

function priorityBadge(priority: ProgressMessagePriority): { label: string; className: string } {
  if (priority === "high") {
    return {
      label: "High",
      className: "border-accent-red/35 bg-accent-red/12 text-accent-red",
    };
  }
  if (priority === "medium") {
    return {
      label: "Medium",
      className: "border-accent-amber/35 bg-accent-amber/12 text-accent-amber",
    };
  }
  return {
    label: "Low",
    className: "border-subtle bg-surface-3 text-muted",
  };
}

export function ProgressMessageCentre({ messages }: { messages: ProgressMessage[] }) {
  if (messages.length === 0) {
    return (
      <section
        className="mt-6 rounded-2xl border border-subtle bg-surface-2/50 px-4 py-5 md:px-5"
        aria-label="Message centre"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Message centre
        </p>
        <p className="mt-2 text-small text-secondary">No urgent gaps right now.</p>
      </section>
    );
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-subtle bg-surface-2/50 px-4 py-4 md:px-5"
      aria-label="Message centre"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Message centre
      </p>
      <ul className="mt-3 space-y-3">
        {messages.map((m) => {
          const badge = priorityBadge(m.priority);
          return (
            <li
              key={m.id}
              className="rounded-xl border border-subtle bg-surface-1/80 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        badge.className,
                      ].join(" ")}
                    >
                      {badge.label}
                    </span>
                    <h3 className="text-small font-semibold text-primary">{m.title}</h3>
                  </div>
                  <p className="mt-2 text-micro leading-relaxed text-secondary">{m.body}</p>
                </div>
                <Link
                  href={m.cta_href}
                  className="shrink-0 rounded-lg border border-accent-primary bg-accent-primary px-3 py-1.5 text-center text-micro font-semibold text-surface-1 transition-opacity hover:opacity-90"
                >
                  {m.cta_label}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
