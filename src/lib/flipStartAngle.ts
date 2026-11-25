import { cubicBezier } from "motion";
import { CARD_FLIP_MS } from "@/lib/animationTiming";

const ease = cubicBezier(0.4, 0, 0.2, 1);

/**
 * Where a card mid-flip currently sits, so a match ghost copy can continue
 * the flip instead of snapping face up. Returns null once the flip is done
 * (or no reveal time is known): the copy then starts face up.
 */
export const flipStartAngle = (elapsedMs: number | undefined): number | null => {
  if (elapsedMs == null || elapsedMs < 0 || elapsedMs >= CARD_FLIP_MS) return null;
  return 180 * (1 - ease(elapsedMs / CARD_FLIP_MS));
};
