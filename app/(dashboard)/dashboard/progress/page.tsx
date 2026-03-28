import { Suspense } from "react";
import { ProgressHubClient } from "@/components/progress/ProgressHubClient";

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-small text-muted">
          Loading…
        </div>
      }
    >
      <ProgressHubClient />
    </Suspense>
  );
}
