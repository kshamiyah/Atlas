export const MIN_SKILLS_PER_ENTRY_TARGET = 3;
export const RECOMMENDED_SKILLS_PER_ENTRY_TARGET = 4;
export const MAX_SKILLS_PER_ENTRY_TARGET = 6;

export function sanitizeSkillsPerEntryTarget(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(n)) return RECOMMENDED_SKILLS_PER_ENTRY_TARGET;
  const rounded = Math.round(n);
  if (rounded < MIN_SKILLS_PER_ENTRY_TARGET) return MIN_SKILLS_PER_ENTRY_TARGET;
  if (rounded > MAX_SKILLS_PER_ENTRY_TARGET) return MAX_SKILLS_PER_ENTRY_TARGET;
  return rounded;
}

export function parseSkillsPerEntryTargetOverride(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < MIN_SKILLS_PER_ENTRY_TARGET || value > MAX_SKILLS_PER_ENTRY_TARGET) {
    return null;
  }
  return value;
}

export function resolveEffectiveSkillsPerEntryTarget(
  override: unknown,
  profileDefault: unknown,
): number {
  const parsedOverride = parseSkillsPerEntryTargetOverride(override);
  if (parsedOverride != null) return parsedOverride;
  return sanitizeSkillsPerEntryTarget(profileDefault);
}
