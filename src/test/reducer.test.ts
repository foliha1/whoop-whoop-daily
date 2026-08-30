import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reducer,
  initialState,
  type State,
  type Action,
  type Phase,
} from "@/hooks/useGameState";
import { ALL_CARDS, Card } from "@/cardData";

// ---------------------------------------------------------------------------
// Determinism: stub Math.random so initialState (deck shuffle + die roll) and
// cycleAdvance are deterministic. No production
// code changes are required for this.
// ---------------------------------------------------------------------------
let randSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  randSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Test helpers — build fully-controlled states without going through
// initialState (which owns randomness we want out of these unit tests).
// ---------------------------------------------------------------------------
function card(shape: string, number: number, color: string): Card {
  const id = `${shape}-${number}-${color}`;
  const c = ALL_CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`no such card: ${id}`);
  return c;
}

// Two cards that share SHAPE only.
const SHAPE_MATCH_A = card("circle", 1, "red");
const SHAPE_MATCH_B = card("circle", 2, "blue");
// Two cards that share nothing with the above (different shape/number/color).
const UNRELATED_A = card("square", 3, "yellow");
const UNRELATED_B = card("tri", 4, "blue");
const UNRELATED_C = card("star", 3, "red");
const UNRELATED_D = card("star", 4, "yellow");

function baseState(overrides: Partial<State> = {}): State {
  const grid: (Card | null)[] = [
    SHAPE_MATCH_A, // 0
    UNRELATED_A,   // 1
    SHAPE_MATCH_B, // 2
    UNRELATED_B,   // 3
    UNRELATED_C,   // 4
    UNRELATED_D,   // 5
  ];
  const seatCount = overrides.seatCount ?? 2;
  return {
    phase: "FLIPPING",
    slotCount: 6,
    seatCount,
    names: Array.from({ length: seatCount }, (_, i) => ["you", "opponent"][i] ?? `p${i}`),
    roller: 0,
    flipper: 0,
    grid,
    deck: [card("square", 1, "blue"), card("square", 2, "red")],
    scores: Array(seatCount).fill(0),
    rule: ["SHAPE"],
    dieValues: ["SHAPE"],
    wrongBy: Array.from({ length: seatCount }, () => new Set<number>()),
    piles: Array.from({ length: seatCount }, () => [] as Card[]),
    disconnected: Array(seatCount).fill(false),
    flippedThisCycle: new Set<number>(),
    // v6.7: a turn is two flips. Tests default to "one flip already taken",
    // so a single FLIP_COMPLETE completes the turn and advances the rotation.
    flipsThisTurn: 1,
    claimedThisCycle: false,
    drawEmpty: false,
    roundNum: 1,
    roundsSinceClaim: 0,
    allFaceUp: false,
    selectedCards: [],
    matchedCards: new Set<number>(),
    peekingCard: null,
    rolling: false,
    message: "",
    messageType: "info",
    inFlight: null,
    claimBy: 0,
    settleKind: null,
    settleToken: 0,
    settleBy: null,
    seed: null,
    rng: Math.random,
    wrongCalls: 0,

    ...overrides,
  };
}

// ===========================================================================
// INIT
// ===========================================================================
describe("INIT", () => {
  it("returns a fresh initialState for the given slotCount", () => {
    const s = baseState({ scores: [7, 3], roundNum: 42 });
    const next = reducer(s, { type: "INIT", slotCount: 6 });
    expect(next.slotCount).toBe(6);
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.scores).toEqual([0, 0]);
    expect(next.roundNum).toBe(1);
    expect(next.grid).toHaveLength(6);
  });

  it("is not phase-guarded (works from GAME_OVER)", () => {
    const s = baseState({ phase: "GAME_OVER" });
    const next = reducer(s, { type: "INIT", slotCount: 6 });
    expect(next.phase).toBe("AWAITING_ROLL");
  });
});

// ===========================================================================
// ROLL_START
// ===========================================================================
describe("ROLL_START", () => {
  it("sets rolling=true when in AWAITING_ROLL", () => {
    const s = baseState({ phase: "AWAITING_ROLL" });
    const next = reducer(s, { type: "ROLL_START" });
    expect(next.rolling).toBe(true);
  });

  it("is a NO-OP outside AWAITING_ROLL", () => {
    for (const phase of ["FLIPPING", "CLAIM_SELECTING", "CLAIM_RESOLVING", "GAME_OVER"] as Phase[]) {
      const s = baseState({ phase });
      expect(reducer(s, { type: "ROLL_START" })).toBe(s);
    }
  });
});

// ===========================================================================
// TUMBLE
// ===========================================================================
describe("TUMBLE", () => {
  it("updates dieValues while rolling", () => {
    const s = baseState({ phase: "AWAITING_ROLL", rolling: true, dieValues: ["SHAPE"] });
    const next = reducer(s, { type: "TUMBLE", values: ["COLOR"] });
    expect(next.dieValues).toEqual(["COLOR"]);
  });

  it("is a NO-OP when not rolling", () => {
    const s = baseState({ rolling: false });
    expect(reducer(s, { type: "TUMBLE", values: ["COLOR"] })).toBe(s);
  });
});

// ===========================================================================
// ROLL_LAND
// ===========================================================================
describe("ROLL_LAND", () => {
  it("sets dieValues and rule while rolling", () => {
    const s = baseState({ phase: "AWAITING_ROLL", rolling: true });
    const next = reducer(s, { type: "ROLL_LAND", values: ["COLOR"], rule: ["COLOR"] });
    expect(next.dieValues).toEqual(["COLOR"]);
    expect(next.rule).toEqual(["COLOR"]);
    expect(next.rolling).toBe(true); // rolling stays true until ROLL_SETTLE
  });

  it("is a NO-OP when not rolling", () => {
    const s = baseState({ rolling: false });
    expect(reducer(s, { type: "ROLL_LAND", values: ["COLOR"], rule: ["COLOR"] })).toBe(s);
  });
});

// ===========================================================================
// ROLL_SETTLE
// ===========================================================================
describe("ROLL_SETTLE", () => {
  it("clears rolling and enters FLIPPING with flipper=roller", () => {
    const s = baseState({ phase: "AWAITING_ROLL", rolling: true, roller: 1, flipper: 0 });
    const next = reducer(s, { type: "ROLL_SETTLE" });
    expect(next.rolling).toBe(false);
    expect(next.phase).toBe("FLIPPING");
    expect(next.flipper).toBe(1);
  });

  it("is a NO-OP when not rolling", () => {
    const s = baseState({ rolling: false });
    expect(reducer(s, { type: "ROLL_SETTLE" })).toBe(s);
  });
});

