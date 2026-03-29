import Anthropic from "@anthropic-ai/sdk";

type LengthMode = "short" | "standard" | "detailed";

type WordRange = { min: number; max: number };

const CIP_WORD_RANGES: Record<LengthMode, WordRange> = {
  short: { min: 220, max: 300 },
  standard: { min: 320, max: 420 },
  detailed: { min: 500, max: 650 },
};

function countWords(text: string): number {
  const matches = String(text ?? "").trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function countParagraphs(text: string): number {
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

function inRange(words: number, range: WordRange): boolean {
  return words >= range.min && words <= range.max;
}

function splitParagraphs(text: string): string[] {
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.map((p) => p.trim()).join("\n\n").trim();
}

function countWordsInText(text: string): number {
  return countWords(text);
}

function trimToMaxWordsPreservingParagraphs(text: string, maxWords: number): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return String(text ?? "").trim();

  let guard = 0;
  while (countWordsInText(joinParagraphs(paragraphs)) > maxWords && guard < 300) {
    guard += 1;

    let longestIndex = 0;
    let longestCount = 0;
    for (let i = 0; i < paragraphs.length; i += 1) {
      const wc = countWordsInText(paragraphs[i]);
      if (wc > longestCount) {
        longestCount = wc;
        longestIndex = i;
      }
    }

    const candidate = paragraphs[longestIndex];
    const sentences = candidate
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length > 1) {
      sentences.pop();
      paragraphs[longestIndex] = sentences.join(" ").trim();
      continue;
    }

    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length <= 12) break;
    paragraphs[longestIndex] = words.slice(0, Math.max(12, words.length - 8)).join(" ").trim();
  }

  return joinParagraphs(paragraphs);
}

function padToMinWordsPreservingParagraphs(text: string, minWords: number): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return String(text ?? "").trim();

  const fillerSentences = [
    "I am still learning from this and I know I need to keep improving.",
    "I now pause more and check my reasoning before committing to a plan.",
    "I also ask for feedback sooner when I am unsure.",
  ];

  let idx = 0;
  while (countWordsInText(joinParagraphs(paragraphs)) < minWords && idx < 20) {
    const target = Math.max(paragraphs.length - 1, 0);
    paragraphs[target] = `${paragraphs[target]} ${fillerSentences[idx % fillerSentences.length]}`.trim();
    idx += 1;
  }

  return joinParagraphs(paragraphs);
}

type NormalizerResult = {
  trainee_comments: string;
  word_count: number;
  paragraph_count: number;
  compliant: boolean;
  adjusted: boolean;
  attempts: number;
};

const NORMALIZER_SYSTEM_PROMPT = `You are editing a CiP trainee reflection to satisfy strict format constraints while preserving meaning.

Return JSON only:
{ "trainee_comments": "<rewritten text>" }

Rules:
- Keep the same core meaning, clinical facts, and learning points. Do not invent new facts.
- Make the minimum edits needed to meet constraints. Preserve original voice and wording where possible.
- Keep exactly 5 paragraphs.
- Keep paragraph roles:
  1) opening reflection arc only (no case narrative),
  2) case 1 with insight and concrete change,
  3) case 2 with insight and concrete change,
  4) honest current gaps,
  5) specific next steps.
- Use plain, direct wording and shorter sentences.
- Include at least one candid uncertainty line in simple language (for example: "I wasn't sure...", "I hesitated...", "I realised I had missed...").
- Keep first-person reflective voice.
- Avoid introducing stock template phrases (for example: "Over this period", "This taught me", "I recognise", "My next steps are") unless they are already in the source text.
- Meet the required word range exactly (inclusive).`;

export async function normalizeCipTraineeComments(params: {
  trainee_comments: string;
  length?: LengthMode;
}): Promise<NormalizerResult> {
  const lengthMode: LengthMode = params.length ?? "standard";
  const range = CIP_WORD_RANGES[lengthMode];

  let current = String(params.trainee_comments ?? "").trim();
  let words = countWords(current);
  if (inRange(words, range) && countParagraphs(current) === 5) {
    return {
      trainee_comments: current,
      word_count: words,
      paragraph_count: 5,
      compliant: true,
      adjusted: false,
      attempts: 0,
    };
  }

  // Prefer deterministic trimming/padding first so we preserve original voice.
  if (countParagraphs(current) === 5) {
    if (words > range.max) {
      current = trimToMaxWordsPreservingParagraphs(current, range.max);
      words = countWords(current);
    } else if (words < range.min) {
      current = padToMinWordsPreservingParagraphs(current, range.min);
      words = countWords(current);
    }

    const deterministicParagraphs = countParagraphs(current);
    if (inRange(words, range) && deterministicParagraphs === 5) {
      return {
        trainee_comments: current,
        word_count: words,
        paragraph_count: deterministicParagraphs,
        compliant: true,
        adjusted: true,
        attempts: 0,
      };
    }
  }

  const client = new Anthropic();
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1600,
      temperature: 0.2,
      system: NORMALIZER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              target_length: lengthMode,
              target_word_range: range,
              current_word_count: words,
              current_paragraph_count: countParagraphs(current),
              current_text: current,
            },
            null,
            2
          ),
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const stripped = raw.replace(/```json\n?|\n?```/g, "").trim();
      try {
        parsed = JSON.parse(stripped);
      } catch {
        continue;
      }
    }

    if (!parsed || typeof parsed !== "object") continue;
    const rewritten = String((parsed as Record<string, unknown>).trainee_comments ?? "").trim();
    if (!rewritten) continue;

    current = rewritten;
    words = countWords(current);
    const paragraphs = countParagraphs(current);
    if (inRange(words, range) && paragraphs === 5) {
      return {
        trainee_comments: current,
        word_count: words,
        paragraph_count: paragraphs,
        compliant: true,
        adjusted: true,
        attempts: attempt,
      };
    }
  }

  if (countParagraphs(current) === 5) {
    if (words > range.max) {
      current = trimToMaxWordsPreservingParagraphs(current, range.max);
      words = countWords(current);
    } else if (words < range.min) {
      current = padToMinWordsPreservingParagraphs(current, range.min);
      words = countWords(current);
    }
  }

  const finalParagraphs = countParagraphs(current);
  return {
    trainee_comments: current,
    word_count: words,
    paragraph_count: finalParagraphs,
    compliant: inRange(words, range) && finalParagraphs === 5,
    adjusted: true,
    attempts: maxAttempts,
  };
}
