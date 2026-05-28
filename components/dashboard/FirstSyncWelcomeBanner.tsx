"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const DISMISS_STORAGE_KEY = "atlas-first-sync-welcome-dismissed";

type FirstSyncWelcomeBannerProps = {
  showByDefault?: boolean;
  variant?: "dashboard" | "review";
};

function FirstSyncWelcomeBannerInner({
  showByDefault = false,
  variant = "dashboard",
}: FirstSyncWelcomeBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const forced =
      showByDefault ||
      searchParams.get("welcome") === "first-sync" ||
      searchParams.get("onboarding") === "complete";
    const dismissed = window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
    setVisible(forced && !dismissed);
  }, [searchParams, showByDefault]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    setVisible(false);

    if (
      searchParams.get("welcome") === "first-sync" ||
      searchParams.get("onboarding") === "complete"
    ) {
      router.replace(pathname, { scroll: false });
    }
  };

  if (!visible) return null;

  const isReview = variant === "review";

  return (
    <section className="rounded-[2rem] border border-accent-purple/25 bg-surface-2/94 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-purple/30 bg-accent-purple/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-purple">
              <span aria-hidden>✦</span>
              First sync complete
            </span>
            <span className="text-[10px] font-medium text-muted">Recommended next step</span>
          </div>
          <h2 className="text-heading-3 font-semibold text-primary">
            {isReview
              ? "Review Atlas’s AI suggestions for your entries"
              : "Your portfolio is in — start with AI skill suggestions"}
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-secondary">
            Atlas has mapped your ePortfolio entries to key skills. Work through the suggestion
            queue to accept links that fit and skip the rest — usually a few minutes for your first
            pass.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isReview ? (
            <Link href="/dashboard/key-skill-review" className="btn-primary px-4 py-2 text-small">
              Review AI suggestions
            </Link>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="btn-primary px-4 py-2 text-small"
            >
              Start reviewing
            </button>
          )}
          <Link href="/dashboard/progress" className="btn-secondary px-4 py-2 text-small">
            Open Progress Hub
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-3 py-2 text-[11px] font-medium text-muted transition hover:text-secondary"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

export function FirstSyncWelcomeBanner(props: FirstSyncWelcomeBannerProps) {
  return (
    <Suspense fallback={null}>
      <FirstSyncWelcomeBannerInner {...props} />
    </Suspense>
  );
}
