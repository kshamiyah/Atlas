import Anthropic from "@anthropic-ai/sdk";

export type AnalyzerKeySkill = {
  key_skill_id: string;
  cip_number: number;
  title: string;
  is_confirmed: boolean;
  descriptors: { descriptor_id: string; text: string; sort_order: number }[];
};

export type AnalyzerEntry = {
  entry_text: string;
  entry_type: string | null;
};

export type DescriptorResult = {
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  confidence: number;
  evidence_quote: string | null;
};

type PromptDescriptor = {
  descriptor_id: string;
  key_skill_id: string;
  key_skill_title: string;
  descriptor_text: string;
};

const MAX_DESCRIPTORS_PER_CALL = 30;
const MODEL_NAME = "claude-haiku-4-5-20251001";

// Haiku 4.5 pricing (per million tokens) — https://www.anthropic.com/pricing
const PRICE_INPUT_PER_MTOK = 1.00;
const PRICE_OUTPUT_PER_MTOK = 5.00;

type CallUsage = { input_tokens: number; output_tokens: number };

function logUsage(callIndex: number, usage: CallUsage, runningTotal: CallUsage) {
  const inputCost = (usage.input_tokens / 1_000_000) * PRICE_INPUT_PER_MTOK;
  const outputCost = (usage.output_tokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;
  console.log(
    `[descriptor-analyzer] call #${callIndex} — ` +
    `in: ${usage.input_tokens} tok ($${inputCost.toFixed(5)}), ` +
    `out: ${usage.output_tokens} tok ($${outputCost.toFixed(5)}) | ` +
    `running total: ${runningTotal.input_tokens} in / ${runningTotal.output_tokens} out`,
  );
}

function logSummary(totalCalls: number, total: CallUsage) {
  const inputCost = (total.input_tokens / 1_000_000) * PRICE_INPUT_PER_MTOK;
  const outputCost = (total.output_tokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;
  const totalCost = inputCost + outputCost;
  console.log(
    `[descriptor-analyzer] ✅ DONE — ${totalCalls} call(s) | ` +
    `total tokens: ${total.input_tokens} in / ${total.output_tokens} out | ` +
    `estimated cost: $${inputCost.toFixed(5)} in + $${outputCost.toFixed(5)} out = $${totalCost.toFixed(5)}`,
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildPrompt(
  entry: AnalyzerEntry,
  descriptors: PromptDescriptor[],
): string {
  const entryType = entry.entry_type ?? "unspecified";

  return [
    "You are an RCOG curriculum expert. Analyse whether a portfolio entry provides evidence for specific descriptors.",
    "",
    `Entry type: ${entryType}`,
    "Entry text:",
    '"""',
    entry.entry_text,
    '"""',
    "",
    "For each descriptor below, determine if the entry provides direct evidence.",
    "Only mark covered=true if the entry text explicitly demonstrates that descriptor.",
    "",
    "Continue the JSON array that has already been started. Output one object per descriptor:",
    '  { "descriptor_id": "<id>", "covered": true, "confidence": 0.0 },',
    "",
    "Rules:",
    "- covered: true only if the entry text explicitly demonstrates that descriptor",
    "- confidence: number between 0.0 and 1.0",
    "- Output ONLY the array items and the closing ]. No prose. No code fences. No extra fields.",
    "",
    "Descriptors to analyse:",
    JSON.stringify(
      descriptors.map((d) => ({
        descriptor_id: d.descriptor_id,
        key_skill_id: d.key_skill_id,
        key_skill_title: d.key_skill_title,
        descriptor_text: d.descriptor_text,
      })),
      null,
      2,
    ),
  ].join("\n");
}

async function callAnthropic(prompt: string): Promise<{ data: unknown; usage: CallUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  // Prefill the assistant turn with "[" so the model is forced to continue
  // a JSON array directly — no prose, no code fences possible.
  const message = await anthropic.messages.create({
    model: MODEL_NAME,
    max_tokens: 8192,
    temperature: 0,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "[" },
    ],
  });

  const usage: CallUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };

  const textPart = message.content.find(
    (c) => c.type === "text",
  ) as { type: "text"; text: string } | undefined;

  if (!textPart?.text) {
    throw new Error("Anthropic response missing text content");
  }

  // The model continues from "[", so prepend it to get the full array
  const jsonText = "[" + textPart.text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const preview = jsonText.slice(0, 400).replace(/\n/g, " ");
    throw new Error(`Failed to parse Anthropic response as JSON. Preview: ${preview}`);
  }

  return { data: parsed, usage };
}

export async function analyzeDescriptors(
  entry: AnalyzerEntry,
  keySkills: AnalyzerKeySkill[],
): Promise<DescriptorResult[]> {
  const promptDescriptors: PromptDescriptor[] = [];

  for (const ks of keySkills) {
    for (const d of ks.descriptors) {
      promptDescriptors.push({
        descriptor_id: d.descriptor_id,
        key_skill_id: ks.key_skill_id,
        key_skill_title: ks.title,
        descriptor_text: d.text,
      });
    }
  }

  if (promptDescriptors.length === 0) {
    return [];
  }

  const chunks: PromptDescriptor[][] = [];
  for (let i = 0; i < promptDescriptors.length; i += MAX_DESCRIPTORS_PER_CALL) {
    chunks.push(promptDescriptors.slice(i, i + MAX_DESCRIPTORS_PER_CALL));
  }

  const results: DescriptorResult[] = [];
  const totalUsage: CallUsage = { input_tokens: 0, output_tokens: 0 };
  let callIndex = 0;

  for (const chunk of chunks) {
    callIndex++;
    const prompt = buildPrompt(entry, chunk);
    const { data: raw, usage } = await callAnthropic(prompt);

    totalUsage.input_tokens += usage.input_tokens;
    totalUsage.output_tokens += usage.output_tokens;
    logUsage(callIndex, usage, totalUsage);

    if (!Array.isArray(raw)) {
      continue;
    }

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const parsedItem = item as Record<string, unknown>;

      const descriptor_id = String(parsedItem.descriptor_id ?? "");
      if (!descriptor_id) continue;

      const meta = chunk.find((d) => d.descriptor_id === descriptor_id);
      if (!meta) continue;

      const covered = Boolean(parsedItem.covered);
      const confidenceRaw = Number(parsedItem.confidence ?? 0);
      const confidence =
        Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1
          ? confidenceRaw
          : 0;

      results.push({
        key_skill_id: meta.key_skill_id,
        descriptor_id,
        covered,
        confidence,
        evidence_quote: null, // not requested from LLM to avoid JSON escaping issues
      });
    }
  }

  logSummary(callIndex, totalUsage);
  return results;
}