// ===========================================================================
// FLIP_START
// ===========================================================================
describe("FLIP_START", () => {
  it("sets inFlight and peekingCard on the current flipper's flip", () => {
    const s = baseState({ phase: "FLIPPING", flipper: 0 });
    const next = reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 });
    expect(next.inFlight).toMatchObject({ kind: "flip", token: 1, by: 0, idx: 0 });
    expect(next.peekingCard).toBe(0);
  });

  it("is a NO-OP outside FLIPPING", () => {
    const s = baseState({ phase: "AWAITING_ROLL" });
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 })).toBe(s);
  });

  it("is a NO-OP when by !== flipper", () => {
    const s = baseState({ phase: "FLIPPING", flipper: 0 });
    expect(reducer(s, { type: "FLIP_START", by: 1, idx: 0, token: 1 })).toBe(s);
  });

  it("is a NO-OP when another action is inFlight", () => {
    const s = baseState({
      phase: "FLIPPING",
      inFlight: { kind: "flip", token: 9, by: 0, idx: 1 },
    });
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 2, token: 10 })).toBe(s);
  });

  it("is a NO-OP when the idx is in the flipper's wrongBy set", () => {
    const s = baseState({
      phase: "FLIPPING",
      wrongBy: [new Set([0]), new Set()],
    });
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 })).toBe(s);
  });

  it("is a NO-OP when the target slot is null", () => {
    const grid = baseState().grid.slice();
    grid[0] = null;
    const s = baseState({ grid });
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 })).toBe(s);
  });
});

// ===========================================================================
// FLIP_COMPLETE
// ===========================================================================
describe("FLIP_COMPLETE", () => {
  it("consumes the current-token flip and advances the cycle", () => {
    const s = baseState({
      phase: "FLIPPING",
      flipper: 0,
      inFlight: { kind: "flip", token: 5, by: 0, idx: 0 },
      peekingCard: 0,
    });
    const next = reducer(s, { type: "FLIP_COMPLETE", token: 5 });
    // Cycle not complete after one flip (2-player game) → flipper rotates.
    expect(next.flipper).toBe(1);
    expect(next.inFlight).toBeNull();
    expect(next.peekingCard).toBeNull();
    expect(next.flippedThisCycle.has(0)).toBe(true);
  });

  it("STALE-TOKEN rejection: ignores completions whose token doesn't match", () => {
    const s = baseState({
      phase: "FLIPPING",
      inFlight: { kind: "flip", token: 5, by: 0, idx: 0 },
      peekingCard: 0,
    });
    expect(reducer(s, { type: "FLIP_COMPLETE", token: 4 })).toBe(s);
    expect(reducer(s, { type: "FLIP_COMPLETE", token: 6 })).toBe(s);
  });

  it("is a NO-OP when inFlight is not a flip", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 5, by: 1, a: 0, b: 2 },
    });
    expect(reducer(s, { type: "FLIP_COMPLETE", token: 5 })).toBe(s);
  });
});

// ===========================================================================
// PLAYER_ENTER_CLAIM
// ===========================================================================
describe("PLAYER_ENTER_CLAIM", () => {
  it("enters CLAIM_SELECTING from FLIPPING without spending a flip", () => {
    const s = baseState({
      phase: "FLIPPING",
      flipper: 0,
      inFlight: { kind: "flip", token: 5, by: 0, idx: 3 },
      peekingCard: 3,
    });
    const next = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 });
    expect(next.phase).toBe("CLAIM_SELECTING");
    // v6.7: claiming never consumes a turn.
    expect(next.flippedThisCycle.has(0)).toBe(false);
    expect(next.flipsThisTurn).toBe(s.flipsThisTurn);
    expect(next.inFlight).toBeNull();
    expect(next.peekingCard).toBeNull();
    expect(next.selectedCards).toEqual([]);
  });

  it("leaves flippedThisCycle untouched when no flip is in flight", () => {
    const s = baseState({ phase: "FLIPPING", flipper: 0 });
    const next = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 });
    expect(next.flippedThisCycle.has(0)).toBe(false);
  });

  it("is a NO-OP outside FLIPPING", () => {
    const s = baseState({ phase: "AWAITING_ROLL" });
    expect(reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 })).toBe(s);
  });
});


// ===========================================================================
// PLAYER_SELECT_CARD
// ===========================================================================
describe("PLAYER_SELECT_CARD", () => {
  it("appends the index to selectedCards", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", selectedCards: [] });
    const next = reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 2 });
    expect(next.selectedCards).toEqual([2]);
  });

  it("is a NO-OP outside CLAIM_SELECTING", () => {
    const s = baseState({ phase: "FLIPPING" });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 2 })).toBe(s);
  });

  it("is a NO-OP for a card in the human's wrongBy set", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      wrongBy: [new Set([2]), new Set()],
    });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 2 })).toBe(s);
  });

  it("is a NO-OP for a duplicate selection", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", selectedCards: [2] });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 2 })).toBe(s);
  });

  it("is a NO-OP for a null grid slot", () => {
    const grid = baseState().grid.slice();
    grid[2] = null;
    const s = baseState({ phase: "CLAIM_SELECTING", grid });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 2 })).toBe(s);
  });

  it("is a NO-OP once two cards are already selected", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", selectedCards: [0, 1] });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 3 })).toBe(s);
  });
});

// ===========================================================================
// PLAYER_RESOLVE_MATCH
// ===========================================================================
describe("PLAYER_RESOLVE_MATCH", () => {
  it("correct match: +2 points, holds in SETTLING, then refills and winner rolls", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [0, 2], // SHAPE_MATCH_A + SHAPE_MATCH_B share SHAPE
      rule: ["SHAPE"],
      roller: 1, // opponent rolled — should switch to human on correct claim
      flipper: 1,
      roundNum: 3,
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    // Score lands immediately; the board holds while the animation plays.
    expect(settling.scores).toEqual([2, 0]);
    expect(settling.phase).toBe("SETTLING");
    expect(settling.settleKind).toBe("MATCH");
    expect(Array.from(settling.matchedCards).sort()).toEqual([0, 2]);
    // Grid untouched — the matched pair stays in place, face-up.
    expect(settling.grid[0]).toBe(s.grid[0]);
    expect(settling.grid[2]).toBe(s.grid[2]);
    expect(settling.roundNum).toBe(3);

    const next = reducer(settling, {
      type: "SETTLE_COMPLETE",
      token: settling.settleToken,
    });
    expect(next.phase).toBe("AWAITING_ROLL");
    // Winner rolls
    expect(next.roller).toBe(0);
    expect(next.flipper).toBe(0);
    expect(next.roundNum).toBe(4);
    expect(next.matchedCards.size).toBe(0);
    // Refilled from deck (base deck had 2 cards, so slot 0 & 2 now non-null)
    expect(next.grid[0]).not.toBeNull();
    expect(next.grid[2]).not.toBeNull();
    expect(next.grid[0]).not.toBe(s.grid[0]);
  });

  it("wrong match: no score, adds both to human's wrongBy, FLIPPING only after SETTLE_COMPLETE", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [1, 3], // unrelated cards, no shared SHAPE
      rule: ["SHAPE"],
      flipper: 0,
      flippedThisCycle: new Set([0]), // human already recorded their flip
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    expect(settling.scores).toEqual([0, 0]);
    expect(settling.wrongBy[0].has(1)).toBe(true);
    expect(settling.wrongBy[0].has(3)).toBe(true);
    expect(settling.phase).toBe("SETTLING");
    expect(settling.settleKind).toBe("WRONG");

    const next = reducer(settling, {
      type: "SETTLE_COMPLETE",
      token: settling.settleToken,
    });
    expect(next.phase).toBe("FLIPPING");
    expect(next.settleKind).toBeNull();
    // Wrong claim does NOT advance the cycle; flipper is unchanged.
    expect(next.flipper).toBe(0);
  });


  it("is a NO-OP outside CLAIM_SELECTING", () => {
    const s = baseState({ phase: "FLIPPING", selectedCards: [0, 2] });
    expect(reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 })).toBe(s);
  });

  it("is a NO-OP when fewer than 2 cards are selected", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", selectedCards: [0] });
    expect(reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 })).toBe(s);
  });
});

