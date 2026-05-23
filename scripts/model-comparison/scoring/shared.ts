import { BANNED_PHRASES } from "../config";
import type { CheckResult } from "../types";

// ── Text utilities ───────────────────────────────────────────────────────────

export function countWords(text: string): number {
  const matches = String(text ?? "").trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function countParagraphs(text: string): number {
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

export function hasEmDash(text: string): boolean {
  // U+2014 em dash, U+2013 en dash (both banned)
  return /[\u2013\u2014]/.test(text);
}

export function hasEmDashAnywhere(obj: unknown): boolean {
  if (typeof obj === "string") return hasEmDash(obj);
  if (Array.isArray(obj)) return obj.some(hasEmDashAnywhere);
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).some(hasEmDashAnywhere);
  }
  return false;
}

export function hasBannedPhrase(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

export function bannedPhrasesInObj(obj: unknown): string[] {
  const allText = extractAllStrings(obj).join(" ");
  return hasBannedPhrase(allText);
}

function extractAllStrings(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(extractAllStrings);
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap(extractAllStrings);
  }
  return [];
}

export function hasMarkdownFences(text: string): boolean {
  return /```/.test(text);
}

export function wordCountInRange(text: string, min: number, max: number): boolean {
  const wc = countWords(text);
  return wc >= min && wc <= max;
}

export function wordCountNearRange(text: string, min: number, max: number, tolerance: number): boolean {
  const wc = countWords(text);
  return wc >= min - tolerance && wc <= max + tolerance;
}

export function ratioInRange(wc: number, min: number, max: number): number {
  if (wc >= min && wc <= max) return 1.0;
  const under = Math.max(0, min - wc);
  const over = Math.max(0, wc - max);
  const miss = Math.max(under, over);
  const range = max - min;
  return Math.max(0, 1 - miss / Math.max(range, 1));
}

// ── Parse helpers ────────────────────────────────────────────────────────────

function stripThinkingTags(raw: string): string {
  // Strip reasoning blocks from Gemma 4 (<thought>, <think>) and other models
  return raw
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

/**
 * Extracts the last complete, balanced JSON object or array from text.
 * Handles models that prefix output with thinking/reasoning text.
 */
function extractLastJsonBlock(text: string): string | null {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch !== "}" && ch !== "]") continue;
    const opener = ch === "}" ? "{" : "[";
    let depth = 0;
    for (let j = i; j >= 0; j--) {
      if (text[j] === ch) depth++;
      else if (text[j] === opener) {
        depth--;
        if (depth === 0) return text.slice(j, i + 1);
      }
    }
  }
  return null;
}

export function tryParseJson(raw: string): {
  parsed: unknown;
  method: "direct" | "fence-stripped" | "prefix-extracted" | "failed";
} {
  const cleaned = stripThinkingTags(raw);

  // 1. Direct parse
  for (const candidate of [cleaned, raw]) {
    try {
      return { parsed: JSON.parse(candidate), method: "direct" };
    } catch { /* ignore */ }
  }

  // 2. Strip markdown fences
  const stripped = cleaned.replace(/```json\n?|\n?```/g, "").trim();
  try {
    return { parsed: JSON.parse(stripped), method: "fence-stripped" };
  } catch {
    // ignore
  }

  // 3. Extract first JSON object or array (fast path for minimal preamble)
  const objMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    try {
      return { parsed: JSON.parse(objMatch[1]), method: "prefix-extracted" };
    } catch { /* ignore */ }
  }
  const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try {
      return { parsed: JSON.parse(arrMatch[1]), method: "prefix-extracted" };
    } catch { /* ignore */ }
  }

  // 4. Extract last balanced JSON block — handles models that output reasoning
  //    text (Gemini 2.5 Flash, Gemma 4) before the actual JSON response.
  const lastBlock = extractLastJsonBlock(cleaned);
  if (lastBlock) {
    try {
      return { parsed: JSON.parse(lastBlock), method: "prefix-extracted" };
    } catch { /* ignore */ }
  }

  return { parsed: null, method: "failed" };
}

export function tryParseJsonArray(raw: string, prefilled: boolean): {
  parsed: unknown;
  method: "direct" | "fence-stripped" | "prefix-extracted" | "failed";
} {
  const cleaned = stripThinkingTags(raw);

  // For prefill-style calls, the model returns array content without opening [
  // The raw text from the model may or may not start with [
  const candidates = prefilled
    ? [
        cleaned.startsWith("[") ? cleaned : "[" + cleaned,
        cleaned,
        raw.startsWith("[") ? raw : "[" + raw,
      ]
    : [cleaned, raw];

  for (const candidate of candidates) {
    const result = tryParseJson(candidate);
    if (result.method !== "failed") return result;
  }
  return { parsed: null, method: "failed" };
}

// ── Check builder helpers ────────────────────────────────────────────────────

export function binaryCheck(
  name: string,
  passed: boolean,
  points: number,
  detail?: string,
): CheckResult {
  return { name, passed, points: passed ? points : 0, maxPoints: points, detail };
}

export function proportionalCheck(
  name: string,
  earned: number,
  max: number,
  detail?: string,
): CheckResult {
  const clamped = Math.min(Math.max(earned, 0), max);
  return { name, passed: clamped === max, points: clamped, maxPoints: max, detail };
}

export function sumScore(checks: CheckResult[]): number {
  return checks.reduce((acc, c) => acc + c.points, 0);
}

export function sumMax(checks: CheckResult[]): number {
  return checks.reduce((acc, c) => acc + c.maxPoints, 0);
}
