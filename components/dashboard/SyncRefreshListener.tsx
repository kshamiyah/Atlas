"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes server-rendered dashboard data when the extension completes a full ePortfolio sync.
 */
export function SyncRefreshListener() {
  const router = useRouter();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data) return;
      if (event.data.type === "PORTFOLIOIQ_SYNC_ALL_DONE") {
        router.refresh();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

  return null;
}
