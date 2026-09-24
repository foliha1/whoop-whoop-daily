import React, { useEffect, useState } from "react";
import { COLORS, RAW, textStyle, type TextRole } from "@/lib/tokens";
import { HEADLINE_CHASE_MS } from "@/lib/animationTiming";

/** The chase cycle. Four brand stops, in the order they travel across the text. */
const CHASE = [COLORS.ink, RAW.red, RAW.orange, RAW.blue] as const;

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * A headline with the brand colours travelling through the letters — the
 * "Great Game!" treatment from the Classic result screen, reusable anywhere a
 * headline should carry the same celebration. Reduced motion rests each letter
 * on its own stop in the cycle instead of animating.
 */
const ChaseHeadline: React.FC<{
  text: string;
  mobile?: boolean;
  role?: TextRole;
}> = ({ text, mobile, role = "resultHero" }) => {
  const reduced = prefersReducedMotion();
  const [paused, setPaused] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  // Pause while the tab is hidden: an off-screen infinite animation is pure
  // wasted work, and resuming from the same stop keeps the cycle coherent.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const chaseVars = {
    "--ww-chase-1": CHASE[0],
    "--ww-chase-2": CHASE[1],
    "--ww-chase-3": CHASE[2],
    "--ww-chase-4": CHASE[3],
    "--ww-chase-dur": `${HEADLINE_CHASE_MS}ms`,
  } as React.CSSProperties;

  return (
    <h2
      aria-label={text}
      style={{
        ...textStyle(role, mobile),
        margin: 0,
        textAlign: "center",
        color: COLORS.ink,
        ...chaseVars,
      }}
    >
      {text.split("").map((ch, i) => {
        // Reduced motion rests on this letter's own stop in the cycle — the
        // frame at t=0 — instead of freezing somewhere between two colours.
        const rest = CHASE[i % CHASE.length];
        return (
          <span
            key={`${ch}-${i}`}
            aria-hidden="true"
            className={reduced ? undefined : "ww-chase-letter"}
            style={{
              color: rest,
              // Negative delay shifts each letter one step further along the
              // cycle, which is what makes the colours appear to travel.
              animationDelay: reduced
                ? undefined
                : `-${(i * HEADLINE_CHASE_MS) / CHASE.length}ms`,
              animationPlayState: paused ? "paused" : "running",
              whiteSpace: ch === " " ? "pre" : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </h2>
  );
};

export default ChaseHeadline;
