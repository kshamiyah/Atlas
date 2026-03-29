import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseClientWithToken } from "@/lib/supabase/api-client";
import { generatePortfolioEntry } from "@/lib/ai/generate";
import { matchKeySkills } from "@/lib/ai/match-key-skills";
import { selectCipEvidence } from "@/lib/ai/cip-evidence-selector";
import { normalizeCipTraineeComments } from "@/lib/ai/cip-comment-normalizer";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { KeySkillCandidate } from "@/lib/ai/match-key-skills";

const VALID_ENTRY_TYPES: GeneratedEntryType[] = [
  "reflection",
  "procedure",
  "cip_assessment",
  "cbd",
  "minicex",
  "notss",
  "osats_formative",
  "osats_summative",
  "other_evidence",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type AuthUser = { id: string };
type CoverageRow = {
  key_skill_name: string | null;
  evidence_count: number | null;
  covered: boolean | null;
};
type KeySkillRow = {
  legacy_id: string | null;
  title: string | null;
  cips:
    | {
        number: number | null;
        title: string | null;
      }
    | Array<{
        number: number | null;
        title: string | null;
      }>
    | null;
  descriptors:
    | Array<{
        text: string | null;
        sort_order: number | null;
      }>
  | null;
};

type CipLinkedEntryRow = {
  linked_cip_number?: number | null;
  source_entry_id: string | null;
  source_url: string | null;
  title: string | null;
  assessment_type: string | null;
  detected_entry_type: string | null;
  kaizen_date: string | null;
  status: string | null;
  entry_text: string | null;
  extracted_fields?: Record<string, unknown> | null;
};

const MAX_CIP_LINKED_ENTRIES_IN_CONTEXT = 25;
const MAX_CIP_SHORTLISTED_ENTRIES_IN_PROMPT = 2;
const MAX_CIP_CONTEXT_CHARS = 180_000;

function extractCipNumberFromText(text: string): number | null {
  const match = text.match(/\bcip\s*(\d{1,2})\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 14) return null;
  return parsed;
}

function compactText(value: string | null | undefined, max = 140): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function normalizeEntryText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function entryLooksLinkedToCip(entry: CipLinkedEntryRow, cipNumber: number): boolean {
  const cipToken = `cip ${cipNumber}`;
  const linkedByColumn = entry.linked_cip_number === cipNumber;

  const title = String(entry.title ?? "").toLowerCase();
  const assessmentType = String(entry.assessment_type ?? "").toLowerCase();
  const detectedType = String(entry.detected_entry_type ?? "").toLowerCase();
  const text = String(entry.entry_text ?? "").toLowerCase();
  const extractedBlob = JSON.stringify(entry.extracted_fields ?? {}).toLowerCase();

  if (linkedByColumn) return true;
  if (title.includes(cipToken)) return true;
  if (assessmentType.includes(cipToken)) return true;
  if (detectedType.includes(cipToken)) return true;
  if (extractedBlob.includes(cipToken)) return true;

  // Fallback: some forms store linked cip as plain number list ("1, 3, 7")
  const numericListRegex = new RegExp(`\\b${cipNumber}\\b`);
  if (extractedBlob.includes("linked cip") && numericListRegex.test(extractedBlob)) return true;
  if (text.includes("linked cip") && numericListRegex.test(text)) return true;

  return false;
}

function getCipEntryKey(entry: Pick<CipLinkedEntryRow, "source_entry_id" | "source_url" | "kaizen_date" | "title" | "assessment_type">): string {
  return (
    (entry.source_entry_id && `id:${entry.source_entry_id}`) ||
    (entry.source_url && `url:${entry.source_url}`) ||
    `fallback:${entry.kaizen_date ?? ""}:${entry.title ?? ""}:${entry.assessment_type ?? ""}`
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  // Default to cookie-based client (web). Will be replaced by token client for extension requests.
  let supabase = await getServerSupabaseClient();
  let user: AuthUser | null = null;
  const authHeader = request.headers.get("Authorization");

  // Prefer explicit Bearer auth from the extension.
  // Must use a token-authenticated client so RLS (auth.uid() = user_id) resolves correctly —
  // the cookie client has no session for extension requests and silently returns 0 rows.
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const tokenClient = createSupabaseClientWithToken(token);
      const { data } = await tokenClient.auth.getUser();
      if (data.user) {
        supabase = tokenClient;
        user = data.user;
      }
    } catch {
      // fall through to cookie auth
    }
  }

  // Fall back to cookie auth for web requests.
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }
  const userId = user.id;

  let body: {
    entry_type?: GeneratedEntryType;
    free_text: string;
    date?: string;
    length?: "short" | "standard" | "detailed";
    target_key_skill_ids?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (body.entry_type && !VALID_ENTRY_TYPES.includes(body.entry_type)) {
    return NextResponse.json(
      { error: "Invalid entry_type" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (
    !body.free_text ||
    typeof body.free_text !== "string" ||
    !body.free_text.trim()
  ) {
    return NextResponse.json(
      { error: "free_text is required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let stageId = "ST1";
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_stage_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.current_stage_id) {
    const { data: stage } = await supabase
      .from("stages")
      .select("name")
      .eq("id", profile.current_stage_id)
      .maybeSingle();
    if (stage?.name) stageId = stage.name;
  }

  // ── Fetch enriched key skills + user coverage (for Pass 2) ──
  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number, title ), descriptors ( text, sort_order )")
    .not("legacy_id", "is", null);

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered")
    .eq("user_id", userId);

  const typedCoverageRows = (coverageRows ?? []) as CoverageRow[];
  const typedKeySkillRows = (keySkillRows ?? []) as KeySkillRow[];

  const coverageByName = new Map(
    typedCoverageRows.map((c) => [
      String(c.key_skill_name ?? "")
        .toLowerCase()
        .trim(),
      c,
    ])
  );

  const enrichedKeySkills: KeySkillCandidate[] = typedKeySkillRows
    .filter(
      (ks): ks is KeySkillRow & { legacy_id: string; title: string } =>
        Boolean(ks.legacy_id && ks.title)
    )
    .map((ks) => {
      const coverage = coverageByName.get(
        String(ks.title ?? "").toLowerCase().trim()
      );
      const descriptorRows = Array.isArray(ks.descriptors) ? ks.descriptors : [];
      const descriptorTexts = descriptorRows
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((d) => String(d.text ?? "").trim())
        .filter((text) => text.length > 0);

      const cip = Array.isArray(ks.cips) ? (ks.cips[0] ?? null) : ks.cips;

      return {
        key_skill_id: ks.legacy_id,
        title: ks.title,
        cip_number: cip?.number ?? null,
        cip_title: cip?.title ?? null,
        descriptors: descriptorTexts,
        covered: coverage?.covered ?? null,
        evidence_count: coverage?.evidence_count ?? null,
      };
    });

  const targetedSkillRows = (body.target_key_skill_ids ?? [])
    .map((id) =>
      enrichedKeySkills.find((s) => s.key_skill_id === id)
    )
    .filter((s): s is KeySkillCandidate => s != null);

  const targetedSkills = targetedSkillRows
    .map((s) => ({
      id: s.key_skill_id,
      title: s.title,
      descriptors: s.descriptors,
    }));

  let result;
  let cipDebugNote: string | null = null;
  try {
    let generationFreeText = body.free_text.trim();
    let generationTargetedSkills = targetedSkills;

    // For CiP assessment requests, enrich the prompt with linked entries already
    // synced for this CiP so the generated trainee comments reference concrete evidence.
    // Prefer explicit cip_number from the request body (sent by extension from the form field),
    // falling back to text extraction for backwards compatibility.
    if (body.entry_type === "cip_assessment") {
      const cipNumber =
        typeof (body as Record<string, unknown>).cip_number === "number"
          ? ((body as Record<string, unknown>).cip_number as number)
          : extractCipNumberFromText(generationFreeText);
      if (cipNumber !== null) {
        const { data: cipLinkedEntries } = await supabase
          .from("kaizen_entries")
          .select(
            "source_entry_id, source_url, linked_cip_number, title, assessment_type, detected_entry_type, kaizen_date, status, entry_text, extracted_fields"
          )
          .eq("user_id", userId)
          .eq("linked_cip_number", cipNumber)
          .order("synced_at", { ascending: false })
          .limit(60);

        const strictLinkedRows = (cipLinkedEntries ?? []) as (CipLinkedEntryRow & {
          linked_cip_number?: number | null;
        })[];
        let linkedRows = [...strictLinkedRows];

        // Fallback: if strict linked_cip_number data is sparse, recover likely CiP-linked
        // entries from title/text/extracted_fields so generation can still cite concrete evidence.
        if (linkedRows.length < 3) {
          const { data: candidateEntries } = await supabase
            .from("kaizen_entries")
            .select(
              "source_entry_id, source_url, linked_cip_number, title, assessment_type, detected_entry_type, kaizen_date, status, entry_text, extracted_fields"
            )
            .eq("user_id", userId)
            .order("synced_at", { ascending: false })
            .limit(400);

          const candidates = (candidateEntries ?? []) as (CipLinkedEntryRow & {
            linked_cip_number?: number | null;
          })[];

          const recovered = candidates.filter((entry) =>
            entryLooksLinkedToCip(entry, cipNumber)
          );

          const deduped = new Map<string, CipLinkedEntryRow & { linked_cip_number?: number | null }>();
          [...linkedRows, ...recovered].forEach((entry) => {
            const key = getCipEntryKey(entry);
            if (!deduped.has(key)) deduped.set(key, entry);
          });
          linkedRows = Array.from(deduped.values());
        }

        // Build CiP key skills + descriptors block from already-fetched enrichedKeySkills
        const cipKeySkills = enrichedKeySkills.filter(
          (ks) => ks.cip_number === cipNumber && ks.descriptors.length > 0
        );

        if (linkedRows.length > 0) {
          const selectionCandidates = linkedRows.slice(0, MAX_CIP_LINKED_ENTRIES_IN_CONTEXT);
          const defaultSkillRows = [...cipKeySkills]
            .sort((a, b) => {
              const aGap = a.covered === false ? 0 : 1;
              const bGap = b.covered === false ? 0 : 1;
              if (aGap !== bGap) return aGap - bGap;
              return (a.evidence_count ?? 999) - (b.evidence_count ?? 999);
            })
            .slice(0, 3);

          let shortlistedRows = [...selectionCandidates];
          let shortlistedSkillRows = defaultSkillRows;
          let shortlistedSkillReasons = new Map<string, string>();
          let descriptorThemesCovered: string[] = [];
          let descriptorThemesGaps: string[] = [];
          let reflectiveFocus = "";
          let selectedByModelCount = 0;
          let selectedSkillsByModelCount = 0;
          let selectionPassUsed = false;

          if (cipKeySkills.length > 0) {
            try {
              const selection = await selectCipEvidence({
                cip_number: cipNumber,
                user_request: generationFreeText,
                key_skills: cipKeySkills.map((ks) => ({
                  key_skill_id: ks.key_skill_id,
                  title: ks.title,
                  covered: ks.covered,
                  evidence_count: ks.evidence_count,
                  descriptors: ks.descriptors.slice(0, 8),
                })),
                entries: selectionCandidates.map((row) => ({
                  entry_id: getCipEntryKey(row),
                  title: compactText(row.title, 160) || "Untitled entry",
                  assessment_type:
                    compactText(row.assessment_type ?? row.detected_entry_type, 60) || "assessment",
                  date: compactText(row.kaizen_date, 24) || "date unknown",
                  status: compactText(row.status, 24) || "unknown",
                  text_excerpt:
                    compactText(normalizeEntryText(row.entry_text).replace(/\n+/g, " "), 1400) ||
                    "(No entry text captured)",
                })),
              });

              selectionPassUsed = true;
              descriptorThemesCovered = selection.descriptors_well_evidenced;
              descriptorThemesGaps = selection.descriptors_with_gaps;
              reflectiveFocus = selection.reflective_focus;

              if (selection.top_key_skills.length > 0) {
                selectedSkillsByModelCount = selection.top_key_skills.length;
                const selectedSkillIds = new Set(
                  selection.top_key_skills.map((item) => item.key_skill_id)
                );
                const selectedSkillRows = cipKeySkills.filter((ks) =>
                  selectedSkillIds.has(ks.key_skill_id)
                );
                if (selectedSkillRows.length > 0) {
                  shortlistedSkillRows = selectedSkillRows.slice(0, 3);
                }
                shortlistedSkillReasons = new Map(
                  selection.top_key_skills.map((item) => [item.key_skill_id, item.reason])
                );
              }

              if (selection.selected_entry_ids.length > 0) {
                const selectedIds = new Set(selection.selected_entry_ids);
                const selectedRows = selectionCandidates.filter((row) =>
                  selectedIds.has(getCipEntryKey(row))
                );
                selectedByModelCount = selectedRows.length;
                if (selectedRows.length > 0) {
                  shortlistedRows = selectedRows;
                }
              }
            } catch (selectionErr) {
              console.warn(
                "[PortfolioIQ] CiP evidence selection failed, falling back to recency:",
                selectionErr
              );
            }
          }

          shortlistedRows = shortlistedRows.slice(0, MAX_CIP_SHORTLISTED_ENTRIES_IN_PROMPT);

          if (shortlistedSkillRows.length > 0) {
            const mergedTargets = [...targetedSkills];
            for (const skill of shortlistedSkillRows) {
              if (!mergedTargets.some((existing) => existing.id === skill.key_skill_id)) {
                mergedTargets.push({
                  id: skill.key_skill_id,
                  title: skill.title,
                  descriptors: skill.descriptors,
                });
              }
            }
            generationTargetedSkills = mergedTargets;
          }

          const prioritySkillsBlock = shortlistedSkillRows.length > 0
            ? shortlistedSkillRows
                .map((ks) => {
                  const reason = shortlistedSkillReasons.get(ks.key_skill_id);
                  const descriptors = ks.descriptors.slice(0, 4);
                  const lines = [`Key skill: ${ks.title}`];
                  if (reason) {
                    lines.push(`Why this is a priority: ${reason}`);
                  }
                  if (descriptors.length > 0) {
                    lines.push(`Descriptor themes:\n${descriptors.map((d) => `  • ${d}`).join("\n")}`);
                  }
                  return lines.join("\n");
                })
                .join("\n\n")
            : null;

          const selectionSummaryParts: string[] = [];
          if (reflectiveFocus) {
            selectionSummaryParts.push(`Preferred reflection arc: ${reflectiveFocus}`);
          }
          if (descriptorThemesCovered.length > 0) {
            selectionSummaryParts.push(
              `Descriptor themes currently supported:\n${descriptorThemesCovered.map((d) => `- ${d}`).join("\n")}`
            );
          }
          if (descriptorThemesGaps.length > 0) {
            selectionSummaryParts.push(
              `Descriptor themes to acknowledge as gaps:\n${descriptorThemesGaps.map((d) => `- ${d}`).join("\n")}`
            );
          }
          const selectionSummaryBlock = selectionSummaryParts.join("\n\n");

          const detailedBlocks: string[] = [];
          let usedChars = 0;
          let truncatedForSize = false;

          for (let i = 0; i < shortlistedRows.length; i += 1) {
            const row = shortlistedRows[i];
            const title = compactText(row.title, 160) || "Untitled entry";
            const kind = compactText(row.assessment_type ?? row.detected_entry_type, 60) || "assessment";
            const date = compactText(row.kaizen_date, 24) || "date unknown";
            const status = compactText(row.status, 24) || "unknown";
            const fullText = normalizeEntryText(row.entry_text);
            const fullTextBlock = fullText.length > 0 ? fullText : "(No entry text captured)";

            const block = [
              `Entry ${i + 1}:`,
              `Title: ${title}`,
              `Type: ${kind}`,
              `Date: ${date}`,
              `Status: ${status}`,
              "Full entry text:",
              fullTextBlock,
            ].join("\n");

            if (usedChars + block.length > MAX_CIP_CONTEXT_CHARS) {
              truncatedForSize = true;
              break;
            }

            detailedBlocks.push(block);
            usedChars += block.length;
          }

          generationFreeText = `${generationFreeText}

${prioritySkillsBlock ? `Priority CiP skills for this assessment:\n${prioritySkillsBlock}\n\n` : ""}${selectionSummaryBlock ? `${selectionSummaryBlock}\n\n` : ""}Shortlisted portfolio entries already mapped to CiP ${cipNumber}:
${detailedBlocks.join("\n\n---\n\n")}

${truncatedForSize ? "Note: linked-entry context was truncated only due extreme total size." : ""}

Generation requirement:
- Write trainee_comments entirely in first person as the trainee personally reflecting on their own portfolio evidence for this CiP.
- This is reflective writing, not an evidence catalogue.
- Do NOT use em dashes (—) anywhere in the text. Use commas, full stops, or restructure the sentence instead.
- Do NOT use section headers or numbered lists.
- Be concise. Do not pad, repeat, or over-elaborate. Say more with fewer words.
- For standard length, target about 320 to 420 words total for trainee_comments.
- Use the shortlisted entries as the core evidence. Focus on the most supportive cases and omit weaker repetitions.
- Let the reflection flow naturally from meaningful experiences.
- Use exactly 5 paragraphs with this flow:
- Paragraph 1: opening reflection arc across this CiP period only. No case narrative in paragraph 1.
- Paragraph 2: key experience 1, insight gained, and concrete change in practice.
- Paragraph 3: key experience 2, insight gained, and concrete change in practice.
- Paragraph 4: current gaps or weaker evidence, stated honestly and specifically.
- Paragraph 5: brief, specific next steps linked to those gaps.
- Paragraphs 2 and 3 must be the only case paragraphs. Do not add extra case examples elsewhere.
- Use plain, direct wording and shorter sentences. Avoid polished or academic phrasing.
- Vary sentence openings and phrasing. Avoid stock templates (for example: "Over this period...", "This taught me...", "I recognise...", "My next steps are...").
- Include at least one candid uncertainty line in simple language (for example: "I wasn't sure...", "I hesitated...", "I realised I had missed...").
- Show how key experiences have built on each other where that is genuinely true.
- For coverage of the CiP key skill descriptors: do NOT name or label descriptors explicitly. Instead, use the language and concepts from the descriptors naturally within the reflection, so that the coverage is evident without being mechanical (e.g. instead of writing "this demonstrates the descriptor about informed consent", write about the experience of explaining risks and getting consent).
- Honestly acknowledge descriptors not yet evidenced by the portfolio, framed as genuine areas still to develop.
- End with brief, specific next steps tied to the gaps.
- Keep the writing organised with clear paragraph flow, but avoid formulaic review phrasing (for example "looking at the evidence gathered", "areas least well evidenced", or "my immediate next steps are").
- Before returning, silently verify: exactly 5 paragraphs, 320 to 420 words for standard length, and no third case paragraph. If not, revise before output.
- Tone: genuine, reflective, clinical — written like a doctor, not an essay.`;

          const includedCount = detailedBlocks.length;
          const strictCount = strictLinkedRows.length;
          const fallbackCount = Math.max(linkedRows.length - strictCount, 0);
          cipDebugNote = `Debug (CiP ${cipNumber}): strict=${strictCount}, fallback=${fallbackCount}, total=${linkedRows.length}, selected_by_model=${selectedByModelCount}, selected_skills_by_model=${selectedSkillsByModelCount}, included_in_prompt=${includedCount}, selection_pass=${selectionPassUsed ? "yes" : "no"}, truncated=${truncatedForSize ? "yes" : "no"}`;
          console.info(`[PortfolioIQ] ${cipDebugNote}`);
        } else {
          cipDebugNote = `Debug (CiP ${cipNumber}): strict=0, fallback=0, total=0, included_in_prompt=0, selection_pass=no, truncated=no`;
          console.info(`[PortfolioIQ] ${cipDebugNote}`);
        }
      }
    }

    result = await generatePortfolioEntry({
      entry_type: body.entry_type ?? "auto",
      free_text: generationFreeText,
      stage_id: stageId,
      date_hint: body.date,
      length: body.length,
      target_key_skills: generationTargetedSkills,
    });

    if (result.entry_type === "cip_assessment") {
      const maybeComments = result.fields?.trainee_comments;
      if (typeof maybeComments === "string" && maybeComments.trim().length > 0) {
        const normalized = await normalizeCipTraineeComments({
          trainee_comments: maybeComments,
          length: body.length ?? "standard",
        });
        result.fields.trainee_comments = normalized.trainee_comments;

        result.notes = Array.isArray(result.notes) ? result.notes : [];
        result.notes.push(
          `CiP trainee_comments normalized: words=${normalized.word_count}, paragraphs=${normalized.paragraph_count}, compliant=${normalized.compliant ? "yes" : "no"}, adjusted=${normalized.adjusted ? "yes" : "no"}, attempts=${normalized.attempts}`
        );
      }
    }

    if (cipDebugNote) {
      result.notes = Array.isArray(result.notes) ? result.notes : [];
      result.notes.push(cipDebugNote);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AI generation failed: " + msg },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Pre-filter: pick top 20 by basic text signal ──
  const entryText = Object.values(result.fields)
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();

  const scored = enrichedKeySkills.map((ks) => {
    const allText = [ks.title, ...ks.descriptors].join(" ").toLowerCase();
    const words = allText
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const hits = words.filter((w) => entryText.includes(w)).length;
    const gapBoost = ks.covered === false ? 2 : 0;
    return { ks, score: hits + gapBoost };
  });

  const topCandidates = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.ks);

  // ── Pass 2 + stage resolution: run in parallel ──
  const [keySkillMatch, stageRow] = await Promise.all([
    matchKeySkills({
      entry_fields: result.fields,
      entry_type: result.entry_type,
      candidates: topCandidates,
      pinned_key_skill_ids: body.target_key_skill_ids ?? [],
    }).catch(() => ({
      suggested_key_skill_ids: [],
      rationale: {} as Record<string, string>,
    })),
    supabase
      .from("stages")
      .select("id")
      .eq("name", result.stage_id ?? stageId)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  result.suggested_key_skill_ids = keySkillMatch.suggested_key_skill_ids;
  result.key_skill_rationale = keySkillMatch.rationale;
  result.suggested_key_skills_detail =
    keySkillMatch.suggested_key_skill_ids.map((id) => {
      const skill = enrichedKeySkills.find((s) => s.key_skill_id === id);
      return {
        key_skill_id: id,
        title: skill?.title ?? id,
        cip_number: skill?.cip_number ?? null,
        covered: skill?.covered ?? null,
        rationale: keySkillMatch.rationale[id] ?? "",
      };
    });

  const stageUuid = stageRow?.id ?? null;

  const { data: saved, error: saveError } = await supabase
    .from("generated_entries")
    .insert({
      user_id: userId,
      entry_type: result.entry_type as GeneratedEntryType,
      raw_input: body.free_text.trim(),
      structured_data: result,
      suggested_key_skills: result.suggested_key_skill_ids ?? [],
      stage_id: stageUuid,
    })
    .select("id")
    .single();

  if (saveError) {
    console.error(
      "[PortfolioIQ] Failed to save generated entry:",
      saveError.message
    );
    return NextResponse.json(
      { ok: true, id: null, result },
      { headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    { ok: true, id: saved.id, result },
    { headers: CORS_HEADERS }
  );
}
