type JsonLike = Record<string, unknown> | null | undefined;

export const KAIZEN_CONSULTANT_ROLE_ID = 597;

export type ProcedureCatalogLite = {
  kaizen_id: number;
  name: string;
};

export type OsatsEntryLite = {
  detected_entry_type?: string | null;
  extracted_fields?: JsonLike;
  kaizen_procedure_id?: number | null;
  assessor_role_id?: number | null;
};

function normalizeWhitespace(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function getFieldPairs(fields: JsonLike): Array<{ key: string; value: string }> {
  if (!fields || typeof fields !== "object") return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const [rawKey, rawValue] of Object.entries(fields)) {
    const key = normalizeKey(rawKey);
    const value = normalizeWhitespace(rawValue);
    if (!key || !value) continue;
    out.push({ key, value });
  }
  return out;
}

function parseNumericCode(value: string): number | null {
  const text = normalizeWhitespace(value);
  if (!text) return null;

  const tailMatch = text.match(/\((\d+)\)\s*$/);
  if (tailMatch) return Number.parseInt(tailMatch[1], 10);

  // Support raw numeric controls where the value itself is the code.
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);

  return null;
}

function procedureMatchKey(value: string): string {
  const text = normalizeWhitespace(value).replace(/\(\d+\)\s*$/, "").trim();
  return normalizeKey(text);
}

function inferProcedureIdFromName(
  value: string,
  proceduresCatalog: ProcedureCatalogLite[],
  validIds: Set<number>,
): number | null {
  const key = procedureMatchKey(value);
  if (!key) return null;

  for (const procedure of proceduresCatalog) {
    if (!validIds.has(procedure.kaizen_id)) continue;
    if (procedureMatchKey(procedure.name) === key) {
      return procedure.kaizen_id;
    }
  }

  return null;
}

function inferAssessorRoleFromText(value: string): number | null {
  const parsed = parseNumericCode(value);
  if (parsed !== null) return parsed;

  const key = normalizeKey(value);
  if (key.includes("consultant")) return KAIZEN_CONSULTANT_ROLE_ID;

  return null;
}

export function inferOsatsProcedureId(
  entry: OsatsEntryLite,
  proceduresCatalog: ProcedureCatalogLite[],
): number | null {
  const validIds = new Set(
    proceduresCatalog
      .map((p) => p.kaizen_id)
      .filter((value): value is number => isFiniteInteger(value)),
  );
  if (validIds.size === 0) return null;

  if (isFiniteInteger(entry.kaizen_procedure_id) && validIds.has(entry.kaizen_procedure_id)) {
    return entry.kaizen_procedure_id;
  }

  const pairs = getFieldPairs(entry.extracted_fields);
  for (const pair of pairs) {
    if (!pair.key.includes("procedure")) continue;
    const parsed = parseNumericCode(pair.value);
    if (parsed !== null && validIds.has(parsed)) return parsed;
    const byName = inferProcedureIdFromName(pair.value, proceduresCatalog, validIds);
    if (byName !== null) return byName;
  }

  return null;
}

