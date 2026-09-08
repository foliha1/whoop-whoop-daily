// ============================================================================
// RollHeroOverlay — plays the hero roll animation on top of the play-area
// container, timed against serverNow() so every client's animation lands at
// the same wall-clock moment regardless of message-arrival latency.
//
// Layout: absolutely positioned inside a `position: relative` parent. Its
// "home" is the 80x80 cream box inside the dice box (bottom left of the tray).
// The overlay renders at that position and lifts itself over the play area
// via `transform: translate(dx, dy) scale(2.5)`. Transform ONLY — never
// animate `left/top` (would fight the parent's layout and repaint constantly).
//
// Timeline (offsets from startAt, total ROLL_HERO_MS = 2000):
//   0     → 800   cube tumbles from spin(seed) → landed rotation, eased with
//                 cubic-bezier(0.16, 1, 0.3, 1) so it decelerates into place
//   800   → 1750  hold on landed cube at lifted scale (950ms)
//   1750  → 2000  transform back to home: translate(0,0) scale(1) (250ms)
//   2000  →       overlay hidden; dice box shows the instruction natively
//
// The landed die faces carry the instruction lettering in their artwork, so
// no separate instruction card / crossfade is needed — the cube itself is
// what shrinks into the dice box.
//
// Guards (never shorten the phase — onComplete always fires at ROLL_HERO_MS):
//   • prefers-reduced-motion: skip tumble + fly; render landed cube in-box.
//   • Tap-to-skip: overlay is clickable; jumps to landed state locally.
//   • Late arrival (elapsed > TUMBLE_MS on mount): skip the truncated tumble and
//     jump straight to the landed state. Threshold stays tied to the end of
//     the tumble, NOT the new total.
// ============================================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MatchDie,
  landedComponentsFor,
} from "@/components/MatchDie";
import type { RollCommitPayload } from "@/lib/multiplayer";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import { serverNow } from "@/hooks/useServerClock";

const HOME_SIZE = 80;         // 80×80 cream home box
const LIFT_SCALE = 2.5;
export const TUMBLE_MS = 800;
const LAND_START = ROLL_HERO_MS - 250; // 1750
const LAND_MS = 250;

// cubic-bezier(0.16, 1, 0.3, 1) — the same curve CSS would apply. Solved
// numerically: bisect x(t) for the parameter t, then evaluate y(t).
const bezier = (p1: number, p2: number) => (p: number): number => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const cx = (t: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0, hi = 1, t = p;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (cx(t) < p) lo = t; else hi = t;
  }
  const y1 = 1, y2 = 1; // control-point y values of cubic-bezier(0.16, 1, 0.3, 1)
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
};
const easeOut = bezier(0.16, 0.3);

// Feature detect — SSR-safe. `matchMedia` is not defined during Vitest jsdom
// smoke reads in some environments, so we defensively fall back to `false`.
const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
};

interface Props {
  commit: RollCommitPayload;
  // Rect (page coordinates) of the 80×80 home cell inside the dice box.
  homeRect: DOMRect;
  // Rect of the play area — we translate to its center for the lifted state.
  targetRect: DOMRect;
  // Rect of the overlay's positioning parent, so we can convert to local px.
  parentRect: DOMRect;
  onComplete: () => void;
}

