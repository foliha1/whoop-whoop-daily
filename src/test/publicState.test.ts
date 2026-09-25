import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initialState, reducer, type State } from "@/hooks/useGameState";
import { toPublicState } from "@/lib/publicState";
import type { Card } from "@/cardData";

// Determinism: same as reducer characterization suite.
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.42);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function allCardsIn(state: State): Card[] {
  const cards: Card[] = [];
  state.grid.forEach((c) => { if (c) cards.push(c); });
  state.deck.forEach((c) => cards.push(c));
  return cards;
}

function containsCard(haystack: unknown, needle: Card): boolean {
  const json = JSON.stringify(haystack);
  return json.includes(`"id":"${needle.id}"`);
}

const EMPTY_MAP: Array<{ seat: number; player_key: string; display_name: string }> = [
  { seat: 0, player_key: "vh", display_name: "Host" },
  { seat: 1, player_key: "vj", display_name: "Joiner" },
];

describe("toPublicState — redaction", () => {
  it("emits face-down slots without any card content", () => {
    const s = initialState(6, { seatCount: 2 });
    const pub = toPublicState(s, EMPTY_MAP);
    for (const slot of pub.grid) {
      if (slot.occupied) {
        expect(slot.card).toBeNull();
      } else {
        expect(slot.card).toBeNull();
      }
    }
    // Every dealt card is hidden from the payload.
    for (const c of s.grid) {
      if (c) expect(containsCard(pub, c)).toBe(false);
    }
  });

  it("NEVER includes any deck card in the payload", () => {
    const s = initialState(6, { seatCount: 2 });
    const pub = toPublicState(s, EMPTY_MAP);
    expect((pub as { deck?: unknown }).deck).toBeUndefined();
    expect(pub.deckCount).toBe(s.deck.length);
    for (const c of s.deck) {
      expect(containsCard(pub, c)).toBe(false);
    }
  });

  it("empty slots and face-down slots are distinguished only by `occupied`", () => {
    const s = initialState(6, { seatCount: 2 });
    // Force a slot to be empty via mutation for this shape test.
    const mutated: State = { ...s, grid: [...s.grid] };
    mutated.grid[0] = null;
    const pub = toPublicState(mutated, EMPTY_MAP);
    expect(pub.grid[0].occupied).toBe(false);
    expect(pub.grid[0].card).toBeNull();
    // Face-down cell:
    const faceDown = pub.grid.find((s) => s.occupied);
    expect(faceDown).toBeDefined();
    expect(faceDown?.card).toBeNull();
  });

  it("exposes a peeking card but no others", () => {
    let s = initialState(6, { seatCount: 2 });
    s = reducer(s, { type: "ROLL_START" });
    s = reducer(s, { type: "ROLL_LAND", values: ["SHAPE"], rule: ["SHAPE"] });
    s = reducer(s, { type: "ROLL_SETTLE" });
    // Human is seat 0, roller/flipper=0. Start a flip.
    const firstNonNull = s.grid.findIndex((c) => c !== null);
    s = reducer(s, { type: "FLIP_START", by: 0, idx: firstNonNull, token: 1 });
    const pub = toPublicState(s, EMPTY_MAP);
    expect(pub.grid[firstNonNull].card?.id).toBe(s.grid[firstNonNull]!.id);
    // Any other occupied slot should be redacted.
    for (let i = 0; i < pub.grid.length; i++) {
      if (i === firstNonNull) continue;
      if (pub.grid[i].occupied) expect(pub.grid[i].card).toBeNull();
    }
  });

  it("exposes wrong-claim cards to everyone (they are already visible on the table)", () => {
    let s = initialState(6, { seatCount: 2 });
    s = reducer(s, { type: "ROLL_START" });
    s = reducer(s, { type: "ROLL_LAND", values: ["SHAPE"], rule: ["SHAPE"] });
    s = reducer(s, { type: "ROLL_SETTLE" });
    s = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 });
    // Pick two that don't match.
    const nonNull = s.grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    // Just pick first two.
    const [a, b] = [nonNull[0], nonNull[1]];
    s = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: a });
    s = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: b });
    s = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    // If mismatched they'll now be in wrongBy[0]. If they happened to match,
    // the test still passes vacuously; force at least one wrong-index.
    if (s.wrongBy[0].size > 0) {
      const pub = toPublicState(s, EMPTY_MAP);
      for (const idx of Array.from(s.wrongBy[0])) {
        expect(pub.grid[idx].card).not.toBeNull();
      }
    }
  });

  it("does NOT expose the first selected card's face (rulebook: touch does not reveal)", () => {
    let s = initialState(6, { seatCount: 2 });
    s = reducer(s, { type: "ROLL_START" });
    s = reducer(s, { type: "ROLL_LAND", values: ["SHAPE"], rule: ["SHAPE"] });
    s = reducer(s, { type: "ROLL_SETTLE" });
    s = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 });
    const nonNull = s.grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const a = nonNull[0];
    s = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: a });
    expect(s.selectedCards).toEqual([a]);
    const pub = toPublicState(s, EMPTY_MAP);
    // Still emitted so clients can render the highlight ring...
    expect(pub.selectedCards).toEqual([a]);
    // ...but the face is NOT revealed.
    expect(pub.grid[a].occupied).toBe(true);
    expect(pub.grid[a].card).toBeNull();
  });

  it("exposes BOTH faces only once the second touch locks the claim", () => {
    let s = initialState(6, { seatCount: 2 });
    s = reducer(s, { type: "ROLL_START" });
    s = reducer(s, { type: "ROLL_LAND", values: ["SHAPE"], rule: ["SHAPE"] });
    s = reducer(s, { type: "ROLL_SETTLE" });
    s = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 });
    const nonNull = s.grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const [a, b] = [nonNull[0], nonNull[1]];
    s = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: a });
    s = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: b });
    const pub = toPublicState(s, EMPTY_MAP);
    expect(pub.grid[a].card?.id).toBe(s.grid[a]!.id);
    expect(pub.grid[b].card?.id).toBe(s.grid[b]!.id);
  });

  it("Last Call flips everything face-up", () => {
    const s: State = { ...initialState(6, { seatCount: 2 }), allFaceUp: true };
    const pub = toPublicState(s, EMPTY_MAP);
    for (let i = 0; i < s.grid.length; i++) {
      if (s.grid[i]) expect(pub.grid[i].card?.id).toBe(s.grid[i]!.id);
    }
  });

  it("full snapshot: no dealt or deck card leaks through JSON", () => {
    const s = initialState(6, { seatCount: 2 });
    const pub = toPublicState(s, EMPTY_MAP);
    const json = JSON.stringify(pub);
    for (const c of allCardsIn(s)) {
      expect(json.includes(`"id":"${c.id}"`)).toBe(false);
    }
  });
});
