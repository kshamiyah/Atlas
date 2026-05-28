"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressDescriptorDetail } from "@/components/progress/ProgressDescriptorDetail";
import { ProgressDescriptorList } from "@/components/progress/ProgressDescriptorList";
import type { DescriptorsSortMode } from "@/lib/progress/query-params";
import type { ProgressDescriptorsResponse } from "@/lib/types/progress";

const SCOPE_QUERY_KEYS = [
  "year",
  "stage_scope",
  "stage_group",
  "stage_id",
  "date_from",
  "date_to",
  "cip",
] as const;

const DESCRIPTOR_LIST_KEYS = [
  ...SCOPE_QUERY_KEYS,
  "descriptor_gaps_only",
  "descriptor_covered_only",
  "descriptor_sort",
] as const;

export type DescriptorsTabUrlUpdates = {
  focus_cip?: number | null;
  focus_skill?: string | null;
  focus_descriptor?: string | null;
  descriptor_gaps_only?: boolean | null;
  descriptor_covered_only?: boolean | null;
  descriptor_sort?: DescriptorsSortMode | null;
};

async function fetchProgressDescriptors(sp: URLSearchParams): Promise<ProgressDescriptorsResponse> {
  const u = new URL("/api/progress/descriptors", window.location.origin);
  for (const k of DESCRIPTOR_LIST_KEYS) {
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
  return body as ProgressDescriptorsResponse;
}

function parseFocusCip(raw: string | null): number | null {
  if (raw == null || raw === "" || !/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 14) return null;
  return n;
}

function buildDescriptorReviewHref(
  sp: URLSearchParams,
  cipNumber: number,
  skillId: string,
  descriptorId: string,
): string {
  const p = new URLSearchParams();
  for (const k of SCOPE_QUERY_KEYS) {
    const v = sp.get(k);
    if (v) p.set(k, v);
  }
  p.set("focus_cip", String(cipNumber));
  p.set("focus_skill", skillId);
  p.set("focus_descriptor", descriptorId);
  const q = p.toString();
  return q ? `/dashboard/key-skill-review?${q}` : "/dashboard/key-skill-review";
}

type FlatNode = {
  cip: ProgressDescriptorsResponse["groups"][number];
  skill: ProgressDescriptorsResponse["groups"][number]["skills"][number];
  desc: ProgressDescriptorsResponse["groups"][number]["skills"][number]["descriptors"][number];
};

type ProgressDescriptorsTabProps = {
  searchParams: URLSearchParams;
  onUrlUpdate: (updates: DescriptorsTabUrlUpdates) => void;
};

export function ProgressDescriptorsTab({ searchParams, onUrlUpdate }: ProgressDescriptorsTabProps) {
  const [data, setData] = useState<ProgressDescriptorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchProgressDescriptors(searchParams);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load descriptors");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const gapsOnly =
    searchParams.get("descriptor_gaps_only") === "1" ||
    searchParams.get("descriptor_gaps_only") === "true";
  const coveredOnly =
    searchParams.get("descriptor_covered_only") === "1" ||
    searchParams.get("descriptor_covered_only") === "true";
  const sortRaw = searchParams.get("descriptor_sort");
  const sort: DescriptorsSortMode =
    sortRaw === "impact" || sortRaw === "recent" ? sortRaw : "curricular";

  const focusDescriptorId = searchParams.get("focus_descriptor");
  const focusSkillId = searchParams.get("focus_skill");
  const focusCip = parseFocusCip(searchParams.get("focus_cip"));

  const flat = useMemo(() => {
    const g = data?.groups ?? [];
    const out: FlatNode[] = [];
    for (const cip of g) {
      for (const sk of cip.skills) {
        for (const desc of sk.descriptors) {
          out.push({ cip, skill: sk, desc });
        }
      }
    }
    return out;
  }, [data?.groups]);

  const selected = useMemo((): FlatNode | null => {
    if (flat.length === 0) return null;
    if (focusDescriptorId) {
      const hit = flat.find((x) => x.desc.descriptor_id === focusDescriptorId);
      if (hit) return hit;
    }
    if (focusSkillId) {
      const inSkill = flat.filter((x) => x.skill.key_skill_id === focusSkillId);
      if (inSkill.length > 0) return inSkill[0];
    }
    if (focusCip != null) {
      const inCip = flat.filter((x) => x.cip.cip_number === focusCip);
      if (inCip.length > 0) return inCip[0];
    }
    return flat[0];
  }, [flat, focusDescriptorId, focusSkillId, focusCip]);

  const setDescriptorGapsOnly = (on: boolean) => {
    if (on) {
      onUrlUpdate({ descriptor_gaps_only: true, descriptor_covered_only: false });
    } else {
      onUrlUpdate({ descriptor_gaps_only: false });
    }
  };

  const setDescriptorCoveredOnly = (on: boolean) => {
    if (on) {
      onUrlUpdate({ descriptor_covered_only: true, descriptor_gaps_only: false });
    } else {
      onUrlUpdate({ descriptor_covered_only: false });
    }
  };

  const setDescriptorSort = (next: DescriptorsSortMode) => {
    onUrlUpdate({ descriptor_sort: next });
  };

  const onSelectDescriptor = (cipNumber: number, skillId: string, descriptorId: string) => {
    onUrlUpdate({
      focus_cip: cipNumber,
      focus_skill: skillId,
      focus_descriptor: descriptorId,
    });
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12 text-small text-muted">Loading descriptors…</div>
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

  const filterActive = gapsOnly || coveredOnly;

  if (!data || (data.groups?.length ?? 0) === 0) {
    return (
      <p className="py-8 text-center text-small text-muted">
        {filterActive
          ? "No descriptors match these filters. Try clearing gaps-only or covered-only."
          : "No descriptors in this scope."}
      </p>
    );
  }

  const reviewHref = selected
    ? buildDescriptorReviewHref(
        searchParams,
        selected.cip.cip_number,
        selected.skill.key_skill_id,
        selected.desc.descriptor_id,
      )
    : "/dashboard/key-skill-review";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1/50 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setDescriptorGapsOnly(e.target.checked)}
            className="rounded border-subtle"
          />
          Gaps only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={coveredOnly}
            onChange={(e) => setDescriptorCoveredOnly(e.target.checked)}
            className="rounded border-subtle"
          />
          Covered only
        </label>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setDescriptorSort(e.target.value as DescriptorsSortMode)}
            className="rounded-lg border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-primary"
          >
            <option value="curricular">Curricular</option>
            <option value="impact">Impact</option>
            <option value="recent">Recent activity</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-subtle pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            Descriptors
          </p>
          <ProgressDescriptorList
            groups={data.groups}
            selectedDescriptorId={selected?.desc.descriptor_id ?? null}
            onSelect={onSelectDescriptor}
          />
        </div>
        <div className="min-w-0 lg:pl-1">
          {selected ? (
            <ProgressDescriptorDetail
              cip={selected.cip}
              skillTitle={selected.skill.title}
              skillNumber={selected.skill.skill_number}
              row={selected.desc}
              reviewHref={reviewHref}
            />
          ) : (
            <p className="text-small text-muted">Select a descriptor.</p>
          )}
        </div>
      </div>
    </div>
  );
}
