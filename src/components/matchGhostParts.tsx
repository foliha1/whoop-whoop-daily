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
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useCardLift } from "@/lib/cardLift";
import type { Card } from "@/cardData";
import { CARD_BACK_PATH } from "@/cardData";
import { RADIUS } from "@/lib/tokens";
import {
  DAILY_MATCH_HOLD_MS,
  DAILY_MATCH_REVEAL_MS,
  DAILY_MATCH_GREAT_MS,
} from "@/lib/animationTiming";
import { skinArt, useSkin } from "@/lib/skin";

export type MatchGhostStage = "reveal" | "hold" | "great";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Drives one pass of the reward: the pair flips up, holds, then gets the ghost
 * treatment. Under reduced motion the great stage is skipped entirely.
 * `onDone` fires at the end of the pass.
 */
export const useMatchGhostStage = (onDone?: () => void, startFaceUp = false, elapsedMs = 0) => {
  const afterHold0 = DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS;
  const [stage, setStage] = React.useState<MatchGhostStage>(
    elapsedMs >= afterHold0 ? "great" : elapsedMs >= DAILY_MATCH_REVEAL_MS ? "hold" : "reveal",
  );
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
    // elapsedMs > 0 only for a client that arrived mid-settle: every beat
    // shifts earlier by the same amount, so it lands on the host's timeline.
    const at = (ms: number) => Math.max(0, ms - elapsedMs);
    if (elapsedMs < DAILY_MATCH_REVEAL_MS) timers.push(setTimeout(() => setStage("hold"), at(DAILY_MATCH_REVEAL_MS)));
    const afterHold = DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS;
    if (reduced) {
      timers.push(setTimeout(() => doneRef.current?.(), at(afterHold)));
    } else {
      if (elapsedMs < afterHold) timers.push(setTimeout(() => setStage("great"), at(afterHold)));
      timers.push(
        setTimeout(() => doneRef.current?.(), at(afterHold + DAILY_MATCH_GREAT_MS))
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
  /** Start angle for a card caught mid-flip; it continues up to face up. */
  fromRotate?: number;
  /** Carry the board card's moving shadow through the flip and the lift-off. */
  shadow?: boolean;
}> = ({ card, stage, faceUp, k, radius = RADIUS.md, style, fromRotate, shadow = false }) => {
  // Subscribed so a skin toggle re-renders; skinArt maps at render time.
  useSkin();
  // Captured at mount: face down means this card should flip; face up means
  // it starts revealed. Motion owns the start frame, so no paint race.
  const initialRotate = React.useRef(fromRotate ?? (faceUp ? 0 : 180)).current;
  const reduceMotion = useReducedMotion();
  // One angle value drives the flip, the lift and the shadow (as on the board).
  const flipAngle = useMotionValue(initialRotate);
  const target = fromRotate != null || faceUp ? 0 : 180;
  React.useEffect(() => {
    if (reduceMotion) { flipAngle.set(target); return; }
    const run = animate(flipAngle, target, { duration: DAILY_MATCH_REVEAL_MS / 1000, ease: [0.4, 0, 0.2, 1] });
    return () => run.stop();
  }, [target, reduceMotion, flipAngle]);
  const { scale: flipScale, shadow: shadowCss, shadowScaleX } = useCardLift(flipAngle);
  const great = stage === "great";
  return (
  <div
    className={great ? (shadow ? "ww-great ww-great-shadow" : "ww-great") : undefined}
    style={{
      borderRadius: radius,
      perspective: 600,
      pointerEvents: "none",
      ["--ww-k" as string]: String(k),
      ...style,
    }}
  >
    {/* Flip shadow. On "great" the card is face up and .ww-great clips its
        children, so the shadow hands over to .ww-great-shadow's box-shadow,
        which starts at the same resting values and follows the lift-off. */}
    {shadow && !great && (
      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, borderRadius: radius,
          pointerEvents: "none", boxShadow: shadowCss, scaleX: shadowScaleX,
        }}
      />
    )}
    <motion.div
      className="ww-match-ghost-flip"
      style={{
        position: "absolute",
        inset: 0,
        transformStyle: "preserve-3d",
        rotateY: flipAngle,
        scale: flipScale,
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
          src={skinArt(card.svgPath)}
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
          src={skinArt(CARD_BACK_PATH)}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </motion.div>

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
};
