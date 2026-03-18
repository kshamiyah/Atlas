"use client";

import { useCallback, useEffect, useState } from "react";
import { CipListItem } from "@/components/gap-report/CipListItem";
import { KeySkillRow } from "@/components/gap-report/KeySkillRow";
import type { GapReport, GapReportCip } from "@/lib/types/gap-report";

async function fetchGapReport(stageGroup: string | null = null): Promise<GapReport> {
  const url = stageGroup
    ? `/api/gap-report?stage_group=${encodeURIComponent(stageGroup)}`
    : "/api/gap-report";
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as GapReport;
}

type MobileView = "list" | "detail";

export default function GapReportPage() {
  const [report, setReport] = useState<GapReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStageGroup, setSelectedStageGroup] = useState<string | null>(null);
  const [selectedCip, setSelectedCip] = useState<GapReportCip | null>(null);
  const [expandedKeySkillIds, setExpandedKeySkillIds] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<MobileView>("list");

  const loadReport = useCallback(async (stageGroup: string | null = null) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchGapReport(stageGroup);
      setReport(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load gap report");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(null);
  }, [loadReport]);

  const toggleKeySkill = useCallback((keySkillId: string) => {
    setExpandedKeySkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(keySkillId)) next.delete(keySkillId);
      else next.add(keySkillId);
      return next;
    });
  }, []);

  const sortedKeySkills = selectedCip
    ? [...selectedCip.key_skills].sort((a, b) => a.skill_number - b.skill_number)
    : [];

  function handleSelectCip(cip: GapReportCip) {
    setSelectedCip(cip);
    setMobileView("detail");
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-heading-2 font-semibold text-primary">
              Progress by CiP
            </h1>
            <button
              type="button"
              onClick={() => void loadReport(selectedStageGroup)}
              disabled={isLoading}
              className="btn-secondary text-micro disabled:opacity-60"
            >
              {isLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
          <p className="mt-1 text-micro text-muted">
            CiP coverage from confirmed key skills. Select a CiP to see details.
          </p>
          <div className="mt-3 inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
            {[
              { label: "All", sub: null as string | null, value: null as string | null },
              { label: "Stage One", sub: "ST1–ST2", value: "Stage One" },
              { label: "Stage Two", sub: "ST3–ST5", value: "Stage Two" },
              { label: "Stage Three", sub: "ST6–ST7", value: "Stage Three" },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setSelectedStageGroup(tab.value);
                  setSelectedCip(null);
                  void loadReport(tab.value);
                }}
                className={[
                  "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150",
                  selectedStageGroup === tab.value
                    ? "bg-surface-1 text-primary shadow-sm"
                    : "text-muted hover:text-secondary",
                ].join(" ")}
              >
                {tab.label}
                {tab.sub && <span className="ml-1 opacity-50">{tab.sub}</span>}
              </button>
            ))}
          </div>
        </header>

        {errorMessage && (
          <div
            className="mb-4 rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-micro text-accent-red"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8 text-small text-muted">Loading…</div>
        ) : report ? (
          <>
            {/* Mobile tab switcher — hidden on md+ */}
            <div className="mb-3 flex md:hidden gap-0.5 rounded-full bg-surface-3 p-0.5">
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className={[
                  "flex-1 rounded-full py-1.5 text-micro font-medium transition-all duration-150",
                  mobileView === "list" ? "bg-surface-1 text-primary shadow-sm" : "text-muted",
                ].join(" ")}
              >
                CiP List
              </button>
              <button
                type="button"
                onClick={() => setMobileView("detail")}
                className={[
                  "flex-1 rounded-full py-1.5 text-micro font-medium transition-all duration-150",
                  mobileView === "detail" ? "bg-surface-1 text-primary shadow-sm" : "text-muted",
                ].join(" ")}
              >
                {selectedCip ? `CiP ${selectedCip.cip_number}` : "Details"}
              </button>
            </div>

            <div className="flex flex-col gap-0 md:flex-row md:h-[calc(100vh-10rem)]">
              {/* Left pane — w-80 on desktop (was w-64) */}
              <div
                className={[
                  "md:w-80 md:shrink-0 md:border-r md:border-subtle md:overflow-y-auto",
                  mobileView === "list" ? "block" : "hidden md:block",
                ].join(" ")}
              >
                {report.cips.map((cip) => (
                  <CipListItem
                    key={cip.cip_number}
                    cip={cip}
                    isSelected={selectedCip?.cip_number === cip.cip_number}
                    onSelect={() => handleSelectCip(cip)}
                  />
                ))}
              </div>

              {/* Right detail pane */}
              <div
                className={[
                  "card flex-1 p-4 md:overflow-y-auto",
                  mobileView === "detail" ? "block" : "hidden md:block",
                ].join(" ")}
              >
                {selectedCip == null ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <p className="text-small text-muted">
                      Select a CiP from the list to see key skills and descriptor coverage.
                    </p>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setMobileView("list")}
                      className="mb-3 flex items-center gap-1.5 text-micro text-muted hover:text-primary md:hidden"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                      </svg>
                      Back to list
                    </button>
                    <h2 className="text-heading-3 font-semibold text-primary">
                      CiP {selectedCip.cip_number}: {selectedCip.cip_title}
                    </h2>
                    <p className="mt-1 text-micro text-muted">
                      {selectedCip.confirmed_skills} of {selectedCip.total_skills} key skills confirmed
                    </p>
                    {sortedKeySkills.length === 0 ? (
                      <p className="mt-4 text-small text-muted">No key skills found for this CiP.</p>
                    ) : (
                      <ul className="mt-4 flex flex-col divide-y divide-subtle">
                        {sortedKeySkills.map((ks) => (
                          <li key={ks.key_skill_id}>
                            <KeySkillRow
                              keySkill={ks}
                              isDescriptorPanelExpanded={expandedKeySkillIds.has(ks.key_skill_id)}
                              onToggleDescriptorPanel={() => toggleKeySkill(ks.key_skill_id)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
