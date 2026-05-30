"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 8;
const TOOLTIP_WIDTH = 288;

type TooltipPosition = {
  top: number;
  left: number;
};

type TooltipAlign = "center" | "end";

type SyncModesInfoTipProps = {
  align?: TooltipAlign;
};

function computeTooltipPosition(
  trigger: HTMLElement,
  tooltipHeight: number,
  align: TooltipAlign = "center",
): TooltipPosition {
  const rect = trigger.getBoundingClientRect();
  const maxWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);

  let top = rect.bottom + TOOLTIP_GAP;
  if (top + tooltipHeight > window.innerHeight - VIEWPORT_MARGIN) {
    top = rect.top - TOOLTIP_GAP - tooltipHeight;
  }
  top = Math.max(
    VIEWPORT_MARGIN,
    Math.min(top, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN),
  );

  let left =
    align === "end"
      ? rect.right - maxWidth
      : rect.left + rect.width / 2 - maxWidth / 2;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - maxWidth - VIEWPORT_MARGIN),
  );

  return { top, left };
}

export function SyncModesInfoTip({ align = "center" }: SyncModesInfoTipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      if (!rootRef.current) return;
      const tooltipHeight = tipRef.current?.offsetHeight ?? 200;
      setPosition(computeTooltipPosition(rootRef.current, tooltipHeight, align));
    }

    updatePosition();

    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (tipRef.current?.contains(target)) return;
      setOpen(false);
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
  }, [open]);

  const tooltip =
    open && mounted
      ? createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="rounded-lg border border-subtle px-3 py-2.5 text-[11px] font-normal leading-relaxed shadow-lg"
            style={{
              position: "fixed",
              top: position?.top ?? VIEWPORT_MARGIN,
              left: position?.left ?? VIEWPORT_MARGIN,
              width: Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
              zIndex: 9999,
              background: "var(--surface-1)",
            }}
          >
            <p className="font-semibold text-primary">Quick sync vs full sync</p>
            <div className="mt-2 space-y-2.5 text-secondary">
              <p>
                <span className="font-medium text-primary">Quick sync</span>
                {" — "}
                ~1–2 min. Recent entries plus targeted searches for OSATs, team observations,
                and CiP assessments. Use most days.
              </p>
              <p>
                <span className="font-medium text-primary">Full sync</span>
                {" — "}
                Several minutes. Your whole portfolio plus all 14 CiP pages. Use on first setup
                or after changing CiP links on entries.
              </p>
            </div>
            <p className="mt-2 text-muted">
              First visit with no data? Atlas runs a full sync automatically.
            </p>
          </div>,
          document.body,
        )
      : null;

  return (
    <span ref={rootRef} className="inline-flex align-middle">
      <button
        type="button"
        aria-label="Explain quick sync vs full sync"
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && rootRef.current) {
              setPosition(computeTooltipPosition(rootRef.current, 200, align));
            }
            return next;
          });
        }}
        className="inline-flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full border border-subtle text-[10px] font-semibold text-muted transition hover:bg-surface-3"
        style={{ background: "var(--surface-2)" }}
      >
        i
      </button>
      {tooltip}
    </span>
  );
}