// ===========================================================================
// SKIP_TICK
// ===========================================================================
describe("SKIP_TICK", () => {
  it("advances the cycle past a disconnected flipper", () => {
    const s = baseState({ phase: "FLIPPING", flipper: 0, disconnected: [true, false] });
    const next = reducer(s, { type: "SKIP_TICK" });
    expect(next.flipper).toBe(1);
  });

  it("is a NO-OP when the flipper is connected", () => {
    const s = baseState({ phase: "FLIPPING", flipper: 0 });
    expect(reducer(s, { type: "SKIP_TICK" })).toBe(s);
  });

  it("is a NO-OP outside FLIPPING", () => {
    const s = baseState({ phase: "AWAITING_ROLL", disconnected: [true, false] });
    expect(reducer(s, { type: "SKIP_TICK" })).toBe(s);
  });

  it("is a NO-OP while another action is inFlight", () => {
    const s = baseState({
      phase: "FLIPPING",
      flipper: 0,
      disconnected: [true, false],
      inFlight: { kind: "flip", token: 1, by: 0, idx: 0 },
    });
    expect(reducer(s, { type: "SKIP_TICK" })).toBe(s);
  });
});

// ===========================================================================
// CLAIM_START (opponent-initiated)
// ===========================================================================
describe("CLAIM_START", () => {
  it("puts the state into CLAIM_RESOLVING for a valid opponent claim", () => {
    const s = baseState({ phase: "FLIPPING" });
    const next = reducer(s, { type: "CLAIM_START", by: 1, a: 0, b: 2, token: 7 });
    expect(next.phase).toBe("CLAIM_RESOLVING");
    expect(next.inFlight).toMatchObject({ kind: "claim", token: 7, by: 1, a: 0, b: 2 });
    expect(next.flippedThisCycle.has(1)).toBe(false);
    expect(next.peekingCard).toBeNull();
  });

  it("is a NO-OP outside FLIPPING (e.g. AWAITING_ROLL)", () => {
    const s = baseState({ phase: "AWAITING_ROLL" });
    expect(reducer(s, { type: "CLAIM_START", by: 1, a: 0, b: 2, token: 1 })).toBe(s);
  });

  it("accepts by === 0 in the generalized reducer (no more seat gate)", () => {
    const s = baseState({ phase: "FLIPPING" });
    const next = reducer(s, { type: "CLAIM_START", by: 0, a: 0, b: 2, token: 1 });
    expect(next.phase).toBe("CLAIM_RESOLVING");
    expect(next.claimBy).toBe(0);
  });

  it("is a NO-OP when either target slot is null", () => {
    const grid = baseState().grid.slice();
    grid[2] = null;
    const s = baseState({ phase: "FLIPPING", grid });
    expect(reducer(s, { type: "CLAIM_START", by: 1, a: 0, b: 2, token: 1 })).toBe(s);
  });

  it("is a NO-OP when a card is in the claimant's wrongBy set", () => {
    const s = baseState({
      phase: "FLIPPING",
      wrongBy: [new Set(), new Set([0])],
    });
    expect(reducer(s, { type: "CLAIM_START", by: 1, a: 0, b: 2, token: 1 })).toBe(s);
  });
});

// ===========================================================================
// CLAIM_RESOLVE
// ===========================================================================
describe("CLAIM_RESOLVE", () => {
  it("correct opponent claim: +2 opponent, winner rolls (opponent becomes roller)", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 7, by: 1, a: 0, b: 2 },
      roller: 0,
      flipper: 0,
      rule: ["SHAPE"],
      roundNum: 5,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 7 });
    expect(next.scores).toEqual([0, 2]);
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.roller).toBe(1);
    expect(next.flipper).toBe(1);
    expect(next.roundNum).toBe(6);
  });

  it("wrong opponent claim: retains wrongBy, flipper + roundNum unchanged, stays in FLIPPING", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 7, by: 1, a: 1, b: 3 },
      rule: ["SHAPE"],
      flipper: 0,
      roundNum: 3,
      flippedThisCycle: new Set([0, 1]), // even with a "complete" cycle, wrong claim must NOT advance
      claimedThisCycle: false,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 7 });
    expect(next.scores).toEqual([0, 0]);
    expect(next.phase).toBe("FLIPPING");
    expect(next.wrongBy[1].has(1)).toBe(true);
    expect(next.wrongBy[1].has(3)).toBe(true);
    expect(next.flipper).toBe(0);
    expect(next.roundNum).toBe(3);
  });

  it("wrong opponent claim mid-cycle: retains wrongBy and stays in FLIPPING", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 7, by: 1, a: 1, b: 3 },
      rule: ["SHAPE"],
      flippedThisCycle: new Set(), // cycle NOT complete yet
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 7 });
    expect(next.phase).toBe("FLIPPING");
    expect(next.wrongBy[1].has(1)).toBe(true);
    expect(next.wrongBy[1].has(3)).toBe(true);
  });

  it("STALE-TOKEN rejection: mismatched tokens are ignored", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 7, by: 1, a: 0, b: 2 },
    });
    expect(reducer(s, { type: "CLAIM_RESOLVE", token: 6 })).toBe(s);
    expect(reducer(s, { type: "CLAIM_RESOLVE", token: 8 })).toBe(s);
  });

  it("is a NO-OP when inFlight is not a claim", () => {
    const s = baseState({
      phase: "FLIPPING",
      inFlight: { kind: "flip", token: 7, by: 0, idx: 0 },
    });
    expect(reducer(s, { type: "CLAIM_RESOLVE", token: 7 })).toBe(s);
  });
});

// ===========================================================================
// SAFETY_SWAP
// ===========================================================================
describe("SAFETY_SWAP", () => {
  it("replaces grid + deck and shows the warning message", () => {
    const newGrid = baseState().grid.slice();
    newGrid[0] = UNRELATED_A;
    const newDeck: Card[] = [];
    const s = baseState();
    const next = reducer(s, { type: "SAFETY_SWAP", grid: newGrid, deck: newDeck });
    expect(next.grid).toBe(newGrid);
    expect(next.deck).toBe(newDeck);
    expect(next.messageType).toBe("warning");
  });

  it("is NOT phase-guarded (applies from any phase, including GAME_OVER)", () => {
    // NOTE: this is *current* reducer behaviour. If we want to lock a
    // phase guard around SAFETY_SWAP, that's a real change, not a test.
    const s = baseState({ phase: "GAME_OVER" });
    const next = reducer(s, { type: "SAFETY_SWAP", grid: s.grid, deck: s.deck });
    expect(next.messageType).toBe("warning");
  });
});

