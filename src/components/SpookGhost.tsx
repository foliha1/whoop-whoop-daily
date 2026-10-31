// ============================================================================
// Spook Spook — the floating ghost. Purely decorative: a fixed full-viewport
// layer with one ghost that rises from below the bottom edge to above the top
// edge every ~12s (about 7s up, then a ~5s rest), swaying side to side with a
// gentle tilt as it goes. It never renders with the skin off, under reduced
// motion, while the tab is hidden, or while a Daily run or a live Solo or
// Together game is in progress (setSpookGhostPaused) — it must never float
// over cards a player is trying to remember.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { SPOOK_AT_LOAD } from "@/lib/skin";
import ghostUrl from "../assets/spook/ghost.svg?url";

let paused = false;
const listeners = new Set<() => void>();

/**
 * Pause (or resume) the ghost. A pause lets the current trip finish and then
 * stops new trips from starting; resuming starts a fresh trip from below.
 */
export function setSpookGhostPaused(on: boolean): void {
  if (paused === on) return;
  paused = on;
  listeners.forEach((fn) => fn());
}

const isReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const isDormant = (): boolean => {
  try {
    return paused || document.hidden || isReducedMotion();
  } catch {
    return paused;
  }
};

/** Each trip starts from a random horizontal position, 15%–85% of the width. */
const randomStartX = (): number => 15 + Math.random() * 70;

const SpookGhostInner: React.FC = () => {
  const [visible, setVisible] = useState(() => !isDormant());
  const [startX, setStartX] = useState(randomStartX);
  const dormantRef = useRef(isDormant());

  useEffect(() => {
    const sync = () => {
      const dormant = isDormant();
      dormantRef.current = dormant;
      // Waking starts a new trip from below. Falling dormant mid-trip is
      // handled at the iteration boundary, so the current trip finishes.
      if (!dormant) setVisible(true);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    listeners.add(sync);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", sync);
    } catch {
      /* older engines: the render-time check still applies */
    }
    return () => {
      document.removeEventListener("visibilitychange", sync);
      listeners.delete(sync);
      mq?.removeEventListener("change", sync);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="spook-ghost"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      <div
        onAnimationIteration={(e) => {
          if (e.animationName !== "ww-spook-ghost-rise") return;
          // The trip just ended fully out of frame: pick the next trip's
          // horizontal position, and if the ghost has gone dormant, unmount
          // here instead of starting again.
          setStartX(randomStartX());
          if (dormantRef.current) setVisible(false);
        }}
        style={{
          position: "absolute",
          top: 0,
          left: `${startX}%`,
          width: "clamp(44px, 12vw, 72px)",
          animation: "ww-spook-ghost-rise 12s linear infinite",
          willChange: "transform",
        }}
      >
        <img
          src={ghostUrl}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            animation: "ww-spook-ghost-sway 12s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
};

const SpookGhost: React.FC = () => {
  // SPOOK_AT_LOAD is frozen for the session, so this early return is stable.
  if (!SPOOK_AT_LOAD) return null;
  return <SpookGhostInner />;
};

export default SpookGhost;
