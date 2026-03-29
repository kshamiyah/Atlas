"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/telemetry/client";
import type { ProgressSummaryResponse } from "@/lib/types/progress";

function KpiChip({
  label,
  pct,
  covered,
  total,
}: {
  label: string;
  pct: number;
  covered: number;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-surface-1 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-primary">{pct}%</p>
      <p className="text-[11px] tabular-nums text-muted">
        {covered}/{total}
      </p>
    </div>
  );
}

export function DashboardProgressGateway() {
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/progress/summary")
      .then(async (r) => {
        const text = await r.text();
        const body = text ? JSON.parse(text) : null;
        if (!r.ok) {
          throw new Error(
            body && typeof body === "object" && "error" in body
              ? String((body as { error: string }).error)
              : `Request failed (${r.status})`,
          );
        }
        return body as ProgressSummaryResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load progress");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="card flex h-full flex-col gap-4 p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-3" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-surface-3" />
          ))}
        </div>
        <div className="h-9 w-full animate-pulse rounded-lg bg-surface-3" />
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="card flex h-full flex-col justify-center gap-2 border-accent-amber/30 bg-surface-1 p-6"
        role="alert"
      >
        <p className="text-small font-semibold text-primary">Progress overview</p>
        <p className="text-micro text-accent-amber">{error}</p>
        <Link href="/dashboard/progress" className="text-micro font-medium text-accent-blue hover:underline">
          Open Progress Hub →
        </Link>
      </section>
    );
  }

  const kpis = data?.kpis;
  if (!kpis) {
    return null;
  }

  return (
    <section className="card flex h-full flex-col gap-4 p-6">
      <div>
        <h2 className="text-small font-semibold text-primary" style={{ letterSpacing: "-0.014em" }}>
          Progress overview
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Checkpoint trajectory and strict completion from synced entries.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <KpiChip
          label="CiP checkpoint"
          pct={kpis.cips_checkpoint.pct}
          covered={kpis.cips_checkpoint.covered}
          total={kpis.cips_checkpoint.total}
        />
        <KpiChip
          label="CiPs complete"
          pct={kpis.cips.pct}
          covered={kpis.cips.covered}
          total={kpis.cips.total}
        />
        <KpiChip
          label="Key skills"
          pct={kpis.key_skills.pct}
          covered={kpis.key_skills.covered}
          total={kpis.key_skills.total}
        />
        <KpiChip
          label="Descriptors"
          pct={kpis.descriptors.pct}
          covered={kpis.descriptors.covered}
          total={kpis.descriptors.total}
        />
      </div>

      <Link
        href="/dashboard/progress"
        className="btn-primary inline-flex justify-center px-4 py-2.5 text-small"
        onClick={() => trackEvent("dashboard_open_progress_hub")}
      >
        Open Progress Hub
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-subtle pt-3">
        <span className="w-full text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
          Jump to tab
        </span>
        <Link
          href="/dashboard/progress?tab=cips"
          className="rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-accent-blue/40 hover:text-primary"
          onClick={() => trackEvent("dashboard_progress_deeplink", { tab: "cips" })}
        >
          CiPs
        </Link>
        <Link
          href="/dashboard/progress?tab=key-skills"
          className="rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-accent-blue/40 hover:text-primary"
          onClick={() => trackEvent("dashboard_progress_deeplink", { tab: "key-skills" })}
        >
          Key skills
        </Link>
        <Link
          href="/dashboard/progress?tab=descriptors"
          className="rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-accent-blue/40 hover:text-primary"
          onClick={() => trackEvent("dashboard_progress_deeplink", { tab: "descriptors" })}
        >
          Descriptors
        </Link>
      </div>
    </section>
  );
}