// ===========================================================================
// REMOVE_MATCHED
// ===========================================================================
describe("REMOVE_MATCHED", () => {
  it("clears the matched slots in the grid", () => {
    const s = baseState({ matchedCards: new Set([0, 2]) });
    const next = reducer(s, { type: "REMOVE_MATCHED" });
    expect(next.grid[0]).toBeNull();
    expect(next.grid[2]).toBeNull();
  });

  it("is a NO-OP when matchedCards is empty", () => {
    const s = baseState({ matchedCards: new Set() });
    expect(reducer(s, { type: "REMOVE_MATCHED" })).toBe(s);
  });
});

// ===========================================================================
// SET_MESSAGE
// ===========================================================================
describe("SET_MESSAGE", () => {
  it("updates message and messageType from any phase", () => {
    const s = baseState({ phase: "GAME_OVER" });
    const next = reducer(s, { type: "SET_MESSAGE", message: "hi", messageType: "warning" });
    expect(next.message).toBe("hi");
    expect(next.messageType).toBe("warning");
  });
});

// ===========================================================================
// Behavioural coverage — the pieces most at risk in the multiplayer refactor.
// ===========================================================================
describe("stale-token rejection (both flip + claim)", () => {
  it("FLIP_COMPLETE with a stale token does nothing; the current token completes the flip", () => {
    const s = baseState({
      phase: "FLIPPING",
      inFlight: { kind: "flip", token: 10, by: 0, idx: 0 },
      peekingCard: 0,
    });
    // Stale token first.
    const stale = reducer(s, { type: "FLIP_COMPLETE", token: 9 });
    expect(stale).toBe(s);
    // Current token completes.
    const fresh = reducer(s, { type: "FLIP_COMPLETE", token: 10 });
    expect(fresh.inFlight).toBeNull();
    expect(fresh.flippedThisCycle.has(0)).toBe(true);
  });

  it("CLAIM_RESOLVE with a stale token does nothing; the current token resolves the claim", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 12, by: 1, a: 0, b: 2 },
      rule: ["SHAPE"],
    });
    expect(reducer(s, { type: "CLAIM_RESOLVE", token: 11 })).toBe(s);
    const fresh = reducer(s, { type: "CLAIM_RESOLVE", token: 12 });
    expect(fresh.scores).toEqual([0, 2]);
  });
});

describe("wrong-claim card return (v6.5)", () => {
  function wrongClaim(over: Partial<State> = {}) {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [1, 3], // wrong pair
      rule: ["SHAPE"],
      flipper: 0,
      flippedThisCycle: new Set([0]),
      ...over,
    });
    return reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
  }

  it("decrements the claimant's score by one and grows the draw pile by one", () => {
    const before = baseState();
    const s = wrongClaim({ scores: [2, 0], piles: [[SHAPE_MATCH_A, SHAPE_MATCH_B], []] });
    expect(s.scores).toEqual([1, 0]);
    expect(s.deck.length).toBe(before.deck.length + 1);
    expect(s.piles[0]).toHaveLength(1);
    // The returned card goes to the BOTTOM of the draw pile.
    expect(s.deck[s.deck.length - 1].id).toBe(SHAPE_MATCH_B.id);
  });

  it("at zero score returns nothing: score stays 0 and the pile is unchanged", () => {
    const before = baseState();
    const s = wrongClaim({ scores: [0, 0] });
    expect(s.scores).toEqual([0, 0]);
    expect(s.deck.length).toBe(before.deck.length);
    expect(s.piles[0]).toHaveLength(0);
  });

  it("a returned card refills an empty draw pile", () => {
    const s = wrongClaim({
      scores: [2, 0],
      piles: [[SHAPE_MATCH_A, SHAPE_MATCH_B], []],
      deck: [],
      drawEmpty: true,
    });
    expect(s.deck).toHaveLength(1);
    expect(s.drawEmpty).toBe(false);
  });

  it("no longer blocks the claimant from flipping, claiming or rolling", () => {
    const s = wrongClaim({ scores: [2, 0], piles: [[SHAPE_MATCH_A, SHAPE_MATCH_B], []] });
    const flipping = { ...s, phase: "FLIPPING" as const, settleKind: null, flipper: 0, inFlight: null };
    expect(reducer(flipping, { type: "FLIP_START", by: 0, idx: 2, token: 1 }).peekingCard).toBe(2);
    expect(reducer(flipping, { type: "PLAYER_ENTER_CLAIM", by: 0 }).phase).toBe("CLAIM_SELECTING");
    expect(reducer(flipping, { type: "CLAIM_START", by: 0, a: 0, b: 2, token: 2 }).phase).toBe("CLAIM_RESOLVING");
    const awaiting = { ...flipping, phase: "AWAITING_ROLL" as const, roller: 0 };
    expect(reducer(awaiting, { type: "ROLL_START" }).rolling).toBe(true);
  });

  it("the two wrongly-claimed cards stay face-up until the round ends", () => {
    let s = wrongClaim();
    expect(s.wrongBy[0].has(1)).toBe(true);
    expect(s.wrongBy[0].has(3)).toBe(true);
    s = reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken });
    expect(s.phase).toBe("FLIPPING");
    expect(s.wrongBy[0].has(1)).toBe(true);
    const roundBefore = s.roundNum;
    s = reducer(
      {
        ...s,
        phase: "CLAIM_RESOLVING",
        inFlight: { kind: "claim", token: 99, by: 1, a: 0, b: 2 },
        rule: ["SHAPE"],
      },
      { type: "CLAIM_RESOLVE", token: 99 },
    );
    expect(s.roundNum).toBe(roundBefore + 1);
    expect(s.wrongBy[0].size).toBe(0);
  });
});

describe("cycle advancement in a 2-player game", () => {
  it("first flip rotates the flipper; second flip completes the cycle (no draw → passes roll)", () => {
    // Set up mid-cycle: human just finished their flip.
    let s = baseState({
      phase: "FLIPPING",
      flipper: 0,
      inFlight: { kind: "flip", token: 1, by: 0, idx: 0 },
      peekingCard: 0,
      flippedThisCycle: new Set(),
    });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    expect(s.flipper).toBe(1);
    expect(s.phase).toBe("FLIPPING");
    // Opponent flip.
    s = { ...s, flipsThisTurn: 1, inFlight: { kind: "flip", token: 2, by: 1, idx: 3 }, peekingCard: 3 };
    s = reducer(s, { type: "FLIP_COMPLETE", token: 2 });
    // Cycle complete, deck not empty → new round via startRound (roll passes clockwise).
    expect(s.phase).toBe("AWAITING_ROLL");
    expect(s.roller).toBe(1); // roller rotated
  });
});

