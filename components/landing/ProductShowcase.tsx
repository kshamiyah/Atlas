"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PRODUCT_PREVIEW_EXAMPLES,
  PreviewPanelContent,
  PreviewShell,
} from "@/components/landing/product-preview-panels";

const ROTATE_MS = 7000;

export function ProductShowcase() {
  const [activeId, setActiveId] = useState(PRODUCT_PREVIEW_EXAMPLES[0].id);
  const [paused, setPaused] = useState(false);

  const activeExample =
    PRODUCT_PREVIEW_EXAMPLES.find((example) => example.id === activeId) ??
    PRODUCT_PREVIEW_EXAMPLES[0];

  const goToNext = useCallback(() => {
    setActiveId((current) => {
      const index = PRODUCT_PREVIEW_EXAMPLES.findIndex((example) => example.id === current);
      const next = PRODUCT_PREVIEW_EXAMPLES[(index + 1) % PRODUCT_PREVIEW_EXAMPLES.length];
      return next.id;
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(goToNext, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, goToNext]);

  return (
    <div
      className="relative overflow-hidden rounded-[2rem] border border-subtle bg-surface-2/92 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(720px 260px at 12% 0%, rgba(0,113,227,0.10), transparent 68%), radial-gradient(620px 240px at 88% 18%, rgba(22,163,74,0.08), transparent 70%)",
        }}
      />

      <div className="relative border-b border-subtle px-5 py-6 md:px-8 md:py-7">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Product preview
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary md:text-2xl">
            Explore what Atlas looks like inside
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Switch between the main views trainees use after their first ePortfolio sync.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Atlas product previews"
          className="mt-6 flex flex-wrap justify-center gap-2"
        >
          {PRODUCT_PREVIEW_EXAMPLES.map((example) => {
            const isActive = example.id === activeId;
            return (
              <button
                key={example.id}
                type="button"
                role="tab"
                id={`preview-tab-${example.id}`}
                aria-selected={isActive}
                aria-controls={`preview-panel-${example.id}`}
                onClick={() => setActiveId(example.id)}
                className={[
                  "rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition md:text-xs",
                  isActive
                    ? "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
                    : "border-subtle bg-surface-1/90 text-secondary hover:bg-surface-3 hover:text-primary",
                ].join(" ")}
              >
                {example.tabLabel}
              </button>
            );
          })}
        </div>

        <p className="mx-auto mt-4 max-w-lg text-center text-xs leading-relaxed text-secondary">
          <span className="font-medium text-primary">{activeExample.galleryTitle}</span>
          {" — "}
          {activeExample.galleryDescription}
        </p>
      </div>

      <div className="relative px-4 py-5 md:px-8 md:py-7">
        <div
          key={activeId}
          role="tabpanel"
          id={`preview-panel-${activeId}`}
          aria-labelledby={`preview-tab-${activeId}`}
          className="animate-fade-up mx-auto max-w-3xl"
        >
          <PreviewShell example={activeExample}>
            <PreviewPanelContent id={activeId} />
          </PreviewShell>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted">
          {paused ? "Paused" : "Auto-rotating every few seconds"} · select a tab to explore
        </p>
      </div>
    </div>
  );
}
