// The brand-colour chase, shared by the Classic result headline and the
// BrandLoader. One implementation, one cycle order, one set of CSS variables.
//
// The mechanic: every element in the row runs the SAME keyframe cycle
// (`ww-headline-chase` in index.css, colours only, `step-end` so each stop
// snaps on like a marquee bulb). A negative animation delay advances each
// position one stop further along the cycle, which is what makes the colours
// appear to travel through the row.

import { RAW } from "@/lib/tokens";

/** The chase cycle. Four brand stops, in the order they travel. */
export const CHASE = [RAW.warmBlack, RAW.red, RAW.orange, RAW.blue] as const;

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** Custom properties the `.ww-chase-letter` rule reads. */
export const chaseVars = (durationMs: number): React.CSSProperties =>
  ({
    "--ww-chase-1": CHASE[0],
    "--ww-chase-2": CHASE[1],
    "--ww-chase-3": CHASE[2],
    "--ww-chase-4": CHASE[3],
    "--ww-chase-dur": `${durationMs}ms`,
  }) as React.CSSProperties;

/** Negative delay that shifts position `index` one stop further along. */
export const chaseDelay = (index: number, durationMs: number): string =>
  `-${(index * durationMs) / CHASE.length}ms`;

/** The stop a position rests on when motion is reduced (its frame at t=0). */
export const chaseRestColor = (index: number): string => CHASE[index % CHASE.length];
