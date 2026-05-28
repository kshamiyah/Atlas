"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type SetupAutoRefreshProps = {
  enabled: boolean;
  intervalMs?: number;
};

export function SetupAutoRefresh({
  enabled,
  intervalMs = 15_000,
}: SetupAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, router]);

  if (!enabled) return null;

  return (
    <div className="rounded-[1.5rem] border border-subtle bg-surface-1/88 p-4 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-primary">Waiting for your first sync</p>
          <p className="text-[11px] leading-relaxed text-muted">
            Atlas checks for new ePortfolio data every 15 seconds. Once your sync lands,
            we&apos;ll take you straight to your dashboard summary.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-full border border-subtle bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-surface-3"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
