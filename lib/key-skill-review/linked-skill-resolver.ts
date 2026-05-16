export function normalizeSkillTitle(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractKaizenIdFromLinkedSkillRaw(raw: string): string | null {
  const match = String(raw || "").trim().match(/\((\d+)\)\s*$/);
  return match ? match[1] : null;
}

export function stripCipPrefixAndId(raw: string): string {
  return String(raw || "")
    .replace(/^"?\s*cip\s*\d{1,2}\s*:\s*/i, "")
    .replace(/\s*\(\d+\)\s*"?\s*$/, "")
    .trim();
}
