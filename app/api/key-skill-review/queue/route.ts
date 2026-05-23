import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import {
  extractKaizenIdFromLinkedSkillRaw,
  normalizeSkillTitle,
  stripCipPrefixAndId,
} from "@/lib/key-skill-review/linked-skill-resolver";
import { parseAuditReviewDecisions } from "@/lib/key-skill-review/audit-review-decisions";
import type {
  ReviewEntry,
  SkillSuggestion,
  KeySkillCoverage,
  DescriptorCoverage,
  KaizenLinkedSkill,
} from "@/lib/types/key-skill-review";
import type { AuditEntryResult } from "@/lib/types/audit-entry-result";
import type { QueueResponse } from "@/lib/types/key-skill-review-api";

type EntryRow = {
  id: string;
  title: string;
  entry_type: string;
  linked_cip_number: number;
  event_date: string | null;
  entry_text: string;
  metadata: Record<string, unknown> | null;
};

type SuggestionRow = {
  id: string;
  review_entry_id: string;
  key_skill_id: string;
  suggestion_source: "linked_cip" | "cross_cip";
  status: SkillSuggestion["status"];
  confidence: number;
  rationale: string;
  suggested_action: "add" | "replace" | null;
  replace_key_skill_id: string | null;
};

type KeySkillRow = {
  id: string;
  title: string;
  cip_id: string | null;
  kaizen_ids: string[] | null;
};

type CipRow = {
  id: string;
  number: number;
};

type CoverageRow = {
  review_entry_id: string;
  key_skill_id: string;
  descriptor_id: string;
  covered: boolean;
  confidence: number | null;
  evidence_quote: string | null;
};

type DescriptorDetailRow = {
  id: string;
  text: string;
  sort_order: number;
};

type KaizenEntryLinkedRow = {
  source_entry_id: string | null;
  extracted_fields: Record<string, unknown> | null;
};

