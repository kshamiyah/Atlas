"use client";

export type ActiveFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type ReviewActiveFilterChipsProps = {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
  onOpenFilters: () => void;
  showEditLink?: boolean;
};

export function ReviewActiveFilterChips({
  chips,
  onClearAll,
  onOpenFilters,
  showEditLink = true,
}: ReviewActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent-blue/25 bg-accent-blue/8 pl-2.5 pr-1 py-0.5 text-[11px] text-primary"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-3 hover:text-primary"
            aria-label={`Remove filter ${chip.label}`}
          >
            ×
          </button>
        </span>
      ))}
      {showEditLink ? (
        <button
          type="button"
          onClick={onOpenFilters}
          className="text-[11px] font-medium text-accent-blue hover:underline"
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[11px] font-medium text-muted hover:text-primary"
      >
        Clear all
      </button>
    </div>
  );
}
