/**
 * Parses the raw "linked key skills" string scraped by the Kaizen extension
 * and resolves each entry to a DB key_skill via explicit kaizen_id mapping.
 *
 * Raw format (pipe-separated, one entry per linked skill):
 *   "CiP 10: Emergency obstetrics - Manages maternal collapse (948854)"
 *   "CiP 5: Human factors - Maintains situational awareness (948895) | CiP 12: ..."
 *
 * Resolution strategy (deterministic only — no fuzzy fallback):
 *   1. Extract the numeric Kaizen ID from the trailing "(948xxx)" in each segment.
 *   2. Look it up in key_skills.kaizen_ids[]. All 68 IDs are explicitly mapped in
 *      the DB (migrations 0010/0011/0012), so any unmatched ID is a data gap to
 *      fix in a new migration — not a case for fuzzy approximation.
 *   3. Return null for segments with no ID or no matching DB row.
 */

export type ParsedKaizenKeySkill = {
  cip_number: number;
  key_skill_title: string;
  kaizen_id: string;
};

export type KaizenKeySkillCandidate = {
  key_skill_id: string;
  cip_number: number;
  title: string;
  /** All Kaizen numeric IDs that map to this DB skill (array because Kaizen
   *  sometimes splits one RCOG composite skill into multiple named skills). */
  kaizen_ids?: string[] | null;
};

export type KaizenDirectMatch = {
  key_skill_id: string;
  cip_number: number;
  confidence: number;
  rationale: string;
};

// --- Parsing ---

/**
 * Parses a raw pipe-separated string from extracted_fields["linked key skills"].
 * Returns an array of parsed entries; silently skips malformed segments.
 *
 * Each segment is expected to be:
 *   "CiP {n}: {CiP name} - {key skill title} ({kaizen_id})"
 *
 * We extract the CiP number and key skill title. The CiP name (before the
 * last " - ") is discarded because it's not stable for matching.
 */
export function parseLinkedKeySkillsRaw(
  raw: string | null | undefined,
): ParsedKaizenKeySkill[] {
  if (!raw || typeof raw !== "string") return [];

  return raw
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment): ParsedKaizenKeySkill[] => {
      // Kaizen wraps entries whose title contains a comma in double-quotes within
      // the pipe-separated string, e.g.:
      //   "CiP 1: ... - History taking, clinical examination and diagnosis (948842)"
      // Strip those surrounding quotes before parsing so the regex can match.
      const cleanSeg =
        segment.startsWith('"') && segment.endsWith('"')
          ? segment.slice(1, -1).trim()
          : segment;

      // Extract CiP number: "CiP 10: ..."
      const cipMatch = cleanSeg.match(/^CiP\s*(\d{1,2})\s*:/i);
      if (!cipMatch) return [];
      const cipNumber = Number(cipMatch[1]);
      if (!Number.isFinite(cipNumber) || cipNumber < 1 || cipNumber > 14) return [];

      // Extract kaizen_id from trailing "(948854)"
      const kaizenIdMatch = cleanSeg.match(/\((\d+)\)\s*$/);
      const kaizenId = kaizenIdMatch ? kaizenIdMatch[1] : "";

      // Everything between " - " and the trailing " ({kaizen_id})" is the key skill title.
      // We use lastIndexOf(" - ") so CiP names containing " - " don't confuse the split.
      const afterCip = cleanSeg.slice(cipMatch[0].length).trim();
      const dashIdx = afterCip.lastIndexOf(" - ");
      if (dashIdx === -1) return [];

      const rawTitle = kaizenId
        ? afterCip.slice(dashIdx + 3).replace(/\s*\(\d+\)\s*$/, "").trim()
        : afterCip.slice(dashIdx + 3).trim();

      if (!rawTitle) return [];

      return [{ cip_number: cipNumber, key_skill_title: rawTitle, kaizen_id: kaizenId }];
    });
}

// --- ID-based matching ---

/**
 * Resolves a single parsed Kaizen key skill to a DB row via kaizen_ids lookup.
 *
 * Only deterministic ID matching is performed. All 68 Kaizen IDs are explicitly
 * mapped in migrations 0010/0011/0012 — if a segment has no kaizen_id or the ID
 * is absent from the DB catalogue, null is returned. Do NOT add fuzzy fallback
 * here; any gap should be fixed by adding the missing ID to a new migration.
 */
export function matchSingleKaizenKeySkill(
  parsed: ParsedKaizenKeySkill,
  candidates: KaizenKeySkillCandidate[],
): KaizenDirectMatch | null {
  if (!parsed.kaizen_id) return null;

  const idMatch = candidates.find(
    (c) => Array.isArray(c.kaizen_ids) && c.kaizen_ids.includes(parsed.kaizen_id),
  );

  if (!idMatch) return null;

  return {
    key_skill_id: idMatch.key_skill_id,
    cip_number: idMatch.cip_number,
    confidence: 0.99,
    rationale: `kaizen_direct: ID match (${parsed.kaizen_id})`,
  };
}

/**
 * Converts the full raw string into a list of KaizenDirectMatch objects,
 * deduplicating by key_skill_id (highest confidence wins).
 */
export function resolveKaizenDirectMatches(
  raw: string | null | undefined,
  candidates: KaizenKeySkillCandidate[],
): KaizenDirectMatch[] {
  const parsed = parseLinkedKeySkillsRaw(raw);
  if (parsed.length === 0) return [];

  const byId = new Map<string, KaizenDirectMatch>();
  for (const p of parsed) {
    const match = matchSingleKaizenKeySkill(p, candidates);
    if (!match) continue;
    const existing = byId.get(match.key_skill_id);
    if (!existing || match.confidence > existing.confidence) {
      byId.set(match.key_skill_id, match);
    }
  }
  return Array.from(byId.values());
}