describe("winner rolls (v6.2)", () => {
  it("human correct claim makes the human next roller", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [0, 2],
      rule: ["SHAPE"],
      roller: 1,
      flipper: 1,
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    const next = reducer(settling, { type: "SETTLE_COMPLETE", token: settling.settleToken });
    expect(next.roller).toBe(0);
    expect(next.flipper).toBe(0);

  });

  it("opponent correct claim makes the opponent next roller", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 3, by: 1, a: 0, b: 2 },
      rule: ["SHAPE"],
      roller: 0,
      flipper: 0,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 3 });
    expect(next.roller).toBe(1);
    expect(next.flipper).toBe(1);
  });
});

describe("end-game entry conditions (v6.6 — two quiet rotations)", () => {
  // Completes a rotation on a 2-seat table by finishing seat 1's flip.
  function quietRotation(over: Partial<State> = {}): State {
    const s = baseState({
      phase: "FLIPPING",
      flipper: 1,
      claimedThisCycle: false,
      flippedThisCycle: new Set([0]),
      inFlight: { kind: "flip", token: 4, by: 1, idx: 3 },
      peekingCard: 3,
      ...over,
    });
    return reducer(s, { type: "FLIP_COMPLETE", token: 4 });
  }

  it("a quiet rotation never ends the game — it passes the roll clockwise", () => {
    const next = quietRotation({ drawEmpty: true, roundsSinceClaim: 3 });
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.roundsSinceClaim).toBe(4);
    expect(next.roller).toBe(1);
  });

  it("reaching TARGET_SCORE via CLAIM_RESOLVE ends the game immediately", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      rule: ["SHAPE"],
      scores: [TARGET_SCORE - 2, 0],
      piles: [Array(TARGET_SCORE - 2).fill(card("circle", 1, "red")), []],
      inFlight: { kind: "claim", token: 7, by: 0, a: 0, b: 2 },
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 7 });
    expect(next.phase).toBe("GAME_OVER");
    expect(next.scores[0]).toBe(TARGET_SCORE);
  });

  it("reaching TARGET_SCORE via a matched pair ends the game AFTER the settle", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      claimBy: 0,
      selectedCards: [0, 2],
      rule: ["SHAPE"],
      scores: [TARGET_SCORE - 2, 0],
      piles: [Array(TARGET_SCORE - 2).fill(card("circle", 1, "red")), []],
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    // Animation still plays — not game over yet.
    expect(settling.phase).toBe("SETTLING");
    const done = reducer(settling, {
      type: "SETTLE_COMPLETE",
      token: settling.settleToken,
    });
    expect(done.phase).toBe("GAME_OVER");
  });

  it("below TARGET_SCORE the game continues normally", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      rule: ["SHAPE"],
      scores: [TARGET_SCORE - 4, 0],
      inFlight: { kind: "claim", token: 7, by: 0, a: 0, b: 2 },
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 7 });
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.scores[0]).toBe(TARGET_SCORE - 2);
  });

  it("the grid draining to zero through correct claims still ends the game immediately", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      rule: ["SHAPE"],
      deck: [],
      drawEmpty: true,
      quietRotations: 0,
      grid: [SHAPE_MATCH_A, null, SHAPE_MATCH_B, null, null, null],
      inFlight: { kind: "claim", token: 9, by: 0, a: 0, b: 2 },
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 9 });
    expect(next.phase).toBe("GAME_OVER");
  });
});


describe("game over terminal", () => {
  it("startRound with no cards left and empty deck yields GAME_OVER", () => {
    // Force a scenario: correct human claim removes the last two cards, no deck.
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [0, 2],
      rule: ["SHAPE"],
      deck: [], // empty
      // Leave only the two selected cards on the grid.
      grid: [
        SHAPE_MATCH_A,
        null,
        SHAPE_MATCH_B,
        null,
        null,
        null,
      ],
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    const next = reducer(settling, { type: "SETTLE_COMPLETE", token: settling.settleToken });
    expect(next.phase).toBe("GAME_OVER");
    expect(next.scores).toEqual([2, 0]);

  });

  it("further actions after GAME_OVER are ignored where phase-guarded", () => {
    const s = baseState({ phase: "GAME_OVER" });
    expect(reducer(s, { type: "ROLL_START" })).toBe(s);
    expect(reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 })).toBe(s);
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 0 })).toBe(s);
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 })).toBe(s);
    expect(reducer(s, { type: "SKIP_TICK" })).toBe(s);
  });
});

describe("scoring", () => {
  it("correct human claim adds exactly 2 to scores[0]", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [0, 2],
      rule: ["SHAPE"],
      scores: [4, 6],
    });
    const next = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    expect(next.scores).toEqual([6, 6]);
  });

  it("correct opponent claim adds exactly 2 to scores[1]", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 1, by: 1, a: 0, b: 2 },
      rule: ["SHAPE"],
      scores: [4, 6],
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 1 });
    expect(next.scores).toEqual([4, 8]);
  });

});

// Confirm initialState is deterministic under our stub — a sanity check.
describe("initialState (deterministic under Math.random stub)", () => {
  it("produces the same state on repeated calls", () => {
    const a = initialState(6);
    const b = initialState(6);
    expect(a.grid.map((c) => c?.id)).toEqual(b.grid.map((c) => c?.id));
    expect(a.rule).toEqual(b.rule);
    expect(a.dieValues).toEqual(b.dieValues);
  });
});

