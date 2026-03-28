"use client";

import type { ReactNode } from "react";

const TABS = [
  { id: "cips", label: "CiPs" },
  { id: "key-skills", label: "Key skills" },
  { id: "descriptors", label: "Descriptors" },
] as const;

export type ProgressTabId = (typeof TABS)[number]["id"];

type ProgressTabsShellProps = {
  activeTab: ProgressTabId;
  onTabChange: (tab: ProgressTabId) => void;
  children?: ReactNode;
};

export function ProgressTabsShell({ activeTab, onTabChange, children }: ProgressTabsShellProps) {
  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Progress views" className="flex gap-1 border-b border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`progress-tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={[
              "-mb-px border-b-2 px-4 py-2.5 text-small font-medium transition-colors",
              activeTab === tab.id
                ? "border-accent-primary text-primary"
                : "border-transparent text-muted hover:text-secondary",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-labelledby={`progress-tab-${activeTab}`}
        className="rounded-b-2xl border border-t-0 border-subtle bg-surface-2/40 px-4 py-4 md:px-5 md:py-5"
      >
        {children ?? (
          <div className="py-8 text-center text-small text-muted">
            <p className="font-medium text-secondary">Tab content</p>
            <p className="mt-1 text-micro">
              {activeTab === "key-skills" &&
                "Key skills grouped by CiP will appear here (phase 4)."}
              {activeTab === "descriptors" &&
                "Cross-entry descriptor coverage will appear here (phase 5)."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
