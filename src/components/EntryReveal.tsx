import React from "react";
import { ENTRY_STAGGER_DELAYS_MS } from "@/lib/animationTiming";

/**
 * One element of an entry screen's staggered reveal — the same treatment the
 * Daily ready screen uses (`.daily-intro` / `daily-intro-up` in index.css),
 * lifted here so Classic reuses it instead of owning a second copy.
 *
 * Children are always mounted and always occupy their space, so nothing shifts
 * during the reveal. Until `ready` the element simply sits at zero opacity over
 * the cream ground; the animation class is attached once, when `ready` first
 * flips, so it plays a single time per mount and never replays on a state
 * change within the screen. Reduced motion is handled by the CSS rule: the
 * element rests on the final frame, fully visible.
 *
 * Interactivity is never gated: the elements are live the moment they exist.
 */
const EntryReveal: React.FC<{
  /** Position in the stagger, top to bottom. */
  index?: number;
  /** False holds the element invisible (assets/fonts/visibility gate). */
  ready: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ index = 0, ready, style, children }) => {
  const delay =
    ENTRY_STAGGER_DELAYS_MS[Math.min(index, ENTRY_STAGGER_DELAYS_MS.length - 1)];
  return (
    <div
      className={ready ? "daily-intro" : undefined}
      style={{ ...style, ...(ready ? { animationDelay: `${delay}ms` } : { opacity: 0 }) }}
    >
      {children}
    </div>
  );
};

export default EntryReveal;
