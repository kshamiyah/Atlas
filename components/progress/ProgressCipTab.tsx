"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressCipDetail } from "@/components/progress/ProgressCipDetail";
import { ProgressCipList } from "@/components/progress/ProgressCipList";
import type { ProgressCipsResponse } from "@/lib/types/progress";

const SCOPE_QUERY_KEYS = [
  "year",
  "stage_scope",
  "stage_group",
  "stage_id",
  "date_from",
  "date_to",
  "cip",
] as const;

async function fetchProgressCips(sp: URLSearchParams): Promise<ProgressCipsResponse> {
  const u = new URL("/api/progress/cips", window.location.origin);
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
  return body as ProgressCipsResponse;
}

function parseCipFromUrl(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 14) return null;
  return n;
}

type ProgressCipTabProps = {
  searchParams: URLSearchParams;
  onSelectCip: (cipNumber: number) => void;
};

export function ProgressCipTab({ searchParams, onSelectCip }: ProgressCipTabProps) {
  const [data, setData] = useState<ProgressCipsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchProgressCips(searchParams);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CiPs");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const focusCipFromUrl = parseCipFromUrl(searchParams.get("focus_cip"));
  const legacyCipFromUrl = parseCipFromUrl(searchParams.get("cip"));
  const selectedCipFromUrl = focusCipFromUrl ?? legacyCipFromUrl;
  const rows = useMemo(() => data?.cips ?? [], [data?.cips]);

  const selectedCipNumber = useMemo(() => {
    if (rows.length === 0) return 0;
    if (selectedCipFromUrl != null && rows.some((r) => r.cip_number === selectedCipFromUrl)) {
      return selectedCipFromUrl;
    }
    return rows[0].cip_number;
  }, [rows, selectedCipFromUrl]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.cip_number === selectedCipNumber) ?? null,
    [rows, selectedCipNumber],
  );

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12 text-small text-muted">Loading CiPs…</div>
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

  if (!data || rows.length === 0) {
    return (
      <p className="py-8 text-center text-small text-muted">
        No CiP curriculum rows returned for this scope.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div className="min-w-0 border-b border-subtle pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          All CiPs
        </p>
        <ProgressCipList
          rows={rows}
          selectedCipNumber={selectedCipNumber}
          onSelect={onSelectCip}
        />
      </div>
      <div className="min-w-0 lg:pl-1">
        {selectedRow ? (
          <ProgressCipDetail row={selectedRow} />
        ) : (
          <p className="text-small text-muted">Select a CiP.</p>
        )}
      </div>
    </div>
  );
}
