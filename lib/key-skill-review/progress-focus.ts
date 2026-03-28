import type {
  DescriptorCoverage,
  KeySkillCoverage,
  ReviewEntry,
  SkillSuggestion,
} from "../types/key-skill-review";

export type ParsedProgressFocus = {
  cip: number | null;
  skillId: string | null;
  descriptorId: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/**
 * Parse Progress hub deep-link params. Returns null if nothing meaningful is present.
 */
export function parseProgressFocusFromSearchParams(sp: URLSearchParams): ParsedProgressFocus | null {
  const cipRaw = sp.get("focus_cip");
  const skillRaw = sp.get("focus_skill")?.trim() || "";
  const descRaw = sp.get("focus_descriptor")?.trim() || "";

  let cip: number | null = null;
  if (cipRaw && /^\d+$/.test(cipRaw)) {
    const n = Number.parseInt(cipRaw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 14) cip = n;
  }

  const skillId = skillRaw && isUuidLike(skillRaw) ? skillRaw : null;
  let descriptorId: string | null = descRaw && isUuidLike(descRaw) ? descRaw : null;
  if (descriptorId && !skillId) {
    descriptorId = null;
  }

  if (cip == null && !skillId && !descriptorId) return null;
  return { cip, skillId, descriptorId };
}

export type ProgressFocusMatch = {
  entryId: string | null;
  /** matched: skill/descriptor/cip target found; partial: looser fallback; none: no row */
  matchQuality: "matched" | "partial" | "none";
};

function suggestionMatchesSkill(s: SkillSuggestion, skillId: string, cip: number | null): boolean {
  if (s.key_skill_id !== skillId) return false;
  if (cip != null && s.cip_number !== cip) return false;
  return true;
}

/**
 * Pick the best entry row for Progress focus. Uses loaded queue data only.
 */
export function findEntryForProgressFocus(
  entries: ReviewEntry[],
  f: ParsedProgressFocus,
): ProgressFocusMatch {
  if (f.descriptorId && f.skillId) {
    for (const e of entries) {
      const ks = e.descriptor_coverage?.find((k: KeySkillCoverage) => k.key_skill_id === f.skillId);
      if (ks?.descriptors.some((d: DescriptorCoverage) => d.descriptor_id === f.descriptorId)) {
        return { entryId: e.id, matchQuality: "matched" };
      }
    }
  }

  if (f.skillId) {
    for (const e of entries) {
      const linked = e.linked_cip_suggestions.some((s: SkillSuggestion) =>
        suggestionMatchesSkill(s, f.skillId!, f.cip),
      );
      const cross = e.cross_cip_suggestions.some((s: SkillSuggestion) =>
        suggestionMatchesSkill(s, f.skillId!, f.cip),
      );
      if (linked || cross) {
        return {
          entryId: e.id,
          matchQuality: f.descriptorId ? "partial" : "matched",
        };
      }
    }
  }

  if (f.cip != null) {
    const e = entries.find((x) => x.linked_cip_number === f.cip);
    if (e) {
      return {
        entryId: e.id,
        matchQuality: f.skillId || f.descriptorId ? "partial" : "matched",
      };
    }
  }

  return { entryId: null, matchQuality: "none" };
}
