// ============================================================================
// Shared parts of the correct-match reward.
//
// Extracted from DailyMatchGhost so the board and the How to Play sequence play
// the exact same treatment from one source:
//
//   useMatchGhostStage  the reveal → hold → great clock (and the flip flag)
//   MatchGhostCard      one card: the 3D flip plus the .ww-great* overlays
//
// The board mounts these into a fixed layer pinned over the slots the solved
// pair just left; How to Play mounts them into its own relative box. Neither
// owns the timing or the markup.
// ============================================================================

import React from "react";
import type { Card } from "@/cardData";
import { CARD_BACK_PATH } from "@/cardData";
import { RADIUS } from "@/lib/tokens";
import {
  DAILY_MATCH_HOLD_MS,
  DAILY_MATCH_REVEAL_MS,
  DAILY_MATCH_GREAT_MS,
} from "@/lib/animationTiming";

export type MatchGhostStage = "reveal" | "hold" | "great";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Drives one pass of the reward: the pair flips up, holds, then gets the ghost
 * treatment. Under reduced motion the great stage is skipped entirely.
 * `onDone` fires at the end of the pass.
 */
export const useMatchGhostStage = (onDone?: () => void, startFaceUp = false) => {
  const [stage, setStage] = React.useState<MatchGhostStage>("reveal");
  const [faceUp, setFaceUp] = React.useState(startFaceUp);
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Start face down, then flip on the next frame so the transition runs.
    // When startFaceUp is set the pair is already face up (multiplayer), so
    // there is nothing to flip — the reveal beat is spent holding the pair.
    const raf = startFaceUp
      ? 0
      : requestAnimationFrame(() => setFaceUp(true));
    timers.push(setTimeout(() => setStage("hold"), DAILY_MATCH_REVEAL_MS));
    const afterHold = DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS;
    if (reduced) {
      timers.push(setTimeout(() => doneRef.current?.(), afterHold));
    } else {
      timers.push(setTimeout(() => setStage("great"), afterHold));
      timers.push(
        setTimeout(() => doneRef.current?.(), afterHold + DAILY_MATCH_GREAT_MS)
      );
    }
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return { stage, faceUp };
};

/** One ghost copy: the flip, then the wash / shine / ring on `great`. */
export const MatchGhostCard: React.FC<{
  card: Card;
  stage: MatchGhostStage;
  faceUp: boolean;
  /** Card width divided by the authored 104.333, as the wrong/great CSS wants. */
  k: number;
  /** Corner radius in px; defaults to the board's value. */
  radius?: number;
  style?: React.CSSProperties;
}> = ({ card, stage, faceUp, k, radius = RADIUS.md, style }) => (
  <div
    className={stage === "great" ? "ww-great" : undefined}
    style={{
      borderRadius: radius,
      perspective: 600,
      pointerEvents: "none",
      ["--ww-k" as string]: String(k),
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        transformStyle: "preserve-3d",
        transition: `transform ${DAILY_MATCH_REVEAL_MS}ms cubic-bezier(0.4,0,0.2,1)`,
        transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backfaceVisibility: "hidden",
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        <img
          src={card.svgPath}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backfaceVisibility: "hidden",
          borderRadius: radius,
          overflow: "hidden",
          transform: "rotateY(180deg)",
        }}
      >
        <img
          src={CARD_BACK_PATH}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </div>

    {stage === "great" && (
      <>
        <div
          className="ww-great-wash"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
        />
        <div className="ww-great-shine" style={{ pointerEvents: "none", zIndex: 2 }} />
        <div
          className="ww-great-ring"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}
        />
      </>
    )}
  </div>
);
