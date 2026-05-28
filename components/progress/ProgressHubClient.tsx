"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProgressCipTab } from "@/components/progress/ProgressCipTab";
import { ProgressDescriptorsTab } from "@/components/progress/ProgressDescriptorsTab";
import type { DescriptorsTabUrlUpdates } from "@/components/progress/ProgressDescriptorsTab";
import type { KeySkillsTabUrlUpdates } from "@/components/progress/ProgressKeySkillsTab";
import { ProgressKeySkillsTab } from "@/components/progress/ProgressKeySkillsTab";
import { ProgressKpiStrip } from "@/components/progress/ProgressKpiStrip";
import { ProgressMessageCentre } from "@/components/progress/ProgressMessageCentre";
import { ProgressYearBar } from "@/components/progress/ProgressYearBar";
import { ProgressSnapshotView } from "@/components/progress/ProgressSnapshotView";
import { ProgressPrioritiesView } from "@/components/progress/ProgressPrioritiesView";
import {
  ProgressTabsShell,
  type ProgressTabId,
} from "@/components/progress/ProgressTabsShell";
import type { DescriptorsSortMode, KeySkillsSortMode } from "@/lib/progress/query-params";
import type { ProgressSummaryResponse } from "@/lib/types/progress";
import { trackEvent } from "@/lib/telemetry/client";
import {
  curriculumBandLabelForYear,
  curriculumBandScopeForYear,
} from "@/lib/progress/scope-dimensions";
import {
  defaultViewForYear,
  isRetrospectiveYear,
} from "@/lib/progress/year-portfolio";
import {
  normalizeStageName,
  type StageName,
  type StageScope,
} from "@/lib/profile/stage";

const SCOPE_QUERY_KEYS = [
  "year",
  "stage_scope",
  "stage_group",
  "date_from",
  "date_to",
  "cip",
] as const;

function syncCurriculumScopeFromYear(
  params: URLSearchParams,
  year: StageName | null,
): void {
  params.delete("stage_id");
  params.delete("stage_group");
  if (!year) {
    params.delete("stage_scope");
    return;
  }
  const band = curriculumBandScopeForYear(year);
  if (band) params.set("stage_scope", band);
  else params.delete("stage_scope");
}

type ProgressViewId = "snapshot" | "priorities" | "overview";

type ProgressUrlUpdates = {
  view?: ProgressViewId;
  year?: StageName | null;
  tab?: ProgressTabId;
  cip?: number | null;
  focus_cip?: number | null;
  focus_skill?: string | null;
  focus_descriptor?: string | null;
  gaps_only?: boolean | null;
  confirmed_only?: boolean | null;
  sort?: KeySkillsSortMode | null;
  descriptor_gaps_only?: boolean | null;
  descriptor_covered_only?: boolean | null;
  descriptor_sort?: DescriptorsSortMode | null;
};

function buildProgressUrl(
  pathname: string,
  source: URLSearchParams,
  updates: ProgressUrlUpdates,
): string {
  const p = new URLSearchParams(source.toString());
  if ("view" in updates && updates.view !== undefined) {
    p.set("view", updates.view);
  }
  if ("year" in updates) {
    if (updates.year) {
      p.set("year", updates.year);
    } else {
      p.delete("year");
    }
    syncCurriculumScopeFromYear(p, updates.year ?? null);
  }
  if (updates.tab !== undefined) {
    p.set("tab", updates.tab);
  }
  if ("cip" in updates) {
    if (updates.cip === null) p.delete("cip");
    else p.set("cip", String(updates.cip));
  }
  if ("focus_cip" in updates) {
    if (updates.focus_cip === null) p.delete("focus_cip");
    else p.set("focus_cip", String(updates.focus_cip));
  }
  if ("focus_skill" in updates) {
    const fs = updates.focus_skill;
    if (fs === null || fs === "") p.delete("focus_skill");
    else if (typeof fs === "string") p.set("focus_skill", fs);
  }
  if ("focus_descriptor" in updates) {
    const fd = updates.focus_descriptor;
    if (fd === null || fd === "") p.delete("focus_descriptor");
    else if (typeof fd === "string") p.set("focus_descriptor", fd);
  }
  if ("gaps_only" in updates) {
    if (updates.gaps_only === true) {
      p.set("gaps_only", "1");
      p.delete("confirmed_only");
    } else if (updates.gaps_only === false) {
      p.delete("gaps_only");
    }
  }
  if ("confirmed_only" in updates) {
    if (updates.confirmed_only === true) {
      p.set("confirmed_only", "1");
      p.delete("gaps_only");
    } else if (updates.confirmed_only === false) {
      p.delete("confirmed_only");
    }
  }
  if ("sort" in updates && updates.sort !== undefined) {
    if (updates.sort === null) {
      // no-op
    } else if (updates.sort === "skill_number") {
      p.delete("sort");
    } else {
      p.set("sort", updates.sort);
    }
  }
  if ("descriptor_gaps_only" in updates) {
    if (updates.descriptor_gaps_only === true) {
      p.set("descriptor_gaps_only", "1");
      p.delete("descriptor_covered_only");
    } else if (updates.descriptor_gaps_only === false) {
      p.delete("descriptor_gaps_only");
    }
  }
  if ("descriptor_covered_only" in updates) {
    if (updates.descriptor_covered_only === true) {
      p.set("descriptor_covered_only", "1");
      p.delete("descriptor_gaps_only");
    } else if (updates.descriptor_covered_only === false) {
      p.delete("descriptor_covered_only");
    }
  }
  if ("descriptor_sort" in updates && updates.descriptor_sort !== undefined) {
    if (updates.descriptor_sort === null || updates.descriptor_sort === "curricular") {
      p.delete("descriptor_sort");
    } else {
      p.set("descriptor_sort", updates.descriptor_sort);
    }
  }
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}

