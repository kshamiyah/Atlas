"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReviewSwipePreviewProps = {
  compact?: boolean;
};

const SWIPE_THRESHOLD_PX = 96;
const TRACK_SCALE = 0.35;
const MAX_TRACK_PX = 52;
const SWIPE_EASE = [0.2, 0.75, 0.2, 1] as const;

const REST_MS = 1350;
const DRAG_MS = 620;
const DRAG_SETTLE_MS = 110;
const COMMIT_MS = 300;
const ENTER_MS = 260;
const GAP_MS = 1150;
const COMMIT_EXIT_PX = 76;

type DemoCard = {
  title: string;
  subtitle: string;
  confidence: string;
  rationale: string;
  linksNote?: string;
};

const SUGGESTION_QUEUE_SIZE = 12;

const DEMO_CARDS: DemoCard[] = [
  {
    title: "CiP 3 · KS 2",
    subtitle: "Personalised procedures",
    confidence: "91%",
    linksNote: "Accepting this would make it 2 of 3.",
    rationale:
      "Procedure entry demonstrates personalised counselling and consent for marsupialisation.",
  },
  {
    title: "CiP 5 · KS 1",
    subtitle: "Communication in difficult situations",
    confidence: "78%",
    linksNote: "Accepting this would make it 1 of 3.",
    rationale:
      "Reflection covers breaking bad news and shared decision-making with the patient.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function trackX(dragX: number) {
  return clamp(dragX * TRACK_SCALE, -MAX_TRACK_PX, MAX_TRACK_PX);
}

function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4;
}

function easeInQuart(t: number) {
  return t ** 4;
}

function makeBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let start = 0;
    let end = 1;
    for (let i = 0; i < 10; i += 1) {
      const mid = (start + end) / 2;
      const x =
        3 * (1 - mid) ** 2 * mid * p1x + 3 * (1 - mid) * mid ** 2 * p2x + mid ** 3;
      if (x < t) start = mid;
      else end = mid;
    }

    const mid = (start + end) / 2;
    return 3 * (1 - mid) ** 2 * mid * p1y + 3 * (1 - mid) * mid ** 2 * p2y + mid ** 3;
  };
}

const easeOutApp = makeBezier(...SWIPE_EASE);

type DemoFrame = {
  dragX: number;
  frontScale: number;
  commitSlideX: number;
  committing: "confirm" | "reject" | null;
  enterProgress: number;
  enterDirection: 1 | -1;
  activeIndex: number;
  tintStrength: number;
};

function tintStrengthForDrag(dragX: number) {
  const magnitude = Math.abs(dragX);
  if (magnitude < 8) return 0;
  return clamp((magnitude - 8) / (SWIPE_THRESHOLD_PX - 8), 0, 1);
}

