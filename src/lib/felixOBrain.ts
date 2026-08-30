// ============================================================================
// felixOBrain — pure, fallible memory model for solo play's Felix O.
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

export const DECAY_RATE = 0.97;
export const CORRUPT_CHANCE = 0.16;
export const CONFIDENCE_THRESHOLD = 0.55;
export const REACTION_MIN_MS = 2500;
export const REACTION_MAX_MS = 5500;

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
 * (fallible memory — Felix thinks he saw a red square, but it was blue).
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
 * pair passes the threshold — Felix stays quiet.
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
 * Choose Felix's next flip target: prefer never-seen positions, else the
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

/** Random reaction delay before Felix fires a claim. */
export function pickReactionDelay(rng: () => number = Math.random): number {
  return REACTION_MIN_MS + rng() * (REACTION_MAX_MS - REACTION_MIN_MS);
}