async function fetchProgressSummary(sp: URLSearchParams): Promise<ProgressSummaryResponse> {
  const u = new URL("/api/progress/summary", window.location.origin);
  for (const k of SCOPE_QUERY_KEYS) {
    const v = sp.get(k);
    if (v) u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { headers: { "Content-Type": "application/json" } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as ProgressSummaryResponse;
}

async function fetchProgressSummaryWithRetry(
  sp: URLSearchParams,
  attempts = 3,
): Promise<ProgressSummaryResponse> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchProgressSummary(sp);
    } catch (e) {
      last = e;
      if (i < attempts - 1) {
        await new Promise((r) => window.setTimeout(r, 350 * (i + 1)));
      }
    }
  }
  throw last;
}

function parseTab(raw: string | null): ProgressTabId {
  if (raw === "key-skills" || raw === "descriptors") return raw;
  if (raw === "cips") return "cips";
  return "cips";
}

function parseView(raw: string | null): ProgressViewId {
  if (raw === "overview") return "overview";
  if (raw === "snapshot") return "snapshot";
  return "priorities";
}

export function ProgressHubClient({
  initialYear = null,
  currentYear = null,
}: {
  initialYear?: StageName | null;
  currentYear?: StageName | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const stableSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const tabFromUrl = parseTab(stableSearchParams.get("tab"));
  const viewFromUrl = parseView(stableSearchParams.get("view"));
  const yearFromUrl = normalizeStageName(stableSearchParams.get("year"));
  const cipFromUrl = stableSearchParams.get("cip");

  const [selectedYear, setSelectedYear] = useState<StageName | null>(
    yearFromUrl ?? initialYear,
  );
  const [activeView, setActiveView] = useState<ProgressViewId>(viewFromUrl);
  const [activeTab, setActiveTab] = useState<ProgressTabId>(tabFromUrl);
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveView(viewFromUrl);
  }, [viewFromUrl]);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    setSelectedYear(yearFromUrl ?? initialYear);
  }, [initialYear, yearFromUrl]);

  useEffect(() => {
    if (yearFromUrl || !initialYear) return;
    const href = buildProgressUrl(pathname, stableSearchParams, {
      view: activeView,
      year: initialYear,
      tab: activeTab,
    });
    router.replace(href, { scroll: false });
  }, [activeTab, activeView, initialYear, pathname, router, stableSearchParams, yearFromUrl]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const effectiveSearchParams = new URLSearchParams(stableSearchParams.toString());
      if (selectedYear) {
        effectiveSearchParams.set("year", selectedYear);
        syncCurriculumScopeFromYear(effectiveSearchParams, selectedYear);
      } else {
        effectiveSearchParams.delete("year");
        effectiveSearchParams.delete("stage_id");
      }
      const next = await fetchProgressSummaryWithRetry(effectiveSearchParams);
      setData(next);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load progress");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, stableSearchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const onYearChange = useCallback(
    (year: StageName) => {
      setSelectedYear(year);
      const nextView = defaultViewForYear(year, currentYear);
      setActiveView(nextView);
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view: nextView,
        year,
        tab: activeTab,
      });
      router.replace(href, { scroll: false });
    },
    [activeTab, currentYear, pathname, router, stableSearchParams],
  );

  const selectedStageScope = useMemo((): StageScope | null => {
    if (selectedYear) return curriculumBandScopeForYear(selectedYear);
    const fromUrl = stableSearchParams.get("stage_scope");
    if (fromUrl === "BAND_ST1_2" || fromUrl === "BAND_ST3_5" || fromUrl === "BAND_ST6_7") {
      return fromUrl;
    }
    return null;
  }, [selectedYear, stableSearchParams]);

  const onTabChange = useCallback(
    (tab: ProgressTabId) => {
      trackEvent("progress_tab_change", { tab });
      setActiveTab(tab);
      const p = new URLSearchParams(searchParamsString);
      p.set("view", "overview");
      p.set("tab", tab);
      if (tab !== "key-skills") {
        p.delete("gaps_only");
        p.delete("confirmed_only");
        p.delete("sort");
      }
      if (tab !== "descriptors") {
        p.delete("descriptor_gaps_only");
        p.delete("descriptor_covered_only");
        p.delete("descriptor_sort");
        p.delete("focus_descriptor");
      }
      if (tab === "cips") {
        p.delete("focus_skill");
      }
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const onViewChange = useCallback(
    (view: ProgressViewId) => {
      setActiveView(view);
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view,
        tab: activeTab,
      });
      router.replace(href, { scroll: false });
    },
    [activeTab, pathname, router, stableSearchParams],
  );

  const onSelectCip = useCallback(
    (cipNumber: number) => {
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view: "overview",
        tab: "cips",
        focus_cip: cipNumber,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, stableSearchParams],
  );

  const onKeySkillsUrlUpdate = useCallback(
    (u: KeySkillsTabUrlUpdates) => {
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view: "overview",
        tab: "key-skills",
        ...u,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, stableSearchParams],
  );

  const onDescriptorsUrlUpdate = useCallback(
    (u: DescriptorsTabUrlUpdates) => {
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view: "overview",
        tab: "descriptors",
        ...u,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, stableSearchParams],
  );

  const updatedLabel = useMemo(() => {
    if (!data?.updated_at) return null;
    const d = new Date(data.updated_at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, [data?.updated_at]);

  const yearLabel = selectedYear ?? "Not set";
  const curriculumBandLabel = selectedYear
    ? curriculumBandLabelForYear(selectedYear)
    : null;
  const checkpointLabel = currentYear ?? data?.checkpoint.current_stage ?? "Not set";
  const viewingRetrospective = isRetrospectiveYear(selectedYear, currentYear);
  const activeCipScope =
    cipFromUrl && /^\d+$/.test(cipFromUrl) ? Number.parseInt(cipFromUrl, 10) : null;

  const viewOptions = useMemo(() => {
    const snapshot = {
      id: "snapshot" as const,
      label: "Snapshot",
      sub: "Year portfolio summary",
    };
    const priorities = {
      id: "priorities" as const,
      label: "Priorities",
      sub: "What to do next",
    };
    const overview = {
      id: "overview" as const,
      label: "Overview",
      sub: "Coverage drill-downs",
    };
    return viewingRetrospective
      ? [snapshot, overview, priorities]
      : [priorities, overview];
  }, [viewingRetrospective]);

  useEffect(() => {
    if (activeView !== "snapshot") return;
    if (!viewingRetrospective) {
      setActiveView("priorities");
      const href = buildProgressUrl(pathname, stableSearchParams, {
        view: "priorities",
        tab: activeTab,
      });
      router.replace(href, { scroll: false });
    }
  }, [
    activeTab,
    activeView,
    pathname,
    router,
    stableSearchParams,
    viewingRetrospective,
  ]);

  const clearCipScope = useCallback(() => {
    const href = buildProgressUrl(pathname, stableSearchParams, {
      cip: null,
      focus_cip: null,
      focus_skill: null,
      focus_descriptor: null,
    });
    router.replace(href, { scroll: false });
  }, [pathname, router, stableSearchParams]);

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 border-b border-subtle pb-5 md:pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-heading-2 font-semibold text-primary">Progress</h1>
              <p className="mt-1 max-w-xl text-small text-secondary">
                Pick a training year for formal requirements and ARCP expectations. CiP and key
                skill coverage uses the curriculum band that year belongs to.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-subtle bg-surface-2 px-3 py-1 text-micro text-secondary">
                  Requirements year: <span className="font-medium text-primary">{yearLabel}</span>
                </span>
                {curriculumBandLabel ? (
                  <span className="rounded-full border border-subtle bg-surface-2 px-3 py-1 text-micro text-secondary">
                    Curriculum band: <span className="font-medium text-primary">{curriculumBandLabel}</span>
                    {selectedStageScope === "BAND_ST1_2"
                      ? " (ST1–ST2)"
                      : selectedStageScope === "BAND_ST3_5"
                        ? " (ST3–ST5)"
                        : selectedStageScope === "BAND_ST6_7"
                          ? " (ST6–ST7)"
                          : ""}
                  </span>
                ) : null}
                <span className="rounded-full border border-subtle bg-surface-2 px-3 py-1 text-micro text-secondary">
                  Your current year: <span className="font-medium text-primary">{checkpointLabel}</span>
                </span>
                {activeCipScope != null ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-accent-primary/20 bg-accent-primary/8 px-3 py-1 text-micro text-secondary">
                    Viewing: <span className="font-medium text-primary">CiP {activeCipScope} only</span>
                    <button
                      type="button"
                      onClick={clearCipScope}
                      className="font-medium text-accent-primary underline-offset-2 hover:underline"
                    >
                      Clear
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <ProgressYearBar
            selectedYear={selectedYear}
            currentYear={currentYear}
            onYearChange={onYearChange}
            disabled={isLoading}
          />

          <div className="mt-4 inline-flex flex-wrap gap-0.5 rounded-full bg-surface-3 p-0.5">
            {viewOptions.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => onViewChange(view.id)}
                className={[
                  "rounded-full px-3 py-1.5 text-micro font-medium transition-all duration-150",
                  activeView === view.id
                    ? "bg-surface-1 text-primary shadow-sm ring-1 ring-subtle"
                    : "text-muted hover:text-secondary",
                ].join(" ")}
              >
                {view.label}
                <span className="ml-1 opacity-60">{view.sub}</span>
              </button>
            ))}
          </div>

          <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-muted">
            CiPs, key skills, and descriptors carry over within the curriculum band — so ST2
            includes progress from ST1. OSATS, courses, and exams are scoped to the selected year
            only.
          </p>

          {updatedLabel && (
            <p className="mt-3 text-[11px] text-muted">Updated {updatedLabel}</p>
          )}
        </header>

        {errorMessage && (
          <div
            className="mb-4 rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-micro text-accent-red"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {activeView === "snapshot" ? (
          <ProgressSnapshotView
            selectedYear={selectedYear}
            currentYear={currentYear}
            selectedStageScope={selectedStageScope}
            progressData={data}
            isLoadingProgress={isLoading}
          />
        ) : activeView === "priorities" ? (
          <ProgressPrioritiesView
            selectedYear={selectedYear}
            selectedStageScope={selectedStageScope}
          />
        ) : isLoading && !data ? (
          <div className="flex justify-center py-12 text-small text-muted">Loading metrics…</div>
        ) : data ? (
          <>
            <section aria-label="Progress overview">
              <h2 className="sr-only">Progress overview</h2>
              <ProgressKpiStrip
                kpis={data.kpis}
                checkpoint={data.checkpoint}
                showBandCoverageHint={selectedStageScope === "BAND_ST1_2"}
              />
            </section>

            <ProgressMessageCentre messages={data.messages} />

            <ProgressTabsShell activeTab={activeTab} onTabChange={onTabChange}>
              {activeTab === "cips" ? (
                <ProgressCipTab searchParams={stableSearchParams} onSelectCip={onSelectCip} />
              ) : null}
              {activeTab === "key-skills" ? (
                <ProgressKeySkillsTab
                  searchParams={stableSearchParams}
                  onUrlUpdate={onKeySkillsUrlUpdate}
                />
              ) : null}
              {activeTab === "descriptors" ? (
                <ProgressDescriptorsTab
                  searchParams={stableSearchParams}
                  onUrlUpdate={onDescriptorsUrlUpdate}
                />
              ) : null}
            </ProgressTabsShell>
          </>
        ) : null}
      </main>
    </div>
  );
}
