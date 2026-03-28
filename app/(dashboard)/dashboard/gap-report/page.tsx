"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CipListItem, type CipPriority } from "@/components/gap-report/CipListItem";
import { KeySkillRow } from "@/components/gap-report/KeySkillRow";
import type { GapReport, GapReportCip } from "@/lib/types/gap-report";

type RequirementsSummary = {
  procedures_complete: number;
  procedures_total: number;
  courses_complete: number;
  courses_total: number;
  exams_complete: number;
  exams_total: number;
};

async function fetchGapReport(stageScope: string | null = null): Promise<GapReport> {
  const url = stageScope
    ? `/api/gap-report?stage_scope=${encodeURIComponent(stageScope)}`
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

const STAGE_TABS = [
  { label: "All", sub: null as string | null, value: null as string | null },
  { label: "Stage One", sub: "ST1-ST2", value: "BAND_ST1_2" },
  { label: "Stage Two", sub: "ST3-ST5", value: "BAND_ST3_5" },
  { label: "Stage Three", sub: "ST6-ST7", value: "BAND_ST6_7" },
];

function missingSkills(cip: GapReportCip): number {
  return Math.max(0, cip.total_skills - cip.confirmed_skills);
}

function getCipPriority(cip: GapReportCip): CipPriority {
  const missing = missingSkills(cip);
  if (missing === 0 || cip.coverage_pct >= 100) return "on-track";
  if (cip.coverage_pct === 0 || cip.coverage_pct < 45 || missing >= 4) return "at-risk";
  return "needs-work";
}

function priorityWeight(priority: CipPriority): number {
  if (priority === "at-risk") return 0;
  if (priority === "needs-work") return 1;
  return 2;
}

function nextActionHint(cip: GapReportCip): string {
  const missing = missingSkills(cip);
  if (missing === 0) return "Maintain with fresh evidence entries.";
  if (cip.coverage_pct === 0) return "Confirm one key skill to start progress.";
  if (cip.coverage_pct < 50) return "Prioritize missing high-impact skills.";
  return "Close remaining gaps before ARCP.";
}

function formatPct(value: number): string {
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

export default function GapReportPage() {
  const [report, setReport] = useState<GapReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reqSummary, setReqSummary] = useState<RequirementsSummary | null>(null);
  const [selectedStageScope, setSelectedStageScope] = useState<string | null>(null);
  const [selectedCipNumber, setSelectedCipNumber] = useState<string | null>(null);
  const [expandedKeySkillIds, setExpandedKeySkillIds] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [priorityOnly, setPriorityOnly] = useState(false);

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
    fetch("/api/requirements")
      .then((r) => r.json())
      .then((d) => { if (d.summary) setReqSummary(d.summary); })
      .catch(() => null);
  }, [loadReport]);

  const sortedCips = useMemo(() => {
    const cips = report?.cips ?? [];
    return [...cips].sort((a, b) => {
      const pa = getCipPriority(a);
      const pb = getCipPriority(b);
      const pDelta = priorityWeight(pa) - priorityWeight(pb);
      if (pDelta !== 0) return pDelta;

      const missingDelta = missingSkills(b) - missingSkills(a);
      if (missingDelta !== 0) return missingDelta;

      if (a.coverage_pct !== b.coverage_pct) return a.coverage_pct - b.coverage_pct;
      return Number(a.cip_number) - Number(b.cip_number);
    });
  }, [report]);

  const filteredCips = useMemo(() => {
    if (!priorityOnly) return sortedCips;
    return sortedCips.filter((cip) => getCipPriority(cip) !== "on-track");
  }, [priorityOnly, sortedCips]);

  const selectedCip = useMemo(() => {
    if (filteredCips.length === 0) return null;
    return (
      filteredCips.find((cip) => cip.cip_number === selectedCipNumber) ??
      filteredCips[0]
    );
  }, [filteredCips, selectedCipNumber]);

  const actionCips = useMemo(
    () => sortedCips.filter((cip) => missingSkills(cip) > 0).slice(0, 3),
    [sortedCips],
  );

  const counts = useMemo(() => {
    const atRisk = sortedCips.filter((cip) => getCipPriority(cip) === "at-risk").length;
    const needsWork = sortedCips.filter((cip) => getCipPriority(cip) === "needs-work").length;
    const onTrack = sortedCips.filter((cip) => getCipPriority(cip) === "on-track").length;
    return { atRisk, needsWork, onTrack };
  }, [sortedCips]);

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

  const missingKeySkills = sortedKeySkills.filter((ks) => !ks.is_confirmed);

  function handleSelectCip(cip: GapReportCip) {
    setSelectedCipNumber(cip.cip_number);
    setExpandedKeySkillIds(new Set());
    setMobileView("detail");
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4 rounded-3xl border border-subtle bg-surface-2 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-heading-2 font-semibold text-primary">
                Progress by CiP
              </h1>
              <p className="mt-1 text-small text-secondary">
                Focus on the highest-impact gaps first, then drill into descriptor evidence.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadReport(selectedStageScope)}
              disabled={isLoading}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
            {STAGE_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setSelectedStageScope(tab.value);
                  setSelectedCipNumber(null);
                  setExpandedKeySkillIds(new Set());
                  setMobileView("list");
                  void loadReport(tab.value);
                }}
                className={[
                  "rounded-full px-3 py-1 text-micro font-medium transition-all duration-150",
                  selectedStageScope === tab.value
                    ? "bg-surface-1 text-primary shadow-sm ring-1 ring-subtle"
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
          <div className="flex justify-center py-10 text-small text-muted">Loading...</div>
        ) : report ? (
          <>
            <section className="card mb-4 p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-accent-red/25 bg-accent-red/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-red">
                      At Risk
                    </p>
                    <p className="mt-1 text-heading-3 font-semibold text-accent-red">{counts.atRisk}</p>
                  </div>
                  <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/12 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-amber">
                      Needs Work
                    </p>
                    <p className="mt-1 text-heading-3 font-semibold text-accent-amber">{counts.needsWork}</p>
                  </div>
                  <div className="rounded-xl border border-accent-green/25 bg-accent-green/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-green">
                      On Track
                    </p>
                    <p className="mt-1 text-heading-3 font-semibold text-accent-green">{counts.onTrack}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-small font-semibold text-primary">Recommended Next Actions</h2>
                    <button
                      type="button"
                      onClick={() => setPriorityOnly((prev) => !prev)}
                      className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[11px] font-medium text-secondary hover:bg-surface-3 hover:text-primary"
                    >
                      {priorityOnly ? "Show all CiPs" : "Show priorities only"}
                    </button>
                  </div>
                  {actionCips.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {actionCips.map((cip) => (
                        <button
                          key={cip.cip_number}
                          type="button"
                          onClick={() => handleSelectCip(cip)}
                          className="rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs text-secondary transition hover:bg-surface-3 hover:text-primary"
                        >
                          CiP {cip.cip_number}: {missingSkills(cip)} missing skills
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      All CiPs are currently on track. Keep adding fresh evidence to maintain coverage.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <div className="mb-3 flex gap-0.5 rounded-full bg-surface-3 p-0.5 md:hidden">
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

            <div className="flex flex-col gap-4 md:h-[calc(100vh-14rem)] md:flex-row">
              <div
                className={[
                  "rounded-2xl border border-subtle bg-surface-2 p-2 md:w-[24rem] md:shrink-0 md:overflow-y-auto",
                  mobileView === "list" ? "block" : "hidden md:block",
                ].join(" ")}
              >
                <div className="mb-2 flex items-center justify-between px-2 py-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                    CiP Priorities
                  </h3>
                  <span className="text-[11px] text-muted">{filteredCips.length} shown</span>
                </div>
                <div className="space-y-2">
                  {filteredCips.map((cip) => (
                    <CipListItem
                      key={cip.cip_number}
                      cip={cip}
                      priority={getCipPriority(cip)}
                      missingSkills={missingSkills(cip)}
                      nextAction={nextActionHint(cip)}
                      isSelected={selectedCip?.cip_number === cip.cip_number}
                      onSelect={() => handleSelectCip(cip)}
                    />
                  ))}
                  {filteredCips.length === 0 && (
                    <div className="rounded-xl border border-subtle bg-surface-1 p-4 text-center text-xs text-muted">
                      No priority CiPs right now.
                    </div>
                  )}
                </div>
              </div>

              <div
                className={[
                  "card flex-1 p-4 md:overflow-y-auto md:p-5",
                  mobileView === "detail" ? "block" : "hidden md:block",
                ].join(" ")}
              >
                {selectedCip == null ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <p className="text-small text-muted">
                      Select a CiP to see key skills and descriptor coverage.
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
                    <p className="mt-1 text-small text-secondary">
                      {selectedCip.confirmed_skills} of {selectedCip.total_skills} key skills confirmed (
                      {formatPct(selectedCip.coverage_pct)})
                    </p>

                    <section className="mt-4 rounded-xl border border-accent-blue/25 bg-accent-blue/8 p-3.5">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-accent-blue">
                        Next Best Actions
                      </h3>
                      {missingKeySkills.length > 0 ? (
                        <>
                          <ul className="mt-2 space-y-1.5">
                            {missingKeySkills.slice(0, 3).map((skill, idx) => (
                              <li key={skill.key_skill_id} className="text-xs text-secondary">
                                {idx + 1}. Capture evidence for {skill.title}
                              </li>
                            ))}
                          </ul>
                          <a href="/dashboard/generate" className="btn-primary mt-3 text-xs">
                            Write an Entry for This CiP
                          </a>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-secondary">
                          This CiP is fully covered. Keep adding fresh examples to maintain confidence.
                        </p>
                      )}
                    </section>

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

        {/* ── Mandatory Requirements summary ──────────────────────────────── */}
        {reqSummary && (
          <section className="mt-6 card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-small font-semibold text-primary">
                  Mandatory Requirements
                </h2>
                <p className="text-micro text-muted mt-0.5">
                  Summative OSATS sign-offs, mandatory courses, and exams
                </p>
              </div>
              <a
                href="/dashboard/requirements"
                className="btn-secondary text-xs"
              >
                View all →
              </a>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "OSATS Sign-offs",
                  complete: reqSummary.procedures_complete,
                  total: reqSummary.procedures_total,
                },
                {
                  label: "Courses",
                  complete: reqSummary.courses_complete,
                  total: reqSummary.courses_total,
                },
                {
                  label: "Exams",
                  complete: reqSummary.exams_complete,
                  total: reqSummary.exams_total,
                },
              ].map(({ label, complete, total }) => {
                const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
                const color =
                  pct === 100
                    ? "var(--accent-green)"
                    : pct >= 50
                      ? "var(--accent-blue)"
                      : "var(--accent-amber)";
                return (
                  <div
                    key={label}
                    className="rounded-xl border border-subtle bg-surface-1 px-3 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-secondary">
                        {label}
                      </span>
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color }}
                      >
                        {complete}/{total}
                      </span>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--surface-4)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
