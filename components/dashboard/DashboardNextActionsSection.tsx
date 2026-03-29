"use client";

import { useEffect, useState } from "react";
import type { GapReportCip } from "@/lib/types/gap-report";
import { PriorityActionStrip } from "@/components/dashboard/PriorityActionStrip";
import type { QueueResponse } from "@/lib/types/key-skill-review-api";

/**
 * Fetches gap-report data for priority next-actions only (no duplicate progress analytics on the dashboard).
 */
export function DashboardNextActionsSection() {
  const [cips, setCips] = useState<GapReportCip[]>([]);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/gap-report"), fetch("/api/key-skill-review/queue")])
      .then(async ([gapRes, queueRes]) => {
        const gapData = await gapRes.json();
        const queueData = (await queueRes.json()) as QueueResponse;
        if (!active) return;

        setCips((gapData?.cips as GapReportCip[]) ?? []);

        const entries = Array.isArray(queueData?.entries) ? queueData.entries : [];
        let pending = 0;
        for (const entry of entries) {
          for (const suggestion of entry.linked_cip_suggestions ?? []) {
            if (suggestion.status === "suggested" && suggestion.suggestion_id) pending += 1;
          }
          for (const suggestion of entry.cross_cip_suggestions ?? []) {
            if (suggestion.status === "suggested" && suggestion.suggestion_id) pending += 1;
          }
        }
        setPendingSuggestionCount(pending);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PriorityActionStrip
      cips={cips}
      pendingSuggestionCount={pendingSuggestionCount}
      isLoading={isLoading}
    />
  );
}
