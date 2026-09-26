import { cardArt } from "@/lib/assetUrls";
import { Card, Shape, Number as CardNumber, ColorName, SHAPES, NUMBERS, COLOR_NAMES } from "@/cardData";

interface MemoryEntry {
  card: Card;
  strength: number;
}

function cardsMatchOnAttribute(a: Card, b: Card, attr: string): boolean {
  switch (attr) {
    case "SHAPE": return a.shape === b.shape;
    case "NUMBER": return a.number === b.number;
    case "COLOR": return a.color === b.color;
    default: return false;
  }
}

function cardsMatchRule(a: Card, b: Card, rule: string[]): boolean {
  return rule.every((attr) => cardsMatchOnAttribute(a, b, attr));
}

function pickDifferent<T>(pool: readonly T[], current: T): T {
  const others = pool.filter((v) => v !== current);
  if (others.length === 0) return current;
  return others[Math.floor(Math.random() * others.length)];
}

function corruptCard(card: Card): Card {
  const attrs = ["shape", "number", "color"] as const;
  const attr = attrs[Math.floor(Math.random() * attrs.length)];
  let shape: Shape = card.shape;
  let number: CardNumber = card.number;
  let color: ColorName = card.color;
  if (attr === "shape") shape = pickDifferent(SHAPES, card.shape);
  else if (attr === "number") number = pickDifferent(NUMBERS, card.number);
  else color = pickDifferent(COLOR_NAMES, card.color);
  const id = `${shape}-${number}-${color}`;
  const svgPath = cardArt(`${number}-${shape}-${color}`);
  return { id, shape, number, color, svgPath };
}

export interface OpponentMemory {
  observe(index: number, card: Card): void;
  forget(index: number): void;
  decayAll(): void;
  recall(index: number): MemoryEntry | null;
  bestPair(
    rule: string[],
    excluded: Set<number>
  ): { a: number; b: number; confidence: number } | null;
  reset(): void;
}

export function createOpponentMemory(): OpponentMemory {
  let store = new Map<number, MemoryEntry>();

  return {
    observe(index, card) {
      store.set(index, { card, strength: 1.0 });
    },
    forget(index) {
      store.delete(index);
    },
    decayAll() {
      for (const [idx, entry] of Array.from(store.entries())) {
        const newStrength = entry.strength * 0.85;
        if (newStrength < 0.15) {
          store.delete(idx);
          continue;
        }
        let card = entry.card;
        if (newStrength < 0.5 && Math.random() < 0.16) {
          card = corruptCard(card);
        }
        store.set(idx, { card, strength: newStrength });
      }
    },
    recall(index) {
      return store.get(index) ?? null;
    },
    bestPair(rule, excluded) {
      const entries = Array.from(store.entries()).filter(
        ([idx]) => !excluded.has(idx)
      );
      let best: { a: number; b: number; confidence: number } | null = null;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [ia, ea] = entries[i];
          const [ib, eb] = entries[j];
          if (!cardsMatchRule(ea.card, eb.card, rule)) continue;
          const confidence = ea.strength + eb.strength;
          if (!best || confidence > best.confidence) {
            best = { a: ia, b: ib, confidence };
          }
        }
      }
      return best;
    },
    reset() {
      store = new Map();
    },
  };
}

