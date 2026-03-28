type JsonLike = Record<string, unknown> | null | undefined;

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
      const parsed = parseNumericCode(pair.value);
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

export function buildOsatsCountsByProcedure(
  entries: OsatsEntryLite[],
  proceduresCatalog: ProcedureCatalogLite[],
  consultantRoleId: number,
): Record<number, { total: number; consultant: number }> {
  const out: Record<number, { total: number; consultant: number }> = {};

  for (const entry of entries) {
    if (entry.detected_entry_type !== "osats_summative") continue;
    const inferred = inferOsatsStorageFields(entry, proceduresCatalog);
    const pid = inferred.kaizen_procedure_id;
    if (!isFiniteInteger(pid)) continue;

    if (!out[pid]) out[pid] = { total: 0, consultant: 0 };
    out[pid].total += 1;
    if (inferred.assessor_role_id === consultantRoleId) {
      out[pid].consultant += 1;
    }
  }

  return out;
}
