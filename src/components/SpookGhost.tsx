// ============================================================================
// Spook Spook — the floating ghost. Purely decorative: a fixed full-viewport
// layer with one ghost that rises from below the bottom edge to above the top
// edge every ~12s (about 7s up, then a ~5s rest), swaying side to side with a
// gentle tilt as it goes. It never renders with the skin off, under reduced
// motion, while the tab is hidden, or while a Daily run or a live Solo or
// Together game is in progress (setSpookGhostPaused) — it must never float
// over cards a player is trying to remember, so a pause makes it fade out
// promptly where it is rather than finishing its trip.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { SPOOK_AT_LOAD } from "@/lib/skin";
import ghostUrl from "../assets/spook/ghost.svg?url";

let paused = false;
const listeners = new Set<() => void>();

/**
 * Pause (or resume) the ghost. A pause fades the ghost out where it is and
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

/** Keep in sync with the ww-spook-ghost-fade keyframes duration. */
const FADE_MS = 450;

const SpookGhostInner: React.FC = () => {
  const [visible, setVisible] = useState(() => !isDormant());
  const [fading, setFading] = useState(false);
  const [startX, setStartX] = useState(randomStartX);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearFadeTimer = () => {
      if (fadeTimer.current !== null) {
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
    };
    const sync = () => {
      if (isDormant()) {
        // Duck out promptly: a short fade, then unmount. The fallback timer
        // covers engines that never fire animationend (and hidden tabs).
        setFading((was) => {
          if (!was && fadeTimer.current === null) {
            fadeTimer.current = window.setTimeout(() => setVisible(false), FADE_MS + 100);
          }
          return true;
        });
      } else {
        // Waking starts a fresh trip from below.
        clearFadeTimer();
        setStartX(randomStartX());
        setFading(false);
        setVisible(true);
      }
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
      clearFadeTimer();
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
      onAnimationEnd={(e) => {
        if (e.animationName === "ww-spook-ghost-fade") setVisible(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 30,
        animation: fading ? `ww-spook-ghost-fade ${FADE_MS}ms ease forwards` : undefined,
      }}
    >
      <div
        onAnimationIteration={(e) => {
          if (e.animationName !== "ww-spook-ghost-rise") return;
          // The trip just ended fully out of frame: pick the next trip's
          // horizontal position.
          setStartX(randomStartX());
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
