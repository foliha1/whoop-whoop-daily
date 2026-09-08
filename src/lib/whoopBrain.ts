// ============================================================================
// whoopBrain — pure, fallible memory model for the solo opponent WHOOP.
//
// Pure functions only. No React, no timers, no side effects. Every function
// takes an explicit rng so tests can stub randomness.
// ============================================================================

import {
  Card,
  Shape,
  Number as CardNumber,
  ColorName,
  SHAPES,
  NUMBERS,
  COLOR_NAMES,
} from "@/cardData";

// Difficulty constants — tuned as a set, and only after the correctness bug in
// the solo claim scheduler was fixed (WHOOP's reaction timer used to be
// destroyed by the next card flip, so measured claim attempts were ~0.06 per
// game and it won 0% of 500 headless games). With the scheduler fixed, the
// reaction band is the dominant knob: measured over 500 headless games against
// a competent probe (5-position memory, 85% call accuracy, ~1.1s reaction),
// 1500-3400ms won 1.8% of games, 1100-2400ms won 3.0%, 800-1800ms won 4.5% and
// 600-1400ms won 33.6% while calling in 97.8% of games. 600-1400 puts WHOOP on
// roughly human reaction footing without perfect memory. CORRUPT_CHANCE stays
// at 0.15 so WHOOP still calls wrong in front of the player — measured 0.63
// mistaken calls per game, at least one in 44.6% of games.
export const DECAY_RATE = 0.97;
export const CORRUPT_CHANCE = 0.15;
export const CONFIDENCE_THRESHOLD = 0.55;
export const REACTION_MIN_MS = 600;
export const REACTION_MAX_MS = 1400;


export interface Memory {
  card: Card;
  confidence: number;
}

export interface Brain {
  entries: Map<number, Memory>;
}

export function createBrain(): Brain {
  return { entries: new Map() };
}

function cardsMatchOnAttribute(a: Card, b: Card, attr: string): boolean {
  switch (attr) {
    case "SHAPE":
      return a.shape === b.shape;
    case "NUMBER":
      return a.number === b.number;
    case "COLOR":
      return a.color === b.color;
    default:
      return false;
  }
}

function cardsMatchRule(a: Card, b: Card, rule: string[]): boolean {
  return rule.every((attr) => cardsMatchOnAttribute(a, b, attr));
}

function pickDifferent<T>(pool: readonly T[], current: T, rng: () => number): T {
  const others = pool.filter((v) => v !== current);
  if (others.length === 0) return current;
  return others[Math.floor(rng() * others.length)];
}

/** Returns the same card with exactly one attribute swapped for a wrong value. */
export function corruptCard(card: Card, rng: () => number = Math.random): Card {
  const attrs = ["shape", "number", "color"] as const;
  const attr = attrs[Math.floor(rng() * attrs.length)];
  let shape: Shape = card.shape;
  let number: CardNumber = card.number;
  let color: ColorName = card.color;
  if (attr === "shape") shape = pickDifferent(SHAPES, card.shape, rng);
  else if (attr === "number") number = pickDifferent(NUMBERS, card.number, rng);
  else color = pickDifferent(COLOR_NAMES, card.color, rng);
  return {
    id: `${shape}-${number}-${color}`,
    shape,
    number,
    color,
    svgPath: `/cards/${number}-${shape}-${color}.svg`,
  };
}

/**
 * Store an observation for a position. Confidence resets to 1.
 * With CORRUPT_CHANCE probability the stored card has one attribute swapped
 * (fallible memory — WHOOP thinks it saw a red square, but it was blue).
 */
export function observe(
  brain: Brain,
  position: number,
  card: Card,
  rng: () => number = Math.random,
): Brain {
  const stored = rng() < CORRUPT_CHANCE ? corruptCard(card, rng) : card;
  const entries = new Map(brain.entries);
  entries.set(position, { card: stored, confidence: 1 });
  return { entries };
}

/** Drop a remembered position (used when the card at that slot changes). */
export function forget(brain: Brain, position: number): Brain {
  if (!brain.entries.has(position)) return brain;
  const entries = new Map(brain.entries);
  entries.delete(position);
  return { entries };
}

/** Multiply every stored confidence by DECAY_RATE. Called once per flip observed. */
export function decay(brain: Brain): Brain {
  const entries = new Map<number, Memory>();
  for (const [k, v] of brain.entries) {
    entries.set(k, { card: v.card, confidence: v.confidence * DECAY_RATE });
  }
  return { entries };
}

/**
 * Find the best pair of remembered positions that match the active rule.
 * Both positions must have confidence > threshold. Returns null when no
 * pair passes the threshold — WHOOP stays quiet.
 */
export function findClaim(
  brain: Brain,
  rule: string[],
  excluded: Set<number> = new Set(),
  threshold: number = CONFIDENCE_THRESHOLD,
): { a: number; b: number; confidence: number } | null {
  const entries = Array.from(brain.entries.entries()).filter(
    ([i, m]) => !excluded.has(i) && m.confidence > threshold,
  );
  let best: { a: number; b: number; confidence: number } | null = null;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ia, ea] = entries[i];
      const [ib, eb] = entries[j];
      if (!cardsMatchRule(ea.card, eb.card, rule)) continue;
      const conf = ea.confidence + eb.confidence;
      if (!best || conf > best.confidence) {
        best = { a: ia, b: ib, confidence: conf };
      }
    }
  }
  return best;
}

/**
 * Choose WHOOP's next flip target: prefer never-seen positions, else the
 * remembered position with the lowest confidence.
 */
export function pickFlipTarget(
  brain: Brain,
  candidates: number[],
  rng: () => number = Math.random,
): number | null {
  if (candidates.length === 0) return null;
  const unseen = candidates.filter((i) => !brain.entries.has(i));
  if (unseen.length > 0) return unseen[Math.floor(rng() * unseen.length)];
  let best = candidates[0];
  let bestConf = Infinity;
  for (const i of candidates) {
    const m = brain.entries.get(i);
    const c = m ? m.confidence : 0;
    if (c < bestConf) {
      bestConf = c;
      best = i;
    }
  }
  return best;
}

/** Random reaction delay before WHOOP fires a claim. */
export function pickReactionDelay(rng: () => number = Math.random): number {
  return REACTION_MIN_MS + rng() * (REACTION_MAX_MS - REACTION_MIN_MS);
}
