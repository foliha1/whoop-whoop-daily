import { describe, it, expect } from "vitest";
import {
  createBrain,
  observe,
  decay,
  corruptCard,
  findClaim,
  pickFlipTarget,
  DECAY_RATE,
  CONFIDENCE_THRESHOLD,
} from "@/lib/felixOBrain";
import type { Card } from "@/cardData";

function card(shape: Card["shape"], number: Card["number"], color: Card["color"]): Card {
  return {
    id: `${shape}-${number}-${color}`,
    shape, number, color,
    svgPath: `/cards/${number}-${shape}-${color}.svg`,
  };
}

// Deterministic RNG: cycles through the given values.
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("felixOBrain", () => {
  it("observe stores a card with full confidence when no corruption fires", () => {
    // First rng call: 0.9 (>= CORRUPT_CHANCE 0.16, so no corruption).
    const rng = seq([0.9]);
    const b = observe(createBrain(), 3, card("circle", 1, "red"), rng);
    const m = b.entries.get(3);
    expect(m?.card.id).toBe("circle-1-red");
    expect(m?.confidence).toBe(1);
  });

  it("decay multiplies every confidence by DECAY_RATE each flip observed", () => {
    let b = observe(createBrain(), 0, card("circle", 1, "red"), seq([0.9]));
    b = observe(b, 1, card("square", 2, "blue"), seq([0.9]));
    b = decay(b);
    expect(b.entries.get(0)?.confidence).toBeCloseTo(DECAY_RATE, 6);
    expect(b.entries.get(1)?.confidence).toBeCloseTo(DECAY_RATE, 6);
    b = decay(b);
    expect(b.entries.get(0)?.confidence).toBeCloseTo(DECAY_RATE * DECAY_RATE, 6);
  });

  it("corruptCard swaps exactly one attribute; result differs but is well-formed", () => {
    const original = card("circle", 1, "red");
    // Force attr=shape (index 0) then pick-different index 0 out of remaining 3.
    const rng = seq([0.0, 0.0]);
    const corrupted = corruptCard(original, rng);
    expect(corrupted.id).not.toBe(original.id);
    // Exactly one of the three attributes differs.
    const diffs =
      Number(corrupted.shape !== original.shape) +
      Number(corrupted.number !== original.number) +
      Number(corrupted.color !== original.color);
    expect(diffs).toBe(1);
    // svgPath consistent with attrs.
    expect(corrupted.svgPath).toBe(`/cards/${corrupted.number}-${corrupted.shape}-${corrupted.color}.svg`);
  });

  it("findClaim returns null when both remembered cards are below the confidence threshold", () => {
    let b = observe(createBrain(), 0, card("circle", 1, "red"), seq([0.9]));
    b = observe(b, 1, card("circle", 2, "blue"), seq([0.9]));
    // Decay per flip observed. 0.97^n < 0.55 when n >= 20 (0.97^20 ≈ 0.5438).
    for (let i = 0; i < 20; i++) b = decay(b);
    const claim = findClaim(b, ["SHAPE"]);
    expect(b.entries.get(0)!.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(claim).toBeNull();
  });

  it("findClaim returns a matching pair when both are above the threshold", () => {
    let b = observe(createBrain(), 0, card("circle", 1, "red"), seq([0.9]));
    b = observe(b, 2, card("circle", 3, "blue"), seq([0.9]));
    b = observe(b, 5, card("square", 4, "yellow"), seq([0.9]));
    const claim = findClaim(b, ["SHAPE"]);
    expect(claim).not.toBeNull();
    expect(new Set([claim!.a, claim!.b])).toEqual(new Set([0, 2]));
  });

  it("pickFlipTarget prefers unseen positions", () => {
    const b = observe(createBrain(), 0, card("circle", 1, "red"), seq([0.9]));
    const pick = pickFlipTarget(b, [0, 1, 2], seq([0.0]));
    expect([1, 2]).toContain(pick);
  });

  it("pickFlipTarget falls back to lowest-confidence when all positions are known", () => {
    let b = observe(createBrain(), 0, card("circle", 1, "red"), seq([0.9]));
    b = observe(b, 1, card("square", 2, "blue"), seq([0.9]));
    b = decay(b); // both -> 0.85
    // Overwrite position 1 with a fresh observation → 1.0
    b = observe(b, 1, card("star", 3, "yellow"), seq([0.9]));
    const pick = pickFlipTarget(b, [0, 1]);
    expect(pick).toBe(0); // lower confidence wins
  });
});