export function inferAssessorRoleId(entry: OsatsEntryLite): number | null {
  if (isFiniteInteger(entry.assessor_role_id)) return entry.assessor_role_id;

  const pairs = getFieldPairs(entry.extracted_fields);
  for (const pair of pairs) {
    const key = pair.key;
    if (
      key.includes("assessor role") ||
      (key.includes("role") && key.includes("assessor"))
    ) {
      const parsed = inferAssessorRoleFromText(pair.value);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function inferOsatsStorageFields(
  entry: OsatsEntryLite,
  proceduresCatalog: ProcedureCatalogLite[],
): { kaizen_procedure_id: number | null; assessor_role_id: number | null } {
  return {
    kaizen_procedure_id: inferOsatsProcedureId(entry, proceduresCatalog),
    assessor_role_id: inferAssessorRoleId(entry),
  };
}

function catalogProcedureIds(
  proceduresCatalog: ProcedureCatalogLite[],
): Set<number> {
  return new Set(
    proceduresCatalog
      .map((p) => p.kaizen_id)
      .filter((value): value is number => isFiniteInteger(value)),
  );
}

function inferOsatsProcedureIdFromFields(
  entry: OsatsEntryLite,
  proceduresCatalog: ProcedureCatalogLite[],
): number | null {
  return inferOsatsProcedureId(
    { ...entry, kaizen_procedure_id: null },
    proceduresCatalog,
  );
}

function inferAssessorRoleIdFromFields(entry: OsatsEntryLite): number | null {
  return inferAssessorRoleId({ ...entry, assessor_role_id: null });
}

/** Prefer field-based inference; keep stored IDs only when catalog-valid and consistent. */
export function resolveOsatsStorageFields(
  entry: OsatsEntryLite,
  proceduresCatalog: ProcedureCatalogLite[],
): { kaizen_procedure_id: number | null; assessor_role_id: number | null } {
  const validIds = catalogProcedureIds(proceduresCatalog);
  const procedureFromFields = inferOsatsProcedureIdFromFields(
    entry,
    proceduresCatalog,
  );
  const storedPid = entry.kaizen_procedure_id;

  let kaizen_procedure_id = procedureFromFields;
  if (
    isFiniteInteger(storedPid) &&
    validIds.has(storedPid) &&
    (procedureFromFields === null || procedureFromFields === storedPid)
  ) {
    kaizen_procedure_id = storedPid;
  }

  const roleFromFields = inferAssessorRoleIdFromFields(entry);
  const storedRole = entry.assessor_role_id;
  const assessor_role_id =
    roleFromFields ??
    (isFiniteInteger(storedRole) ? storedRole : null);

  return { kaizen_procedure_id, assessor_role_id };
}

export type OsatsMatchedEntry = {
  id: string;
  title: string;
  kaizen_date: string;
  source_url: string | null;
  assessor_role_label: string | null;
  is_consultant_signoff: boolean;
};

function readAssessorRoleLabel(entry: OsatsEntryLite): string | null {
  const pairs = getFieldPairs(entry.extracted_fields);
  for (const pair of pairs) {
    if (
      pair.key.includes("assessor role") ||
      (pair.key.includes("role") && pair.key.includes("assessor"))
    ) {
      return pair.value || null;
    }
  }
  return null;
}

export function groupOsatsEntriesByProcedure(
  entries: Array<
    OsatsEntryLite & {
      id?: string;
      title?: string | null;
      kaizen_date?: string | null;
      source_url?: string | null;
    }
  >,
  proceduresCatalog: ProcedureCatalogLite[],
  consultantRoleId: number,
): Record<number, OsatsMatchedEntry[]> {
  const grouped: Record<number, OsatsMatchedEntry[]> = {};

  for (const entry of entries) {
    if (entry.detected_entry_type !== "osats_summative") continue;
    const resolved = resolveOsatsStorageFields(entry, proceduresCatalog);
    const pid = resolved.kaizen_procedure_id;
    if (!isFiniteInteger(pid)) continue;

    if (!grouped[pid]) grouped[pid] = [];
    grouped[pid].push({
      id: String(entry.id ?? ""),
      title: normalizeWhitespace(entry.title) || "Untitled entry",
      kaizen_date: normalizeWhitespace(entry.kaizen_date),
      source_url: entry.source_url ?? null,
      assessor_role_label: readAssessorRoleLabel(entry),
      is_consultant_signoff: resolved.assessor_role_id === consultantRoleId,
    });
  }

  for (const entriesForProcedure of Object.values(grouped)) {
    entriesForProcedure.sort((a, b) =>
      b.kaizen_date.localeCompare(a.kaizen_date),
    );
  }

  return grouped;
}

export function buildOsatsCountsByProcedure(
  entries: OsatsEntryLite[],
  proceduresCatalog: ProcedureCatalogLite[],
  consultantRoleId: number,
): Record<number, { total: number; consultant: number }> {
  const out: Record<number, { total: number; consultant: number }> = {};

  for (const entry of entries) {
    if (entry.detected_entry_type !== "osats_summative") continue;
    const resolved = resolveOsatsStorageFields(entry, proceduresCatalog);
    const pid = resolved.kaizen_procedure_id;
    if (!isFiniteInteger(pid)) continue;

    if (!out[pid]) out[pid] = { total: 0, consultant: 0 };
    out[pid].total += 1;
    if (resolved.assessor_role_id === consultantRoleId) {
      out[pid].consultant += 1;
    }
  }

  return out;
}