// ===========================================================================
// N>2 generalization tests
// ===========================================================================
describe("N>2 generalization", () => {
  it("cycleAdvance rotates correctly at seatCount=3", () => {
    // seat 0 flips → flipper becomes 1
    let s = baseState({
      seatCount: 3,
      phase: "FLIPPING",
      flipper: 0,
      inFlight: { kind: "flip", token: 1, by: 0, idx: 0 },
      peekingCard: 0,
    });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    expect(s.phase).toBe("FLIPPING");
    expect(s.flipper).toBe(1);
    // seat 1 flips → flipper becomes 2 (cycle NOT complete yet)
    s = { ...s, flipsThisTurn: 1, inFlight: { kind: "flip", token: 2, by: 1, idx: 3 }, peekingCard: 3 };
    s = reducer(s, { type: "FLIP_COMPLETE", token: 2 });
    expect(s.phase).toBe("FLIPPING");
    expect(s.flipper).toBe(2);
    // seat 2 flips → cycle complete, roll passes clockwise (no claim)
    s = { ...s, flipsThisTurn: 1, inFlight: { kind: "flip", token: 3, by: 2, idx: 4 }, peekingCard: 4 };
    s = reducer(s, { type: "FLIP_COMPLETE", token: 3 });
    expect(s.phase).toBe("AWAITING_ROLL");
    expect(s.roller).toBe(1); // (0 + 1) % 3
  });

  it("cycleAdvance rotates correctly at seatCount=5", () => {
    let s = baseState({ seatCount: 5, phase: "FLIPPING", flipper: 0 });
    for (let i = 0; i < 4; i++) {
      s = {
        ...s,
        flipsThisTurn: 1,
        inFlight: { kind: "flip", token: i + 1, by: i, idx: i },
        peekingCard: i,
      };
      s = reducer(s, { type: "FLIP_COMPLETE", token: i + 1 });
      expect(s.phase).toBe("FLIPPING");
      expect(s.flipper).toBe(i + 1);
    }
    // 5th flip completes the cycle → new round
    s = { ...s, flipsThisTurn: 1, inFlight: { kind: "flip", token: 5, by: 4, idx: 5 }, peekingCard: 5 };
    s = reducer(s, { type: "FLIP_COMPLETE", token: 5 });
    expect(s.phase).toBe("AWAITING_ROLL");
    expect(s.roller).toBe(1);
  });

  it("wrong-claim penalty applies to the correct seat at seatCount=4", () => {
    const s = baseState({
      seatCount: 4,
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 1, by: 2, a: 1, b: 3 }, // wrong pair
      rule: ["SHAPE"],
      flippedThisCycle: new Set(), // mid-cycle so state persists
      claimBy: 2,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 1 });
    expect(next.phase).toBe("FLIPPING");
    expect(next.wrongBy[2].has(1)).toBe(true);
    expect(next.scores).toEqual([0, 0, 0, 0]);
  });

  it("wrongBy tracks per-seat at seatCount=4", () => {
    const s = baseState({
      seatCount: 4,
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 1, by: 2, a: 1, b: 3 },
      rule: ["SHAPE"],
      flippedThisCycle: new Set(),
      claimBy: 2,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 1 });
    expect(next.wrongBy[2].has(1)).toBe(true);
    expect(next.wrongBy[2].has(3)).toBe(true);
    expect(next.wrongBy[0].size).toBe(0);
    expect(next.wrongBy[1].size).toBe(0);
    expect(next.wrongBy[3].size).toBe(0);
  });

  it("claimBy is set on PLAYER_ENTER_CLAIM and cleared on resolve", () => {
    const s = baseState({ seatCount: 3, phase: "FLIPPING", flipper: 2, claimBy: null });
    const entered = reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 2 });
    expect(entered.phase).toBe("CLAIM_SELECTING");
    expect(entered.claimBy).toBe(2);
    // Select and resolve correct pair
    const selA = reducer(entered, { type: "PLAYER_SELECT_CARD", by: 2, idx: 0 });
    const selB = reducer(selA, { type: "PLAYER_SELECT_CARD", by: 2, idx: 2 });
    const resolved = reducer(selB, { type: "PLAYER_RESOLVE_MATCH", by: 2 });
    expect(resolved.claimBy).toBeNull();
  });

  it("claimBy is cleared on wrong claim (void)", () => {
    const s = baseState({
      seatCount: 3,
      phase: "CLAIM_SELECTING",
      selectedCards: [1, 3], // wrong pair
      claimBy: 1,
      flipper: 1,
    });
    const next = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 1 });
    expect(next.claimBy).toBeNull();
  });

  it("PLAYER_SELECT_CARD rejects seats that are not the current claimant", () => {
    const s = baseState({ seatCount: 3, phase: "CLAIM_SELECTING", claimBy: 1 });
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 0 })).toBe(s);
    const ok = reducer(s, { type: "PLAYER_SELECT_CARD", by: 1, idx: 0 });
    expect(ok.selectedCards).toEqual([0]);
  });

  it("winner-rolls: correct claim by seat 2 at seatCount=4 makes seat 2 next roller", () => {
    const s = baseState({
      seatCount: 4,
      phase: "CLAIM_RESOLVING",
      inFlight: { kind: "claim", token: 9, by: 2, a: 0, b: 2 },
      rule: ["SHAPE"],
      roller: 0,
      flipper: 0,
      claimBy: 2,
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 9 });
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.roller).toBe(2);
    expect(next.flipper).toBe(2);
    expect(next.scores).toEqual([0, 0, 2, 0]);
  });

  it("CLAIM_START accepts any bot/human seat (no more by !== 1 gate)", () => {
    const s = baseState({ seatCount: 3, phase: "FLIPPING" });
    const next = reducer(s, { type: "CLAIM_START", by: 2, a: 0, b: 2, token: 1 });
    expect(next.phase).toBe("CLAIM_RESOLVING");
    expect(next.claimBy).toBe(2);
    expect(next.inFlight).toMatchObject({ kind: "claim", by: 2 });
  });
});

// ===========================================================================
// CANCEL_CLAIM (bug 1 fix)
// ===========================================================================
describe("CANCEL_CLAIM", () => {
  it("preserves flipper — does NOT advance the cycle", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      flipper: 0,
      claimBy: 0,
      selectedCards: [1],
      flippedThisCycle: new Set<number>(),
    });
    const next = reducer(s, { type: "CANCEL_CLAIM", by: 0 });
    expect(next.phase).toBe("FLIPPING");
    expect(next.flipper).toBe(0); // unchanged
    expect(next.flippedThisCycle.size).toBe(0); // untouched
  });

  it("sets claimBy to null (this is what the host watches to rotate claimWindow)", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", claimBy: 1, flipper: 1 });
    const next = reducer(s, { type: "CANCEL_CLAIM", by: 1 });
    expect(next.claimBy).toBeNull();
  });

  it("applies no penalty", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", claimBy: 0, scores: [2, 0] });
    const next = reducer(s, { type: "CANCEL_CLAIM", by: 0 });
    expect(next.scores).toEqual([2, 0]);
    expect(next.wrongBy[0].size).toBe(0);
  });

  it("is a NO-OP when phase !== CLAIM_SELECTING", () => {
    for (const phase of ["FLIPPING", "AWAITING_ROLL", "CLAIM_RESOLVING", "GAME_OVER"] as Phase[]) {
      const s = baseState({ phase, claimBy: 0 });
      expect(reducer(s, { type: "CANCEL_CLAIM", by: 0 })).toBe(s);
    }
  });

  it("is a NO-OP when claimBy !== action.by", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", claimBy: 0 });
    expect(reducer(s, { type: "CANCEL_CLAIM", by: 1 })).toBe(s);
  });

  it("after cancel, PLAYER_ENTER_CLAIM in the same round is accepted", () => {
    const s = baseState({ phase: "CLAIM_SELECTING", claimBy: 0, flipper: 0 });
    const cancelled = reducer(s, { type: "CANCEL_CLAIM", by: 0 });
    expect(cancelled.phase).toBe("FLIPPING");
    const reclaimed = reducer(cancelled, { type: "PLAYER_ENTER_CLAIM", by: 1 });
    expect(reclaimed.phase).toBe("CLAIM_SELECTING");
    expect(reclaimed.claimBy).toBe(1);
  });
});

