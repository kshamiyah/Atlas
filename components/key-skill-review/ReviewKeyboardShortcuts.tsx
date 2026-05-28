"use client";

import { useEffect, useId, useRef, useState } from "react";

type ReviewKeyboardShortcutsProps = {
  focusModeActive?: boolean;
  swipeModeActive?: boolean;
  canUndo?: boolean;
};

type ShortcutRow = {
  keys: string[];
  label: string;
  available?: boolean;
};

export function ReviewKeyboardShortcuts({
  focusModeActive = false,
  swipeModeActive = false,
  canUndo = false,
}: ReviewKeyboardShortcutsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      setIsOpen((current) => !current);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);

  const shortcuts: ShortcutRow[] = [
    {
      keys: ["←"],
      label: swipeModeActive ? "Accept / Apply" : "Accept suggestion or apply audit action",
      available: focusModeActive,
    },
    {
      keys: ["→"],
      label: swipeModeActive ? "Skip / Keep as is" : "Skip suggestion or keep current setup",
      available: focusModeActive,
    },
    {
      keys: ["N"],
      label: "Next entry in queue",
      available: focusModeActive,
    },
    {
      keys: ["P"],
      label: "Previous entry in queue",
      available: focusModeActive,
    },
    {
      keys: ["U"],
      label: "Undo last action",
      available: focusModeActive && canUndo,
    },
    {
      keys: ["Esc"],
      label: "Exit swipe mode",
      available: focusModeActive && swipeModeActive,
    },
    {
      keys: ["?"],
      label: "Show or hide this help",
      available: true,
    },
  ];

  const visibleShortcuts = shortcuts.filter((row) => row.available !== false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-1 text-[11px] font-semibold text-secondary transition hover:bg-surface-2 hover:text-primary"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-hidden={!isOpen}
        className={[
          "absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-lg transition-all duration-200",
          isOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0",
        ].join(" ")}
      >
        <div className="border-b border-subtle px-3 py-2.5">
          <p className="text-xs font-semibold text-primary">Keyboard shortcuts</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {focusModeActive
              ? "Available in Focus and Swipe view."
              : "Switch to Focus view to use review shortcuts."}
          </p>
        </div>
        <ul className="space-y-0.5 px-2 py-2">
          {visibleShortcuts.map((row) => (
            <li
              key={row.label}
              className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5"
            >
              <span className="text-[11px] leading-snug text-secondary">{row.label}</span>
              <span className="inline-flex shrink-0 flex-wrap justify-end gap-1">
                {row.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-subtle bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
