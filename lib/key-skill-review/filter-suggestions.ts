import type { ReviewEntry, SkillSuggestion } from "@/lib/types/key-skill-review";
import type {
  ConfidenceFilter,
  SourceFilter,
  StatusFilter,
} from "@/components/key-skill-review/ReviewFilters";

export type SuggestionFilterState = {
  query: string;
  status: StatusFilter;
  source: SourceFilter;
  confidence: ConfidenceFilter;
};

function applyStatusFilter(
  suggestions: SkillSuggestion[],
  status: StatusFilter,
): SkillSuggestion[] {
  if (status === "all") return suggestions;
  return suggestions.filter((s) => s.status === status);
}

function applyConfidenceFilter(
  suggestions: SkillSuggestion[],
  confidence: ConfidenceFilter,
): SkillSuggestion[] {
  if (confidence === "all") return suggestions;
  if (confidence === "lt_0_7") {
    return suggestions.filter((s) => s.confidence < 0.7);
  }
  return suggestions.filter((s) => s.confidence >= 0.7);
}

function matchesSuggestionQuery(
  suggestion: SkillSuggestion,
  normalisedQuery: string,
): boolean {
  return (
    suggestion.key_skill_title.toLowerCase().includes(normalisedQuery) ||
    suggestion.key_skill_id.toLowerCase().includes(normalisedQuery)
  );
}

export function filterSuggestionsForEntry(
  entry: ReviewEntry,
  filters: SuggestionFilterState,
): { linked: SkillSuggestion[]; cross: SkillSuggestion[] } {
  const normalisedQuery = filters.query.trim().toLowerCase();

  let linked = entry.linked_cip_suggestions;
  let cross = entry.cross_cip_suggestions;

  if (filters.source === "linked_cip") cross = [];
  else if (filters.source === "cross_cip") linked = [];

  linked = applyConfidenceFilter(applyStatusFilter(linked, filters.status), filters.confidence);
  cross = applyConfidenceFilter(applyStatusFilter(cross, filters.status), filters.confidence);

  const entryTextMatch =
    !normalisedQuery ||
    entry.title.toLowerCase().includes(normalisedQuery) ||
    entry.raw_text.toLowerCase().includes(normalisedQuery);

  if (!entryTextMatch) {
    linked = linked.filter((s) => matchesSuggestionQuery(s, normalisedQuery));
    cross = cross.filter((s) => matchesSuggestionQuery(s, normalisedQuery));
  }

  return { linked, cross };
}

export function countSuggestionStats(
  entries: ReviewEntry[],
  filters: SuggestionFilterState,
): {
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
  crossPending: number;
} {
  let total = 0;
  let pending = 0;
  let confirmed = 0;
  let rejected = 0;
  let crossPending = 0;

  for (const entry of entries) {
    const { linked, cross } = filterSuggestionsForEntry(entry, filters);
    const suggestions = [...linked, ...cross];

    for (const suggestion of suggestions) {
      total += 1;
      if (suggestion.status === "suggested") pending += 1;
      else if (suggestion.status === "confirmed") confirmed += 1;
      else if (suggestion.status === "rejected") rejected += 1;
    }

    crossPending += cross.filter((s) => s.status === "suggested").length;
  }

  return { total, pending, confirmed, rejected, crossPending };
}
