"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  text: string;
};

export function InlineInfoTip({ text }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const tipId = useId();

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <span ref={rootRef} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Show metric explanation"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-subtle text-[10px] font-semibold text-muted transition hover:bg-surface-3"
        style={{ background: "var(--surface-2)" }}
      >
        i
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-64 -translate-x-1/2 rounded-lg border border-subtle px-2.5 py-2 text-[11px] font-normal leading-relaxed text-secondary shadow-lg"
          style={{ background: "var(--surface-1)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