function computeFrame(elapsedMs: number): DemoFrame {
  const dragTotalMs = DRAG_MS + DRAG_SETTLE_MS;
  const acceptBlock = REST_MS + dragTotalMs + COMMIT_MS + ENTER_MS;
  const skipBlock = GAP_MS + dragTotalMs + COMMIT_MS + ENTER_MS;
  const cycleMs = acceptBlock + skipBlock;

  const cycleT = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;

  const runSegment = (
    start: number,
    rest: number,
    drag: number,
    commit: number,
    enter: number,
    direction: 1 | -1,
    cardOffset: number,
  ): DemoFrame | null => {
    const dragStart = start + rest;
    const commitStart = dragStart + drag;
    const enterStart = commitStart + commit;
    const end = enterStart + enter;

    if (cycleT < start || cycleT >= end) return null;

    const activeIndex = cardOffset % DEMO_CARDS.length;
    const thresholdDragX = direction * SWIPE_THRESHOLD_PX;
    const thresholdTrackX = trackX(thresholdDragX);

    if (cycleT < dragStart) {
      return {
        dragX: 0,
        frontScale: 1,
        commitSlideX: 0,
        committing: null,
        enterProgress: 1,
        enterDirection: direction,
        activeIndex,
        tintStrength: 0,
      };
    }

    if (cycleT < commitStart) {
      const dragElapsed = cycleT - dragStart;
      let dragX = 0;

      if (dragElapsed <= DRAG_MS) {
        const dragT = dragElapsed / DRAG_MS;
        dragX = thresholdDragX * easeOutQuart(clamp(dragT, 0, 1));
      } else {
        dragX = thresholdDragX;
      }

      const abs = Math.abs(dragX);
      return {
        dragX,
        frontScale: 1 - Math.min(0.015, abs / 4200),
        commitSlideX: 0,
        committing: null,
        enterProgress: 1,
        enterDirection: direction,
        activeIndex,
        tintStrength: tintStrengthForDrag(dragX),
      };
    }

    if (cycleT < enterStart) {
      const commitT = (cycleT - commitStart) / commit;
      const eased = easeInQuart(clamp(commitT, 0, 1));
      return {
        dragX: thresholdDragX,
        frontScale: 0.992 - eased * 0.007,
        commitSlideX: direction * (Math.abs(thresholdTrackX) + eased * COMMIT_EXIT_PX),
        committing: direction === 1 ? "confirm" : "reject",
        enterProgress: 0,
        enterDirection: direction,
        activeIndex,
        tintStrength: 1,
      };
    }

    const enterT = (cycleT - enterStart) / enter;
    const eased = easeOutApp(clamp(enterT, 0, 1));
    return {
      dragX: 0,
      frontScale: 0.995 + eased * 0.005,
      commitSlideX: 0,
      committing: null,
      enterProgress: eased,
      enterDirection: direction,
      activeIndex: (activeIndex + 1) % DEMO_CARDS.length,
      tintStrength: 0,
    };
  };

  const accept = runSegment(0, REST_MS, dragTotalMs, COMMIT_MS, ENTER_MS, 1, 0);
  if (accept) return accept;

  const skip = runSegment(acceptBlock, GAP_MS, dragTotalMs, COMMIT_MS, ENTER_MS, -1, 1);
  if (skip) return skip;

  return {
    dragX: 0,
    frontScale: 1,
    commitSlideX: 0,
    committing: null,
    enterProgress: 1,
    enterDirection: 1,
    activeIndex: 0,
    tintStrength: 0,
  };
}

function swipeTintClass(
  dragX: number,
  committing: DemoFrame["committing"],
  tintStrength: number,
) {
  if (committing === "confirm") return "border-accent-green/70 bg-surface-1";
  if (committing === "reject") return "border-accent-red/70 bg-surface-1";
  if (tintStrength > 0 && dragX > 0) return "border-accent-green/45 bg-surface-1";
  if (tintStrength > 0 && dragX < 0) return "border-accent-red/45 bg-surface-1";
  return "border-subtle bg-surface-1";
}

function swipeOverlayStyle(
  dragX: number,
  committing: DemoFrame["committing"],
  tintStrength: number,
) {
  if (committing === "confirm") {
    return { backgroundColor: "rgba(52, 199, 89, 0.38)" };
  }
  if (committing === "reject") {
    return { backgroundColor: "rgba(255, 69, 58, 0.38)" };
  }
  if (tintStrength <= 0) return null;
  const alpha = 0.08 + tintStrength * 0.22;
  if (dragX > 0) return { backgroundColor: `rgba(52, 199, 89, ${alpha})` };
  if (dragX < 0) return { backgroundColor: `rgba(255, 69, 58, ${alpha})` };
  return null;
}

function boxShadow(
  dragX: number,
  committing: DemoFrame["committing"],
  tintStrength: number,
) {
  if (committing === "confirm") return "0 0 0 3px rgba(52, 199, 89, 0.28)";
  if (committing === "reject") return "0 0 0 3px rgba(255, 69, 58, 0.24)";
  if (tintStrength > 0 && dragX > 0) {
    return `0 0 0 ${1 + tintStrength}px rgba(52, 199, 89, ${0.12 + tintStrength * 0.12})`;
  }
  if (tintStrength > 0 && dragX < 0) {
    return `0 0 0 ${1 + tintStrength}px rgba(255, 69, 58, ${0.1 + tintStrength * 0.1})`;
  }
  return undefined;
}

