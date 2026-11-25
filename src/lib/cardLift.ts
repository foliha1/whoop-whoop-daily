// ============================================================================
// Card lift: one flip angle drives how high a card rises and how its shadow
// falls. Shared by the board card (GameCard) and the win copies
// (MatchGhostCard) so a card looks the same lifting in either place.
//
//   angle 0 / 180  flat on the table: resting shadow, scale 1
//   angle 90       on its edge: card 4% bigger, shadow lower, softer, lighter,
//                  and narrowed to the card's visible width
// ============================================================================

import { useMotionTemplate, useTransform, type MotionValue } from "motion/react";

export const CARD_SHADOW_REST = { y: 4, blur: 4, alpha: 0.25 };
export const CARD_SHADOW_LIFT = { y: 10, blur: 14, alpha: 0.16 };
export const FLIP_LIFT_SCALE = 0.04;
export const CARD_SHADOW_REST_CSS =
  `0px ${CARD_SHADOW_REST.y}px ${CARD_SHADOW_REST.blur}px rgba(0,0,0,${CARD_SHADOW_REST.alpha})`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shadow when a card is pressed into the table: tight, close and dark. */
export const CARD_SHADOW_PRESSED = { y: 1.5, blur: 2, alpha: 0.3 };

/**
 * `boost` (optional) raises or lowers the card on top of the flip: positive
 * for a hover lift, negative for a press. The shadow follows the total; the
 * flip's own scale only follows the flip.
 */
export function useCardLift(flipAngle: MotionValue<number>, boost?: MotionValue<number>) {
  // 0 when flat on the table, 1 when standing on its edge mid-flip.
  const flipLift = useTransform(flipAngle, (a) => Math.abs(Math.sin((a * Math.PI) / 180)));
  const scale = useTransform(flipLift, (l) => 1 + FLIP_LIFT_SCALE * l);
  const shadowScaleX = useTransform(flipAngle, (a) => Math.max(0.04, Math.abs(Math.cos((a * Math.PI) / 180))));
  // Total elevation: -1 pressed flat, 0 resting, 1 fully lifted.
  const lift = useTransform(() =>
    Math.max(-1, Math.min(1, flipLift.get() + (boost ? boost.get() : 0))),
  );
  const pick = (key: "y" | "blur" | "alpha") => (l: number) =>
    l >= 0
      ? lerp(CARD_SHADOW_REST[key], CARD_SHADOW_LIFT[key], l)
      : lerp(CARD_SHADOW_REST[key], CARD_SHADOW_PRESSED[key], -l);
  const y = useTransform(lift, pick("y"));
  const blur = useTransform(lift, pick("blur"));
  const alpha = useTransform(lift, pick("alpha"));
  const shadow = useMotionTemplate`0px ${y}px ${blur}px rgba(0,0,0,${alpha})`;
  return { scale, shadow, shadowScaleX };
}