function parseLinkedKeySkillsRaw(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isMissingSuggestionActionColumnsError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const message = String(error.message ?? "");
  return (
    message.includes("suggested_action") ||
    message.includes("replace_key_skill_id")
  );
}

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && !(bypassAuth && !user)) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 },
    );
  }

  if (!user && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user && bypassAuth) {
    const body: QueueResponse = { entries: [], total: 0 };
    return NextResponse.json(body);
  }
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const { data: entryRows, error: entriesError } = await supabase
    .from("key_skill_review_entries")
    .select(
      "id, title, entry_type, linked_cip_number, event_date, entry_text, metadata",
    )
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });

  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load review entries: " + entriesError.message },
      { status: 500 },
    );
  }

  const entries = entryRows as EntryRow[] | null;

  if (!entries || entries.length === 0) {
    const body: QueueResponse = { entries: [], total: 0 };
    return NextResponse.json(body);
  }

  const entryIds = entries.map((e) => e.id);

  let suggestionRows:
    | Array<Record<string, unknown>>
    | null
    | undefined;
  let suggestionsError:
    | { code?: string; message?: string }
    | null
    | undefined;
  const suggestionsWithNewColumns = await supabase
    .from("key_skill_review_suggestions")
    .select(
      "id, review_entry_id, key_skill_id, suggestion_source, status, confidence, rationale, suggested_action, replace_key_skill_id",
    )
    .in("review_entry_id", entryIds)
    .eq("user_id", userId);

  if (isMissingSuggestionActionColumnsError(suggestionsWithNewColumns.error)) {
    const fallbackSuggestions = await supabase
      .from("key_skill_review_suggestions")
      .select(
        "id, review_entry_id, key_skill_id, suggestion_source, status, confidence, rationale",
      )
      .in("review_entry_id", entryIds)
      .eq("user_id", userId);
    suggestionRows = fallbackSuggestions.data as Array<Record<string, unknown>> | null;
    suggestionsError = fallbackSuggestions.error as
      | { code?: string; message?: string }
      | null;
  } else {
    suggestionRows = suggestionsWithNewColumns.data as Array<Record<string, unknown>> | null;
    suggestionsError = suggestionsWithNewColumns.error as
      | { code?: string; message?: string }
      | null;
  }

  if (suggestionsError) {
    return NextResponse.json(
      { error: "Failed to load suggestions: " + suggestionsError.message },
      { status: 500 },
    );
  }

  const suggestions = (suggestionRows ?? []).map((row): SuggestionRow => ({
    id: String(row.id),
    review_entry_id: String(row.review_entry_id),
    key_skill_id: String(row.key_skill_id),
    suggestion_source: row.suggestion_source as "linked_cip" | "cross_cip",
    status: row.status as SkillSuggestion["status"],
    confidence: Number(row.confidence ?? 0),
    rationale: String(row.rationale ?? ""),
    suggested_action:
      row.suggested_action === "add" || row.suggested_action === "replace"
        ? row.suggested_action
        : null,
    replace_key_skill_id:
      typeof row.replace_key_skill_id === "string"
        ? row.replace_key_skill_id
        : null,
  }));

  // Load descriptor coverage for all entries
  const { data: coverageData, error: coverageError } = await supabase
    .from("key_skill_descriptor_coverage")
    .select(
      "review_entry_id, key_skill_id, descriptor_id, covered, confidence, evidence_quote",
    )
    .in("review_entry_id", entryIds)
    .eq("user_id", userId);

  if (coverageError) {
    return NextResponse.json(
      { error: "Failed to load descriptor coverage: " + coverageError.message },
      { status: 500 },
    );
  }

  const coverageRows = (coverageData ?? []).map((row): CoverageRow => ({
    review_entry_id: String(row.review_entry_id),
    key_skill_id: String(row.key_skill_id),
    descriptor_id: String(row.descriptor_id),
    covered: Boolean(row.covered),
    confidence: row.confidence != null ? Number(row.confidence) : null,
    evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : null,
  }));

  const keySkillById = new Map<string, KeySkillRow>();
  const keySkillByKaizenId = new Map<string, KeySkillRow>();
  const keySkillByNormalizedTitle = new Map<string, KeySkillRow>();
  const cipNumberById = new Map<string, number>();
  const descriptorById = new Map<string, DescriptorDetailRow>();

  {
    const { data: keySkillRows, error: keySkillsError } = await supabase
      .from("key_skills")
      .select("id, title, cip_id, kaizen_ids");

    if (keySkillsError) {
      return NextResponse.json(
        { error: "Failed to load key skills: " + keySkillsError.message },
        { status: 500 },
      );
    }

    const keySkills = (keySkillRows ?? []).map((row): KeySkillRow => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      cip_id: row.cip_id ? String(row.cip_id) : null,
      kaizen_ids: Array.isArray(row.kaizen_ids)
        ? row.kaizen_ids.map((value) => String(value))
        : null,
    }));

    keySkills.forEach((ks) => {
      keySkillById.set(ks.id, ks);
      const normalizedTitle = normalizeSkillTitle(ks.title);
      if (normalizedTitle && !keySkillByNormalizedTitle.has(normalizedTitle)) {
        keySkillByNormalizedTitle.set(normalizedTitle, ks);
      }
      if (Array.isArray(ks.kaizen_ids)) {
        ks.kaizen_ids.forEach((kaizenId) => {
          const normalizedKaizenId = String(kaizenId || "").trim();
          if (normalizedKaizenId && !keySkillByKaizenId.has(normalizedKaizenId)) {
            keySkillByKaizenId.set(normalizedKaizenId, ks);
          }
        });
      }
    });

    const cipIds = Array.from(
      new Set(
        keySkills
          .map((ks) => ks.cip_id)
          .filter((cipId): cipId is string => typeof cipId === "string"),
      ),
    );

    if (cipIds.length > 0) {
      const { data: cipRows, error: cipsError } = await supabase
        .from("cips")
        .select("id, number")
        .in("id", cipIds);

      if (cipsError) {
        return NextResponse.json(
          { error: "Failed to load CiPs: " + cipsError.message },
          { status: 500 },
        );
      }

      const cips = (cipRows ?? []).map((row): CipRow => ({
        id: String(row.id),
        number: Number(row.number ?? 0),
      }));

      cips.forEach((cip) => cipNumberById.set(cip.id, cip.number));
    }

    // Load descriptor text/order for all coverage rows
    const coverageDescriptorIds = Array.from(
      new Set(coverageRows.map((c) => c.descriptor_id)),
    );

    if (coverageDescriptorIds.length > 0) {
      const { data: descriptorData, error: descriptorsError } = await supabase
        .from("descriptors")
        .select("id, text, sort_order")
        .in("id", coverageDescriptorIds);

      if (descriptorsError) {
        return NextResponse.json(
          { error: "Failed to load descriptors: " + descriptorsError.message },
          { status: 500 },
        );
      }

      (descriptorData ?? []).forEach((row) => {
        descriptorById.set(String(row.id), {
          id: String(row.id),
          text: String(row.text ?? ""),
          sort_order: Number(row.sort_order ?? 0),
        });
      });
    }
  }

  const sourceEntryIds = Array.from(
    new Set(
      entries
        .map((entry) => {
          const metadata =
            entry.metadata && typeof entry.metadata === "object" ? entry.metadata : null;
          const sourceEntryIdFromMeta =
            metadata && typeof metadata.source_entry_id === "string"
              ? metadata.source_entry_id.trim()
              : "";
          return sourceEntryIdFromMeta;
        })
        .filter(Boolean),
    ),
  );

  const linkedRawBySourceEntryId = new Map<string, string>();
  if (sourceEntryIds.length > 0) {
    const { data: kaizenRows, error: kaizenError } = await supabase
      .from("kaizen_entries")
      .select("source_entry_id, extracted_fields")
      .eq("user_id", userId)
      .in("source_entry_id", sourceEntryIds);

    if (kaizenError) {
      return NextResponse.json(
        { error: "Failed to load Kaizen entry snapshots: " + kaizenError.message },
        { status: 500 },
      );
    }

    ((kaizenRows ?? []) as KaizenEntryLinkedRow[]).forEach((row) => {
      const sourceEntryId =
        typeof row.source_entry_id === "string" ? row.source_entry_id.trim() : "";
      if (!sourceEntryId) return;
      const extracted = row.extracted_fields ?? {};
      const linkedRaw =
        extracted && typeof extracted === "object"
          ? String(extracted["linked key skills"] ?? "")
          : "";
      linkedRawBySourceEntryId.set(sourceEntryId, linkedRaw);
    });
  }

  const byEntry: Record<string, ReviewEntry> = {};

  entries.forEach((e) => {
    const metadata =
      e.metadata && typeof e.metadata === "object" ? e.metadata : null;
    const rawAuditResult =
      metadata &&
      typeof metadata.audit_last_result === "object" &&
      metadata.audit_last_result !== null
        ? (metadata.audit_last_result as Record<string, unknown>)
        : null;
    const auditResult: AuditEntryResult | undefined = rawAuditResult
      ? ({
          ...rawAuditResult,
          audit_input_fingerprint:
            typeof rawAuditResult.audit_input_fingerprint === "string"
              ? rawAuditResult.audit_input_fingerprint
              : typeof metadata?.audit_last_input_fingerprint === "string"
                ? metadata.audit_last_input_fingerprint
                : null,
          review_entry_id:
            typeof rawAuditResult.review_entry_id === "string"
              ? rawAuditResult.review_entry_id
              : e.id,
        } as AuditEntryResult)
      : undefined;
    const sourceEntryIdFromMeta =
      metadata && typeof metadata.source_entry_id === "string"
        ? metadata.source_entry_id.trim()
        : "";
    const linkedKeySkillsRaw = linkedRawBySourceEntryId.get(sourceEntryIdFromMeta) ?? "";
    const linkedKeySkillsParsed = parseLinkedKeySkillsRaw(linkedKeySkillsRaw);
    const currentKaizenLinkedSkills: KaizenLinkedSkill[] = [];

    linkedKeySkillsParsed.forEach((rawSkill) => {
      const kaizenId = extractKaizenIdFromLinkedSkillRaw(rawSkill);
      let matched: KeySkillRow | null = null;
      let matchMethod: KaizenLinkedSkill["match_method"] | null = null;

      if (kaizenId) {
        matched = keySkillByKaizenId.get(kaizenId) ?? null;
        if (matched) matchMethod = "kaizen_id";
      }

      if (!matched) {
        const normalized = normalizeSkillTitle(stripCipPrefixAndId(rawSkill));
        matched = normalized ? keySkillByNormalizedTitle.get(normalized) ?? null : null;
        if (matched) matchMethod = "title_exact";
      }

      if (!matched || !matchMethod) return;

      currentKaizenLinkedSkills.push({
        raw: rawSkill,
        key_skill_id: matched.id,
        key_skill_title: matched.title,
        cip_number: matched.cip_id ? (cipNumberById.get(matched.cip_id) ?? 0) : 0,
        kaizen_id: kaizenId,
        match_method: matchMethod,
      });
    });

    byEntry[e.id] = {
      id: e.id,
      title: e.title ?? "",
      entry_type: e.entry_type ?? "",
      linked_cip_number: e.linked_cip_number,
      date: e.event_date ?? "",
      raw_text: e.entry_text ?? "",
      linked_cip_suggestions: [],
      cross_cip_suggestions: [],
      audit_review_decisions: parseAuditReviewDecisions(metadata),
      kaizen_linked_skills: currentKaizenLinkedSkills,
      ...(auditResult ? { audit_result: auditResult } : {}),
    };
  });

  suggestions.forEach((s) => {
    const entry = byEntry[s.review_entry_id];
    if (!entry) return;
    const keySkill = keySkillById.get(s.key_skill_id);
    const cipNumber = keySkill?.cip_id
      ? (cipNumberById.get(keySkill.cip_id) ?? 0)
      : 0;
    const suggestion: SkillSuggestion = {
      suggestion_id: s.id,
      key_skill_id: s.key_skill_id,
      cip_number: cipNumber,
      key_skill_title: keySkill?.title ?? "",
      confidence: s.confidence,
      rationale: s.rationale,
      status: s.status,
      source: s.suggestion_source,
      suggested_action: s.suggested_action,
      replace_key_skill_id: s.replace_key_skill_id,
    };
    if (s.suggestion_source === "linked_cip") {
      entry.linked_cip_suggestions.push(suggestion);
    } else {
      entry.cross_cip_suggestions.push(suggestion);
    }
  });

  // Group coverage rows: review_entry_id → key_skill_id → rows
  const coverageByEntryAndSkill = new Map<string, Map<string, CoverageRow[]>>();
  for (const c of coverageRows) {
    let bySkill = coverageByEntryAndSkill.get(c.review_entry_id);
    if (!bySkill) {
      bySkill = new Map();
      coverageByEntryAndSkill.set(c.review_entry_id, bySkill);
    }
    const arr = bySkill.get(c.key_skill_id) ?? [];
    arr.push(c);
    bySkill.set(c.key_skill_id, arr);
  }

  // Attach descriptor_coverage to each entry that has coverage data
  for (const [entryId, bySkill] of coverageByEntryAndSkill) {
    const entry = byEntry[entryId];
    if (!entry) continue;

    const coverageForEntry: KeySkillCoverage[] = [];

    for (const [keySkillId, rows] of bySkill) {
      const ks = keySkillById.get(keySkillId);
      const cipNumber = ks?.cip_id ? (cipNumberById.get(ks.cip_id) ?? 0) : 0;

      const descriptors: DescriptorCoverage[] = rows
        .map((c): DescriptorCoverage | null => {
          const desc = descriptorById.get(c.descriptor_id);
          if (!desc) return null;
          return {
            descriptor_id: c.descriptor_id,
            descriptor_text: desc.text,
            sort_order: desc.sort_order,
            covered: c.covered,
            confidence: c.confidence ?? 0,
            evidence_quote: c.evidence_quote,
          };
        })
        .filter((d): d is DescriptorCoverage => d !== null)
        .sort((a, b) => a.sort_order - b.sort_order);

      if (descriptors.length > 0) {
        coverageForEntry.push({
          key_skill_id: keySkillId,
          key_skill_title: ks?.title ?? "",
          cip_number: cipNumber,
          descriptors,
        });
      }
    }

    entry.descriptor_coverage = coverageForEntry;
  }

  const resultEntries = Object.values(byEntry);

  const body: QueueResponse = {
    entries: resultEntries,
    total: resultEntries.length,
  };

  return NextResponse.json(body);
}