function DemoCardContent({
  card,
  showBody,
  compact,
}: {
  card: DemoCard;
  showBody: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-purple/30 bg-accent-purple/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent-purple">
              <span aria-hidden className="text-[8px]">
                ✦
              </span>
              AI suggestion
            </span>
            {!compact ? (
              <span className="text-[9px] font-medium text-muted">Needs your review</span>
            ) : null}
          </div>
          <p className="text-[12px] font-semibold text-primary">{card.title}</p>
          <p className="text-[11px] text-muted">{card.subtitle}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="rounded-full border border-accent-purple/25 bg-accent-purple/8 px-2 py-0.5 text-[10px] font-semibold text-accent-purple">
            {card.confidence}
          </span>
          <p className="mt-0.5 text-[9px] font-medium text-muted">match</p>
        </div>
      </div>

      <div className="rounded-xl border border-subtle bg-surface-2/85 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Current links
          </p>
          <p className="text-[11px] font-medium text-primary">1 of 3 linked</p>
          <p className="text-[11px] text-secondary">2 slots left</p>
        </div>
        {card.linksNote ? (
          <p className="mt-1 text-[11px] text-secondary">{card.linksNote}</p>
        ) : null}
        {showBody ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-secondary">
              CiP 3 · KS 4
            </span>
          </div>
        ) : null}
      </div>

      {showBody ? (
        <div className="rounded-xl border border-accent-purple/15 bg-accent-purple/5 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-purple">
            Why Atlas suggests this
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-secondary">{card.rationale}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ReviewSwipePreview({ compact = false }: ReviewSwipePreviewProps) {
  const [frame, setFrame] = useState<DemoFrame>(() => computeFrame(0));
  const [paused, setPaused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(3);
  const startRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const enterDoneRef = useRef(true);

  const tick = useCallback(
    (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current - pausedAccumRef.current;
      setFrame(computeFrame(elapsed));
      rafRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  useEffect(() => {
    if (compact || paused) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setFrame({
        dragX: 0,
        frontScale: 1,
        commitSlideX: 0,
        committing: null,
        enterProgress: 1,
        enterDirection: 1,
        activeIndex: 0,
        tintStrength: 0,
      });
      return undefined;
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [compact, paused, tick]);

  useEffect(() => {
    if (!paused && pauseStartRef.current != null) {
      pausedAccumRef.current += performance.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [paused]);

  useEffect(() => {
    if (compact) return;
    const finishedEnter = frame.enterProgress >= 0.98 && !frame.committing;
    if (finishedEnter && !enterDoneRef.current) {
      setSuggestionIndex((current) =>
        current >= SUGGESTION_QUEUE_SIZE ? 3 : current + 1,
      );
    }
    enterDoneRef.current = finishedEnter;
  }, [compact, frame.committing, frame.enterProgress]);

  const handlePause = () => {
    pauseStartRef.current = performance.now();
    setPaused(true);
  };

  const handleResume = () => {
    setPaused(false);
  };

  const frontTrack = trackX(frame.dragX);
  const backIndex = (frame.activeIndex + 1) % DEMO_CARDS.length;
  const frontCard = DEMO_CARDS[frame.activeIndex];
  const backCard = DEMO_CARDS[backIndex];
  const isEntering = !frame.committing && frame.enterProgress < 1;

  const isDragging = !frame.committing && Math.abs(frame.dragX) > 0.5;
  const isSwipeActive = isDragging || frame.committing;

  const backSettle = frame.committing || isDragging
    ? 1
    : isEntering
      ? 1 - frame.enterProgress
      : 1;

  const backStyle = {
    transform: `translateY(${10 * backSettle}px) scale(${0.97 + (1 - backSettle) * 0.03})`,
    opacity: isSwipeActive ? 0 : isEntering ? frame.enterProgress * 0.62 : 0.62,
    transition: "none",
  } as const;

  const enterEased = isEntering ? frame.enterProgress : 1;
  const enterOffset = (1 - enterEased) * 12 * frame.enterDirection;
  const enterLift = (1 - enterEased) * 6;

  let frontTransform = `translateX(${frontTrack}px) scale(${frame.frontScale})`;
  if (frame.committing) {
    frontTransform = `translateX(${frame.commitSlideX}px) scale(${frame.frontScale})`;
  } else if (isEntering) {
    frontTransform = `translateX(${enterOffset}px) translateY(${enterLift}px) scale(${frame.frontScale})`;
  }

  const frontStyle = {
    transform: frontTransform,
    opacity: frame.committing || isDragging ? 1 : 0.35 + enterEased * 0.65,
    boxShadow: boxShadow(frame.dragX, frame.committing, frame.tintStrength),
    transition: "background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
  } as const;

  const swipeOverlay = swipeOverlayStyle(frame.dragX, frame.committing, frame.tintStrength);

  const acceptHintOpacity =
    frame.tintStrength > 0 && frame.dragX > 0
      ? frame.tintStrength
      : frame.committing === "confirm"
        ? 0.85
        : 0;
  const rejectHintOpacity =
    frame.tintStrength > 0 && frame.dragX < 0
      ? frame.tintStrength
      : frame.committing === "reject"
        ? 0.85
        : 0;

  const suggestionsLeft = SUGGESTION_QUEUE_SIZE - suggestionIndex + 1;

  return (
    <div className="space-y-3">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-purple/30 bg-accent-purple/10 px-2.5 py-1 text-[10px] font-semibold text-accent-purple">
            <span aria-hidden className="text-[9px]">
              ✦
            </span>
            AI suggestion queue
          </span>
          {!compact ? (
            <span className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-secondary">
              {suggestionsLeft} left to review
            </span>
          ) : null}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Swipe spotlight
          </p>
          <h3 className="text-[13px] font-semibold leading-snug text-primary">
            OSATS · Bartholin&apos;s cyst marsupialisation
          </h3>
          <p className="text-[11px] text-secondary">
            Suggestion {suggestionIndex} of {SUGGESTION_QUEUE_SIZE}
            {!compact ? " · Atlas mapped this entry to key skills — you confirm each link" : null}
          </p>
        </div>
        {!compact ? (
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent-purple/70 transition-[width] duration-300 ease-out"
              style={{
                width: `${((suggestionIndex - 1) / SUGGESTION_QUEUE_SIZE) * 100}%`,
              }}
            />
          </div>
        ) : null}
      </header>

      <div
        className={["relative overflow-hidden", compact ? "min-h-[168px]" : "min-h-[240px]"].join(" ")}
        onMouseEnter={compact ? undefined : handlePause}
        onMouseLeave={compact ? undefined : handleResume}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-3 z-0 rounded-2xl border border-subtle bg-surface-1 p-3.5"
          style={
            compact
              ? { transform: "translateY(10px) scale(0.97)", opacity: 0.65 }
              : backStyle
          }
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
            Next AI suggestion
          </p>
          <DemoCardContent card={backCard} showBody={false} compact={compact} />
        </div>

        <div className="relative z-10 mx-1 mt-1">
          {!compact && rejectHintOpacity > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 z-0 rounded-full border border-accent-red/30 bg-accent-red/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent-red"
              style={{
                opacity: rejectHintOpacity,
                transform: `translateY(-50%) scale(${0.94 + rejectHintOpacity * 0.06})`,
              }}
            >
              Skip
            </span>
          ) : null}
          {!compact && acceptHintOpacity > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute right-0 top-1/2 z-0 rounded-full border border-accent-green/30 bg-accent-green/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent-green"
              style={{
                opacity: acceptHintOpacity,
                transform: `translateY(-50%) scale(${0.94 + acceptHintOpacity * 0.06})`,
              }}
            >
              Accept
            </span>
          ) : null}
          <div
            className={[
              "relative z-10 overflow-hidden touch-pan-y rounded-2xl border p-3.5 shadow-sm md:p-4",
              compact
                ? "translate-x-3 border-accent-green/35 bg-surface-1"
                : swipeTintClass(frame.dragX, frame.committing, frame.tintStrength),
            ].join(" ")}
            style={compact ? undefined : frontStyle}
          >
            {swipeOverlay ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={swipeOverlay}
              />
            ) : null}
            <div className="relative z-[1]">
              <DemoCardContent card={frontCard} showBody={!compact} compact={compact} />
            </div>
          </div>
        </div>
      </div>

      {!compact ? (
        <>
          <p className="text-[11px] text-muted">
            Work through Atlas&apos;s AI suggestions one by one — accept to link the skill, skip to
            dismiss. Hover to pause the demo.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-secondary">
              Skip suggestion
            </span>
            <span className="rounded-full bg-accent-primary px-2.5 py-1 text-[10px] font-medium text-surface-2">
              Accept suggestion
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
