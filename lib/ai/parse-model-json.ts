import { stripFences } from "./gemini-client";

function stripThinkingTags(raw: string): string {
  return raw
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

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

/** Best-effort repair when Gemini truncates mid-string (common with low max_tokens). */
function repairTruncatedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let slice = text.slice(start).trimEnd();
  if (slice.endsWith("}")) return slice;

  // Close an open string literal, then close any open brackets.
  if ((slice.match(/"/g)?.length ?? 0) % 2 === 1) {
    slice += '"';
  }
  slice = slice.replace(/,\s*$/, "");

  const stack: ("{" | "[")[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of slice) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" && stack.at(-1) === "{") stack.pop();
    else if (ch === "]" && stack.at(-1) === "[") stack.pop();
  }

  while (stack.length > 0) {
    const open = stack.pop();
    slice += open === "[" ? "]" : "}";
  }

  return slice;
}

export type ParseModelJsonResult =
  | { ok: true; value: unknown; method: string }
  | { ok: false; method: "failed" };

export function parseModelJson(raw: string): ParseModelJsonResult {
  const cleaned = stripThinkingTags(raw);

  const candidates: { text: string; method: string }[] = [
    { text: cleaned, method: "direct" },
    { text: raw, method: "direct-raw" },
    { text: stripFences(cleaned), method: "fence-stripped" },
  ];

  const objMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (objMatch) candidates.push({ text: objMatch[1], method: "regex-object" });

  const lastBlock = extractLastJsonBlock(cleaned);
  if (lastBlock) candidates.push({ text: lastBlock, method: "balanced-block" });

  const repaired = repairTruncatedJsonObject(cleaned);
  if (repaired) candidates.push({ text: repaired, method: "truncation-repair" });

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate.text), method: candidate.method };
    } catch {
      // try next strategy
    }
  }

  return { ok: false, method: "failed" };
}

export function maxTokensForEntryLength(
  length?: "short" | "standard" | "detailed",
): number {
  switch (length) {
    case "short":
      return 4096;
    case "detailed":
      return 12000;
    default:
      return 8192;
  }
}