// ===========================================================================
// SET_DISCONNECTED (bug 2 fix)
// ===========================================================================
describe("SET_DISCONNECTED", () => {
  it("replaces the set rather than merging", () => {
    const s = baseState({
      seatCount: 3,
      disconnected: [false, true, false],
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
    });
    const next = reducer(s, { type: "SET_DISCONNECTED", seats: [2] });
    expect(next.disconnected).toEqual([false, false, true]);
  });

  it("advancement skips a disconnected seat", () => {
    const s = baseState({
      seatCount: 3,
      disconnected: [false, true, false],
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      phase: "FLIPPING",
      flipper: 0,
    });
    // Complete flipper 0's flip → should hop over seat 1 to seat 2.
    const withFlight = reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 });
    const next = reducer(withFlight, { type: "FLIP_COMPLETE", token: 1 });
    expect(next.flipper).toBe(2);
  });

  it("advancement terminates when only one connected seat remains", () => {
    const s = baseState({
      seatCount: 3,
      disconnected: [false, true, true],
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      phase: "FLIPPING",
      flipper: 0,
      flippedThisCycle: new Set<number>(),
    });
    // Seat 0 flips; cycle should end (connectedCount=1) and start next round
    // without spinning. Bound: the advance loop must not exceed seatCount.
    const withFlight = reducer(s, { type: "FLIP_START", by: 0, idx: 0, token: 1 });
    const next = reducer(withFlight, { type: "FLIP_COMPLETE", token: 1 });
    // Cycle-end → startRound → AWAITING_ROLL with roller = next connected = 0.
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.roller).toBe(0);
    expect(next.flipper).toBe(0);
  });

  it("a disconnected seat advances the rotation", () => {
    const s = baseState({
      seatCount: 3,
      disconnected: [false, true, false],
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      phase: "FLIPPING",
      flipper: 1,
      inFlight: null,
    });
    const next = reducer(s, { type: "SKIP_TICK" });
    expect(next.flipper).toBe(2);
  });

  it("roll passes to the next connected seat when the roller is disconnected", () => {
    const s = baseState({
      seatCount: 3,
      disconnected: [false, false, false],
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      phase: "AWAITING_ROLL",
      roller: 0,
      flipper: 0,
    });
    const next = reducer(s, { type: "SET_DISCONNECTED", seats: [0] });
    expect(next.roller).toBe(1);
    expect(next.flipper).toBe(1);
    expect(next.phase).toBe("AWAITING_ROLL");
  });
});

// ===========================================================================
// N=3 seat coverage — regression for stale reducer seatCount.
// ===========================================================================
describe("N=3 seats", () => {
  it("initialState allocates seat-indexed arrays at length 3", () => {
    const s = initialState(9, { seatCount: 3 });
    expect(s.seatCount).toBe(3);
    expect(s.scores).toHaveLength(3);
    expect(s.piles).toHaveLength(3);
    expect(s.wrongBy).toHaveLength(3);
    expect(s.disconnected).toHaveLength(3);
  });

  it("flipper cycles through all three seats before ending the round", () => {
    // Rule = SHAPE, but grid has no matching pair by SHAPE for the seats we
    // flip (we use idx 1/3/4 — square/tri/star — no share). Nobody claims.
    let s = baseState({
      seatCount: 3,
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      disconnected: [false, false, false],
      phase: "FLIPPING",
      roller: 0,
      flipper: 0,
      roundNum: 5,
    });
    // Flip 1 — seat 0
    s = reducer(s, { type: "FLIP_START", by: 0, idx: 1, token: 1 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    expect(s.phase).toBe("FLIPPING");
    expect(s.flipper).toBe(1);
    expect(s.roundNum).toBe(5);
    // Flip 2 — seat 1
    s = { ...s, flipsThisTurn: 1 };
    s = reducer(s, { type: "FLIP_START", by: 1, idx: 3, token: 2 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 2 });
    expect(s.phase).toBe("FLIPPING");
    expect(s.flipper).toBe(2);
    expect(s.roundNum).toBe(5);
    // Flip 3 — seat 2 completes the rotation → round ends → new AWAITING_ROLL
    s = { ...s, flipsThisTurn: 1 };
    s = reducer(s, { type: "FLIP_START", by: 2, idx: 4, token: 3 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 3 });
    expect(s.phase).toBe("AWAITING_ROLL");
    expect(s.roundNum).toBe(6);
    // The next roller is seat 1 ((roller 0 + 1) mod 3).
    expect(s.roller).toBe(1);
    expect(s.flipper).toBe(1);
  });

  it("seat 2 can become the roller across successive rounds", () => {
    // Start at roller=1. After a no-claim rotation the next roller is 2.
    let s = baseState({
      seatCount: 3,
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      disconnected: [false, false, false],
      phase: "FLIPPING",
      roller: 1,
      flipper: 1,
    });
    s = reducer(s, { type: "FLIP_START", by: 1, idx: 1, token: 1 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    s = { ...s, flipsThisTurn: 1 };
    s = reducer(s, { type: "FLIP_START", by: 2, idx: 3, token: 2 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 2 });
    s = { ...s, flipsThisTurn: 1 };
    s = reducer(s, { type: "FLIP_START", by: 0, idx: 4, token: 3 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 3 });
    expect(s.phase).toBe("AWAITING_ROLL");
    expect(s.roller).toBe(2);
  });

  it("seat 2 can score a match without crashing (wrongBy/scores index into seat 2)", () => {
    // Grid[0] and grid[2] share SHAPE=circle. Seat 2 claims them.
    let s = baseState({
      seatCount: 3,
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      disconnected: [false, false, false],
      phase: "CLAIM_SELECTING",
      claimBy: 2,
      selectedCards: [0, 2],
      rule: ["SHAPE"],
    });
    s = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 2 });
    expect(s.scores[2]).toBe(2);
  });

  it("seat 2 wrong claim applies penalty and does not throw", () => {
    // Grid[1] (square) and grid[3] (tri) don't share SHAPE. Seat 2 claims wrong.
    let s = baseState({
      seatCount: 3,
      scores: [0, 0, 0],
      wrongBy: [new Set(), new Set(), new Set()],
      disconnected: [false, false, false],
      phase: "CLAIM_SELECTING",
      claimBy: 2,
      selectedCards: [1, 3],
      rule: ["SHAPE"],
    });
    s = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 2 });
    expect(s.phase).toBe("SETTLING");
    s = reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken });
    expect(s.phase).toBe("FLIPPING");
    expect(s.wrongBy[2].has(1)).toBe(true);
    expect(s.wrongBy[2].has(3)).toBe(true);
    expect(s.scores[2]).toBe(0);
  });
});

