import type { GeneratedEntryType } from "@/lib/types/entries";

const VALID_ENTRY_TYPES = new Set<string>([
  "reflection",
  "procedure",
  "cip_assessment",
  "cbd",
  "minicex",
  "notss",
  "osats_formative",
  "osats_summative",
  "other_evidence",
]);

export type WriteEntryLinkParams = {
  skillId?: string | null;
  cip?: number | string | null;
  entryType?: GeneratedEntryType | null;
};

function normalizeCip(cip: number | string | null | undefined): number | null {
  if (cip == null) return null;
  if (typeof cip === "number") {
    return Number.isFinite(cip) ? Math.trunc(cip) : null;
  }
  const trimmed = cip.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return n >= 1 && n <= 14 ? n : null;
}

export function buildWriteEntryHref(params: WriteEntryLinkParams = {}): string {
  const sp = new URLSearchParams();
  if (params.skillId?.trim()) sp.set("skill", params.skillId.trim());
  const cip = normalizeCip(params.cip ?? null);
  if (cip != null) sp.set("cip", String(cip));
  if (params.entryType) sp.set("entry_type", params.entryType);
  const q = sp.toString();
  return q ? `/dashboard/generate?${q}` : "/dashboard/generate";
}

export type ParsedWriteEntryParams = {
  skillId: string | null;
  cip: number | null;
  entryType: GeneratedEntryType | null;
};

export function parseWriteEntryParams(
  searchParams: URLSearchParams,
): ParsedWriteEntryParams {
  const skillRaw = searchParams.get("skill");
  const skillId = skillRaw?.trim() ? skillRaw.trim() : null;

  const cipRaw = searchParams.get("cip");
  let cip: number | null = null;
  if (cipRaw && /^\d+$/.test(cipRaw)) {
    const n = Number.parseInt(cipRaw, 10);
    if (n >= 1 && n <= 14) cip = n;
  }

  const entryTypeRaw = searchParams.get("entry_type");
  const entryType =
    entryTypeRaw && VALID_ENTRY_TYPES.has(entryTypeRaw)
      ? (entryTypeRaw as GeneratedEntryType)
      : null;

  return { skillId, cip, entryType };
}
