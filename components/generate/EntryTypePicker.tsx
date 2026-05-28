"use client";

import { useEffect, useRef, useState } from "react";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";
import { ENTRY_TYPE_GROUPS } from "@/lib/generate/entry-type-groups";
import type { GeneratedEntryType } from "@/lib/types/entries";

type EntryTypePickerProps = {
  value: GeneratedEntryType | null;
  onChange: (type: GeneratedEntryType) => void;
  onClearResult?: () => void;
};

export function EntryTypePicker({ value, onChange, onClearResult }: EntryTypePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectType(type: GeneratedEntryType) {
    onChange(type);
    onClearResult?.();
    setOpen(false);
  }

  const label = value ? ENTRY_TYPE_SCHEMAS[value].title : "Choose entry type…";
  const needsSelection = value === null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition hover:bg-surface-3 ${
          needsSelection
            ? "border-accent-blue/35 bg-accent-blue/6 text-secondary"
            : "border-subtle bg-surface-1 text-primary"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`shrink-0 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-2xl border border-subtle bg-surface-2 shadow-lg"
          style={{
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)",
          }}
          role="listbox"
        >
          {ENTRY_TYPE_GROUPS.map((group, groupIndex) => (
            <div key={group.id}>
              <p
                className={`px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted ${
                  groupIndex > 0 ? "border-t border-subtle" : ""
                }`}
              >
                {group.label}
              </p>
              <ul>
                {group.types.map((type) => {
                  const selected = value === type;
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        onClick={() => selectType(type)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-surface-3 ${
                          selected
                            ? "bg-accent-blue/8 font-medium text-primary"
                            : "text-secondary"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {ENTRY_TYPE_SCHEMAS[type].title}
                        </span>
                        {selected ? (
                          <span className="shrink-0 text-accent-blue" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
