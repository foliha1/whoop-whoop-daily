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

export function useCardLift(flipAngle: MotionValue<number>) {
  // 0 when flat on the table, 1 when standing on its edge mid-flip.
  const lift = useTransform(flipAngle, (a) => Math.abs(Math.sin((a * Math.PI) / 180)));
  const scale = useTransform(lift, (l) => 1 + FLIP_LIFT_SCALE * l);
  const shadowScaleX = useTransform(flipAngle, (a) => Math.max(0.04, Math.abs(Math.cos((a * Math.PI) / 180))));
  const y = useTransform(lift, (l) => lerp(CARD_SHADOW_REST.y, CARD_SHADOW_LIFT.y, l));
  const blur = useTransform(lift, (l) => lerp(CARD_SHADOW_REST.blur, CARD_SHADOW_LIFT.blur, l));
  const alpha = useTransform(lift, (l) => lerp(CARD_SHADOW_REST.alpha, CARD_SHADOW_LIFT.alpha, l));
  const shadow = useMotionTemplate`0px ${y}px ${blur}px rgba(0,0,0,${alpha})`;
  return { scale, shadow, shadowScaleX };
}
