import { callGemini, stripFences } from "@/lib/ai/gemini-client";

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

const SYSTEM_PROMPT =
  "You are an RCOG curriculum expert. Analyse whether portfolio entries provide evidence for specific descriptors. Output ONLY valid JSON — no prose, no markdown fences.";

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
    "Output ONLY a valid JSON array — starting with [ and ending with ]. One object per descriptor:",
    '  { "descriptor_id": "<id>", "covered": true, "confidence": 0.0 }',
    "",
    "Rules:",
    "- covered: true only if the entry text explicitly demonstrates that descriptor",
    "- confidence: number between 0.0 and 1.0",
    "- Output ONLY the JSON array. No prose. No code fences. No extra fields.",
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

async function callDescriptorModel(prompt: string): Promise<{ data: unknown }> {
  const raw = await callGemini({
    system: SYSTEM_PROMPT,
    user: prompt,
    maxTokens: 8192,
    temperature: 0,
  });

  const jsonText = stripFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const preview = jsonText.slice(0, 400).replace(/\n/g, " ");
    throw new Error(`Failed to parse descriptor response as JSON. Preview: ${preview}`);
  }

  return { data: parsed };
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

  for (const chunk of chunks) {
    const prompt = buildPrompt(entry, chunk);
    const { data: raw } = await callDescriptorModel(prompt);

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

  return results;
}