export const RollHeroOverlay: React.FC<Props> = ({
  commit,
  homeRect,
  targetRect,
  parentRect,
  onComplete,
}) => {
  const { attribute, faceIndex, tumbleSeed, startAt } = commit;

  // Home position, in the overlay parent's local coordinate space. Centered
  // on the home cell so lift/scale pivot from its center.
  const homeCenterX = homeRect.left + homeRect.width / 2;
  const homeCenterY = homeRect.top + homeRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  const localLeft = homeCenterX - parentRect.left - HOME_SIZE / 2;
  const localTop = homeCenterY - parentRect.top - HOME_SIZE / 2;
  const dx = targetCenterX - homeCenterX;
  const dy = targetCenterY - homeCenterY;

  const landed = landedComponentsFor(attribute, faceIndex);
  // 2–3 full spins per axis, derived from the seed so every client agrees.
  const spinsX = 2 + (tumbleSeed & 1);
  const spinsY = 2 + ((tumbleSeed >> 1) & 1);
  const spinDirX = ((tumbleSeed >> 2) & 1) ? 1 : -1;
  const spinDirY = ((tumbleSeed >> 3) & 1) ? 1 : -1;
  const initialX = landed.x + spinDirX * spinsX * 360;
  const initialY = landed.y + spinDirY * spinsY * 360;

  // Decide up-front if we should skip the animation entirely. This runs once
  // on mount so React state stays stable across re-renders. Any of:
  //   • the user prefers reduced motion,
  //   • the tumble window has already ended when we mounted (late join /
  //     event arrived after startAt + TUMBLE_MS — threshold stays at the end of
  //     the tumble, not the new total phase length).
  const initialSkip = React.useMemo(() => {
    if (prefersReducedMotion()) return true;
    const elapsed = serverNow() - startAt;
    return elapsed > TUMBLE_MS;
    // Decision is one-shot per commit; recomputing would let a delayed
    // media-query response retroactively unmount mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `skipped` may also flip on tap. Once true it stays true for this commit.
  const [skipped, setSkipped] = useState(initialSkip);
  // Stage flag. When skipped we start already-landing (at home). The
  // phase-length onComplete timer still fires at ROLL_HERO_MS.
  const [landing, setLanding] = useState(initialSkip);
  const [cubeRot, setCubeRot] = useState<{ x: number; y: number }>(
    initialSkip ? { x: landed.x, y: landed.y } : { x: initialX, y: initialY }
  );
  const rafRef = useRef<number | null>(null);

  // rAF loop drives the cube tumble against serverNow(). Kicks off on mount;
  // if the joiner arrived mid-tumble, `elapsed` is already > 0 and we skip
  // straight to the current interpolated frame. When `skipped` is true we
  // never start — the cube is already at its landed rotation.
  useLayoutEffect(() => {
    if (skipped) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const elapsed = serverNow() - startAt;
      const p = Math.max(0, Math.min(1, elapsed / TUMBLE_MS));
      const e = easeOut(p);
      setCubeRot({
        x: initialX + (landed.x - initialX) * e,
        y: initialY + (landed.y - initialY) * e,
      });
      if (elapsed < TUMBLE_MS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Snap to exact landed rotation so downstream frames don't drift.
        setCubeRot({ x: landed.x, y: landed.y });
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Rotation targets are derived from immutable commit fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipped]);

  // Schedule stage transitions off serverNow so late arrivals still land.
  // `onComplete` is ALWAYS scheduled at absolute time startAt + ROLL_HERO_MS
  // — every guard preserves the full phase length so game timing is
  // identical on every client regardless of animation cost.
  useEffect(() => {
    const now = serverNow();
    const elapsed = now - startAt;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (t: number, fn: () => void) => {
      const delay = Math.max(0, t - elapsed);
      timers.push(setTimeout(fn, delay));
    };
    if (!skipped) {
      at(LAND_START, () => setLanding(true));
    }
    at(ROLL_HERO_MS, onComplete);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipped]);

  // Tap-to-skip: jump locally to the landed state. Phase length unchanged —
  // the onComplete scheduled in the effect above still fires at ROLL_HERO_MS.
  const handleSkip = () => {
    if (skipped) return;
    setSkipped(true);
    setLanding(true);
    setCubeRot({ x: landed.x, y: landed.y });
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Outer transform: lifted → home. Only the transform animates, never left/top.
  const outerTransform = landing
    ? "translate(0px, 0px) scale(1)"
    : `translate(${dx}px, ${dy}px) scale(${LIFT_SCALE})`;

  // When we're skipping (reduced-motion, late arrival, or tap), disable all
  // CSS transitions so the jump is instant. Otherwise use the normal bezier
  // land transition.
  const outerTransition = skipped
    ? "none"
    : (landing ? `transform ${LAND_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)` : "none");

  const cubeRotationStr = `rotateX(${cubeRot.x}deg) rotateY(${cubeRot.y}deg)`;

  return (
    <div
      // Deliberately NOT a control. This is the animating die itself, which
      // happens to accept a tap to land early; `tabIndex={-1}` made the old
      // role/aria-label/key handler dead code that only lied to screen
      // readers. Keyboard and reduced-motion users already get the short
      // path (prefers-reduced-motion and late-arrival both auto-skip), so
      // the honest fix is to stop claiming to be a button.
      onClick={handleSkip}
      style={{
        position: "absolute",
        left: localLeft,
        top: localTop,
        width: HOME_SIZE,
        height: HOME_SIZE,
        transform: outerTransform,
        transformOrigin: "50% 50%",
        transition: outerTransition,
        // Tappable: intercept taps to allow skipping. The scrim underneath
        // stays pointer-events:none, so this doesn't fight the header.
        pointerEvents: skipped ? "none" : "auto",
        cursor: skipped ? "default" : "pointer",
        zIndex: 30,
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MatchDie
          size={HOME_SIZE}
          attribute={attribute}
          faceIndex={faceIndex}
          rotation={cubeRotationStr}
        />
      </div>
    </div>
  );
};

export default RollHeroOverlay;
