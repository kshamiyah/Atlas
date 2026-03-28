"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";
import { PriorityActionStrip } from "@/components/dashboard/PriorityActionStrip";

/**
 * Fetches gap-report data for priority next-actions only (no duplicate progress analytics on the dashboard).
 */
export function DashboardNextActionsSection() {
  const [cips, setCips] = useState<GapReportCip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/gap-report")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setCips((data?.cips as GapReportCip[]) ?? []);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return <PriorityActionStrip cips={cips} isLoading={isLoading} />;
}
