"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressKeySkillDetail } from "@/components/progress/ProgressKeySkillDetail";
import { ProgressKeySkillList } from "@/components/progress/ProgressKeySkillList";
import type { KeySkillsSortMode } from "@/lib/progress/query-params";
import type { ProgressKeySkillsResponse } from "@/lib/types/progress";

const SCOPE_QUERY_KEYS = [
  "year",
  "stage_scope",
  "stage_group",
  "stage_id",
  "date_from",
  "date_to",
  "cip",
] as const;

const LIST_QUERY_KEYS = [...SCOPE_QUERY_KEYS, "gaps_only", "confirmed_only", "sort"] as const;

export type KeySkillsTabUrlUpdates = {
  focus_cip?: number | null;
  focus_skill?: string | null;
  gaps_only?: boolean | null;
  confirmed_only?: boolean | null;
  sort?: KeySkillsSortMode | null;
};

async function fetchProgressKeySkills(sp: URLSearchParams): Promise<ProgressKeySkillsResponse> {
  const u = new URL("/api/progress/key-skills", window.location.origin);
  for (const k of LIST_QUERY_KEYS) {
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
  return body as ProgressKeySkillsResponse;
}

function parseSort(sp: URLSearchParams): KeySkillsSortMode {
  const s = sp.get("sort");
  if (s === "impact" || s === "recent") return s;
  return "skill_number";
}

function buildReviewHref(
  sp: URLSearchParams,
  focusCip: number,
  focusSkill: string,
): string {
  const p = new URLSearchParams();
  for (const k of SCOPE_QUERY_KEYS) {
    const v = sp.get(k);
    if (v) p.set(k, v);
  }
  p.set("focus_cip", String(focusCip));
  p.set("focus_skill", focusSkill);
  const q = p.toString();
  return q ? `/dashboard/key-skill-review?${q}` : "/dashboard/key-skill-review";
}

type ProgressKeySkillsTabProps = {
  searchParams: URLSearchParams;
  onUrlUpdate: (updates: KeySkillsTabUrlUpdates) => void;
};

export function ProgressKeySkillsTab({ searchParams, onUrlUpdate }: ProgressKeySkillsTabProps) {
  const [data, setData] = useState<ProgressKeySkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchProgressKeySkills(searchParams);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load key skills");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const gapsOnly = searchParams.get("gaps_only") === "1" || searchParams.get("gaps_only") === "true";
  const confirmedOnly =
    searchParams.get("confirmed_only") === "1" || searchParams.get("confirmed_only") === "true";
  const sort = parseSort(searchParams);

  const focusSkillId = searchParams.get("focus_skill");
  const focusCipRaw = searchParams.get("focus_cip");
  const focusCipParsed =
    focusCipRaw && /^\d+$/.test(focusCipRaw)
      ? Number.parseInt(focusCipRaw, 10)
      : null;
  const focusCip =
    focusCipParsed != null && focusCipParsed >= 1 && focusCipParsed <= 14
      ? focusCipParsed
      : null;

  const flatSkills = useMemo(() => {
    const groups = data?.groups ?? [];
    const out: Array<{
      group: (typeof groups)[number];
      skill: (typeof groups)[number]["key_skills"][number];
    }> = [];
    for (const g of groups) {
      for (const s of g.key_skills) {
        out.push({ group: g, skill: s });
      }
    }
    return out;
  }, [data?.groups]);

  const selected = useMemo(() => {
    if (flatSkills.length === 0) return null;
    if (focusSkillId) {
      const hit = flatSkills.find((x) => x.skill.key_skill_id === focusSkillId);
      if (hit) return hit;
    }
    if (focusCip != null) {
      const inCip = flatSkills.filter((x) => x.group.cip_number === focusCip);
      if (inCip.length > 0) return inCip[0];
    }
    return flatSkills[0];
  }, [flatSkills, focusSkillId, focusCip]);

  const selectedSkillId = selected?.skill.key_skill_id ?? null;

  const setGapsOnly = (on: boolean) => {
    if (on) onUrlUpdate({ gaps_only: true, confirmed_only: false });
    else onUrlUpdate({ gaps_only: false });
  };

  const setConfirmedOnly = (on: boolean) => {
    if (on) onUrlUpdate({ confirmed_only: true, gaps_only: false });
    else onUrlUpdate({ confirmed_only: false });
  };

  const setSort = (next: KeySkillsSortMode) => {
    onUrlUpdate({ sort: next });
  };

  const onSelectSkill = (cipNumber: number, skillId: string) => {
    onUrlUpdate({ focus_cip: cipNumber, focus_skill: skillId });
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12 text-small text-muted">Loading key skills…</div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-micro text-accent-red"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <p className="py-8 text-center text-small text-muted">
        No key skills match this scope or filters.
      </p>
    );
  }

  const reviewHref =
    selected != null
      ? buildReviewHref(searchParams, selected.group.cip_number, selected.skill.key_skill_id)
      : "/dashboard/key-skill-review";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1/50 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setGapsOnly(e.target.checked)}
            className="rounded border-subtle"
          />
          Gaps only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={confirmedOnly}
            onChange={(e) => setConfirmedOnly(e.target.checked)}
            className="rounded border-subtle"
          />
          Confirmed only
        </label>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as KeySkillsSortMode)}
            className="rounded-lg border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-primary"
          >
            <option value="skill_number">Skill number</option>
            <option value="impact">Impact (gaps first)</option>
            <option value="recent">Recent activity</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-subtle pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          <ProgressKeySkillList
            groups={data.groups}
            selectedSkillId={selectedSkillId}
            onSelectSkill={onSelectSkill}
          />
        </div>
        <div className="min-w-0 lg:pl-1">
          {selected ? (
            <ProgressKeySkillDetail
              group={selected.group}
              skill={selected.skill}
              reviewHref={reviewHref}
            />
          ) : (
            <p className="text-small text-muted">Select a key skill.</p>
          )}
        </div>
      </div>
    </div>
  );
}
