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
import { ProgressScopeBar } from "@/components/progress/ProgressScopeBar";
import {
  ProgressTabsShell,
  type ProgressTabId,
} from "@/components/progress/ProgressTabsShell";
import type { DescriptorsSortMode, KeySkillsSortMode } from "@/lib/progress/query-params";
import type { ProgressSummaryResponse } from "@/lib/types/progress";
import { trackEvent } from "@/lib/telemetry/client";

const SCOPE_QUERY_KEYS = [
  "stage_scope",
  "stage_group",
  "stage_id",
  "date_from",
  "date_to",
  "cip",
] as const;

type ProgressUrlUpdates = {
  stage_scope?: string | null;
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
  if ("stage_scope" in updates) {
    p.delete("stage_group");
    p.delete("stage_id");
    if (updates.stage_scope) p.set("stage_scope", updates.stage_scope);
    else p.delete("stage_scope");
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

export function ProgressHubClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabFromUrl = parseTab(searchParams.get("tab"));
  const stageFromUrl = searchParams.get("stage_scope");

  const [selectedStageScope, setSelectedStageScope] = useState<string | null>(
    stageFromUrl && stageFromUrl.length > 0 ? stageFromUrl : null,
  );
  const [activeTab, setActiveTab] = useState<ProgressTabId>(tabFromUrl);
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    setSelectedStageScope(stageFromUrl && stageFromUrl.length > 0 ? stageFromUrl : null);
  }, [stageFromUrl]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchProgressSummaryWithRetry(searchParams);
      setData(next);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load progress");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const onStageScopeChange = useCallback(
    (value: string | null) => {
      setSelectedStageScope(value);
      const href = buildProgressUrl(pathname, searchParams, {
        stage_scope: value,
        tab: activeTab,
      });
      router.replace(href, { scroll: false });
    },
    [activeTab, pathname, router, searchParams],
  );

  const onTabChange = useCallback(
    (tab: ProgressTabId) => {
      trackEvent("progress_tab_change", { tab });
      setActiveTab(tab);
      const p = new URLSearchParams(searchParams.toString());
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
    [pathname, router, searchParams],
  );

  const onSelectCip = useCallback(
    (cipNumber: number) => {
      const href = buildProgressUrl(pathname, searchParams, {
        tab: "cips",
        focus_cip: cipNumber,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const onKeySkillsUrlUpdate = useCallback(
    (u: KeySkillsTabUrlUpdates) => {
      const href = buildProgressUrl(pathname, searchParams, {
        tab: "key-skills",
        ...u,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const onDescriptorsUrlUpdate = useCallback(
    (u: DescriptorsTabUrlUpdates) => {
      const href = buildProgressUrl(pathname, searchParams, {
        tab: "descriptors",
        ...u,
      });
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
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

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 rounded-3xl border border-subtle bg-surface-2 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-heading-2 font-semibold text-primary">Progress</h1>
              <p className="mt-1 max-w-xl text-small text-secondary">
                Coverage at CiP, key skill, and descriptor level. Use the scope bar to match
                a training band; detailed breakdowns will land in the tabs below.
              </p>
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

          <ProgressScopeBar
            selectedStageScope={selectedStageScope}
            onStageScopeChange={onStageScopeChange}
            disabled={isLoading}
          />

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

        {isLoading && !data ? (
          <div className="flex justify-center py-12 text-small text-muted">Loading metrics…</div>
        ) : data ? (
          <>
            <section aria-label="Progress snapshot">
              <h2 className="sr-only">Progress snapshot</h2>
              <ProgressKpiStrip kpis={data.kpis} checkpoint={data.checkpoint} />
            </section>

            <ProgressMessageCentre messages={data.messages} />

            <ProgressTabsShell activeTab={activeTab} onTabChange={onTabChange}>
              {activeTab === "cips" ? (
                <ProgressCipTab searchParams={searchParams} onSelectCip={onSelectCip} />
              ) : null}
              {activeTab === "key-skills" ? (
                <ProgressKeySkillsTab
                  searchParams={searchParams}
                  onUrlUpdate={onKeySkillsUrlUpdate}
                />
              ) : null}
              {activeTab === "descriptors" ? (
                <ProgressDescriptorsTab
                  searchParams={searchParams}
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