// ===========================================================================
// SETTLING
// ===========================================================================
describe("SETTLING", () => {
  function settledMatch() {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      selectedCards: [0, 2],
      rule: ["SHAPE"],
      claimBy: 0,
    });
    return reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
  }

  it("every player intent is a no-op while SETTLING", () => {
    const s = settledMatch();
    expect(reducer(s, { type: "ROLL_START" })).toBe(s);
    expect(reducer(s, { type: "FLIP_START", by: 0, idx: 1, token: 9 })).toBe(s);
    expect(reducer(s, { type: "SKIP_TICK" })).toBe(s);
    expect(reducer(s, { type: "PLAYER_ENTER_CLAIM", by: 0 })).toBe(s);
    expect(reducer(s, { type: "PLAYER_SELECT_CARD", by: 0, idx: 1 })).toBe(s);
    expect(reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 })).toBe(s);
    expect(reducer(s, { type: "CLAIM_START", by: 0, a: 1, b: 3, token: 9 })).toBe(s);
    expect(reducer(s, { type: "CANCEL_CLAIM", by: 0 })).toBe(s);
  });

  it("a stale SETTLE_COMPLETE token is a no-op", () => {
    const s = settledMatch();
    expect(reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken - 1 })).toBe(s);
    expect(reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken + 5 })).toBe(s);
  });

  it("SETTLE_COMPLETE is a no-op outside SETTLING", () => {
    const s = baseState({ phase: "FLIPPING" });
    expect(reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken })).toBe(s);
  });

  it("matchedCards survives until SETTLE_COMPLETE", () => {
    const s = settledMatch();
    expect(Array.from(s.matchedCards).sort()).toEqual([0, 2]);
    const after = reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken });
    expect(after.matchedCards.size).toBe(0);
  });
});


describe("DEBUG_DRAIN_DECK", () => {
  it("drains the deck to 2 while leaving grid and scores untouched", () => {
    window.history.replaceState({}, "", "/?debug=1");
    const s0 = initialState(9, { seatCount: 2 });
    const s1 = reducer(s0, { type: "DEBUG_DRAIN_DECK" });
    expect(s1.deck.length).toBe(2);
    expect(s1.grid.length).toBe(s0.grid.length);
    expect(s1.scores).toEqual(s0.scores);
    expect(s1.roller).toBe(s0.roller);
    expect(s1.phase).toBe(s0.phase);
    window.history.replaceState({}, "", "/");
  });
});

describe("DEBUG_FORCE_END_GAME", () => {
  it("is a no-op without ?debug=1", () => {
    window.history.replaceState({}, "", "/");
    const s0 = initialState(9, { seatCount: 2 });
    expect(reducer(s0, { type: "DEBUG_FORCE_END_GAME" })).toBe(s0);
  });

  it("leaves scores, seats and round number unchanged", () => {
    window.history.replaceState({}, "", "/?debug=1");
    const s0 = initialState(9, { seatCount: 3 });
    const s1 = reducer(s0, { type: "DEBUG_FORCE_END_GAME" });
    expect(s1.scores).toEqual(s0.scores);
    expect(s1.seatCount).toBe(s0.seatCount);
    expect(s1.names).toEqual(s0.names);
    expect(s1.roundNum).toBe(s0.roundNum);
    expect(s1.deck.length).toBe(0);
    expect(s1.drawEmpty).toBe(true);
    expect(s1.grid.filter((c) => c !== null).length).toBe(1);
    window.history.replaceState({}, "", "/");
  });

  it("reaches GAME_OVER through the normal rotation path", () => {
    window.history.replaceState({}, "", "/?debug=1");
    const forced = reducer(
      { ...initialState(9, { seatCount: 2 }), phase: "FLIPPING", flipper: 1 },
      { type: "DEBUG_FORCE_END_GAME" },
    );
    const s = {
      ...forced,
      claimedThisCycle: false,
      flippedThisCycle: new Set([0]),
      flipsThisTurn: 1,
      inFlight: { kind: "flip" as const, token: 9, by: 1, idx: 3 },
      peekingCard: 3,
    };
    const next = reducer(s, { type: "FLIP_COMPLETE", token: 9 });
    expect(next.phase).toBe("GAME_OVER");
    window.history.replaceState({}, "", "/");
  });
});

// ===========================================================================
// v6.7 — two flips per turn, claims never consume a turn
// ===========================================================================
describe("v6.7 two flips per turn", () => {
  it("keeps the same flipper after the first flip of a turn", () => {
    let s = baseState({ phase: "FLIPPING", flipper: 0, flipsThisTurn: 0 });
    s = reducer(s, { type: "FLIP_START", by: 0, idx: 1, token: 1 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    expect(s.phase).toBe("FLIPPING");
    expect(s.flipper).toBe(0);
    expect(s.flipsThisTurn).toBe(1);
    expect(s.inFlight).toBeNull();
    expect(s.peekingCard).toBeNull();
    expect(s.flippedThisCycle.has(0)).toBe(false);
  });

  it("advances the rotation on the second flip and resets flipsThisTurn", () => {
    let s = baseState({ phase: "FLIPPING", flipper: 0, flipsThisTurn: 0 });
    s = reducer(s, { type: "FLIP_START", by: 0, idx: 1, token: 1 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 1 });
    s = reducer(s, { type: "FLIP_START", by: 0, idx: 3, token: 2 });
    s = reducer(s, { type: "FLIP_COMPLETE", token: 2 });
    expect(s.flipper).toBe(1);
    expect(s.flipsThisTurn).toBe(0);
    expect(s.flippedThisCycle.has(0)).toBe(true);
  });

  it("SKIP_TICK fires for a connected flipper with no legal card left", () => {
    const s = baseState({
      phase: "FLIPPING",
      flipper: 0,
      flipsThisTurn: 0,
      wrongBy: [new Set([0, 1, 2, 3, 4, 5]), new Set()],
    });
    const next = reducer(s, { type: "SKIP_TICK" });
    expect(next).not.toBe(s);
    expect(next.flipper).toBe(1);
    expect(next.flippedThisCycle.has(0)).toBe(true);
  });

  it("a wrong claim leaves the flipper and unused flips intact", () => {
    const s = baseState({
      phase: "CLAIM_RESOLVING",
      flipper: 0,
      flipsThisTurn: 1,
      rule: ["SHAPE"],
      claimBy: 0,
      inFlight: { kind: "claim", token: 3, by: 0, a: 1, b: 3 },
    });
    const next = reducer(s, { type: "CLAIM_RESOLVE", token: 3 });
    expect(next.phase).toBe("FLIPPING");
    expect(next.flipper).toBe(0);
    expect(next.flipsThisTurn).toBe(1);
    expect(next.flippedThisCycle.has(0)).toBe(false);
  });

  it("a wrong player claim keeps the turn after SETTLING", () => {
    const s = baseState({
      phase: "CLAIM_SELECTING",
      flipper: 0,
      flipsThisTurn: 0,
      rule: ["SHAPE"],
      claimBy: 0,
      selectedCards: [1, 3],
    });
    const settling = reducer(s, { type: "PLAYER_RESOLVE_MATCH", by: 0 });
    const next = reducer(settling, { type: "SETTLE_COMPLETE", token: settling.settleToken });
    expect(next.phase).toBe("FLIPPING");
    expect(next.flipper).toBe(0);
    expect(next.flipsThisTurn).toBe(0);
  });
});
