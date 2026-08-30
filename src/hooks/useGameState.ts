import { useReducer, useCallback, useRef, useEffect, useMemo } from "react";
import { Card, createDeck, ATTRIBUTES } from "@/cardData";
import { createOpponentMemory, OpponentMemory } from "@/lib/opponentMemory";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import { createRng, type Rng } from "@/lib/rng";
import { computeSafetySwap, rngOf } from "@/lib/rolls";

type MessageType = "info" | "success" | "error" | "warning";

export const OPPONENT_TUNING = {
  reactionMinMs: 2500,
  reactionMaxMs: 5500,
  confidenceThreshold: 0.55,
  thinkDelayMs: 1400,
} as const;
const REVEAL_MS = 2000;

function rollRandomAttributes(count: number, rng: Rng = Math.random): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(ATTRIBUTES[Math.floor(rng() * ATTRIBUTES.length)]);
  }
  return result;
}

// v6.1 Single-Die Core: always roll exactly one die.
function getDieCount(): number {
  return 1;
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

function hasValidPair(grid: (Card | null)[], rule: string[]): boolean {
  const cards = grid.filter((c): c is Card => c !== null);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cardsMatchRule(cards[i], cards[j], rule)) return true;
    }
  }
  return false;
}

function hasAnyValidPair(grid: (Card | null)[]): boolean {
  const allRules: string[][] = [["SHAPE"], ["NUMBER"], ["COLOR"]];
  return allRules.some((rule) => hasValidPair(grid, rule));
}

function shuffleArray<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function computeRule(values: string[]): { rule: string[] } {
  return { rule: [values[0]] };
}

function defaultNames(seatCount: number): string[] {
  const base = ["you", "opponent"];
  const out: string[] = [];
  for (let i = 0; i < seatCount; i++) {
    out.push(base[i] ?? `player ${i + 1}`);
  }
  return out;
}

function emptyWrongBy(seatCount: number): Set<number>[] {
  return Array.from({ length: seatCount }, () => new Set<number>());
}

// Advance to the next connected seat starting AFTER `from`. Bounded by
// seatCount so all-disconnected / single-connected tables cannot spin. If no
// other connected seat exists, returns the neighbouring seat — host-level
// end-game policy handles the "table empty" case; the reducer must still
// terminate.
function nextConnected(
  from: number,
  seatCount: number,
  disconnected: boolean[],
): number {
  let next = (from + 1) % seatCount;
  for (let i = 0; i < seatCount; i++) {
    if (!disconnected[next]) return next;
    next = (next + 1) % seatCount;
  }
  return (from + 1) % seatCount;
}

function connectedCount(seatCount: number, disconnected: boolean[]): number {
  let n = 0;
  for (let i = 0; i < seatCount; i++) if (!disconnected[i]) n++;
  return n;
}

// ============================================================================
// Reducer-driven control flow
// ============================================================================

export type Phase =
  | "AWAITING_ROLL"
  | "FLIPPING"
  | "CLAIM_SELECTING"
  | "CLAIM_RESOLVING"
  | "SETTLING"
  | "GAME_OVER";

// How long the engine holds in SETTLING so feedback animations can finish
// before the board advances.
// RULE: each settle constant MUST equal its animation's delay + duration.
// Retune one and you must retune the other together.
//   great match = 300ms delay + 1000ms duration = 1300ms
//   wrong       =   0ms delay +  900ms duration =  900ms
export const SETTLE_MATCH_MS = 1300;
export const SETTLE_WRONG_MS = 1000;


type InFlight =
  | null
  | { kind: "flip"; token: number; by: number; idx: number }
  | { kind: "claim"; token: number; by: number; a: number; b: number };

export interface State {
  phase: Phase;
  slotCount: number;
  seatCount: number;
  names: string[];
  roller: number;
  flipper: number;
  grid: (Card | null)[];
  deck: Card[];
  scores: number[];
  rule: string[];
  dieValues: string[];
  wrongBy: Set<number>[];
  // v6.5: cards won by each seat. Length always equals that seat's score.
  // A wrong claim returns one of these to the bottom of the draw pile.
  piles: Card[][];
  disconnected: boolean[];
  flippedThisCycle: Set<number>;
  // v6.7: flips taken by the current flipper this turn. A turn is two flips.
  flipsThisTurn: number;
  claimedThisCycle: boolean;
  drawEmpty: boolean;
  roundNum: number;
  roundsSinceClaim: number;
  // v6.6: consecutive full rotations that ended with no correct claim while
  // the draw pile was empty. The game ends when this reaches 2. Any correct
  // claim, or a quiet rotation with cards still in the pile, resets it to 0.
  quietRotations: number;
  allFaceUp: boolean;
  selectedCards: number[];
  matchedCards: Set<number>;
  peekingCard: number | null;
  rolling: boolean;
  message: string;
  messageType: MessageType;
  inFlight: InFlight;
  claimBy: number | null;
  // SETTLING bookkeeping. `settleKind` says which feedback animation is
  // playing; `settleToken` guards against stale SETTLE_COMPLETE timers;
  // `settleBy` remembers the claiming seat so the deferred startRound can
  // hand the roll to the winner.
  settleKind: "MATCH" | "WRONG" | null;
  settleToken: number;
  settleBy: number | null;
  // Deterministic randomness source. When a `seed` was supplied at init this
  // is a seeded PRNG; otherwise it wraps Math.random. Any randomness the
  // reducer needs after init MUST read from here, never Math.random directly.
  seed: string | null;
  rng: Rng;
  // Attempt metric. Reset on INIT: counts every incorrect claim resolution.
  wrongCalls: number;
}


export interface InitOptions {
  seatCount?: number;
  names?: string[];
  /** When supplied, the deck order and opening roll become reproducible. */
  seed?: string;
}

export type Action =
  | {
      type: "INIT";
      slotCount: number;
      seatCount?: number;
      names?: string[];
      seed?: string;
    }
  | { type: "TUMBLE"; values: string[] }
  | { type: "ROLL_START" }
  | { type: "ROLL_LAND"; values: string[]; rule: string[] }
  | { type: "ROLL_SETTLE" }
  | { type: "PLAYER_ENTER_CLAIM"; by: number }
  | { type: "PLAYER_SELECT_CARD"; by: number; idx: number }
  | { type: "PLAYER_RESOLVE_MATCH"; by: number }
  | { type: "FLIP_START"; by: number; idx: number; token: number }
  | { type: "FLIP_COMPLETE"; token: number }
  | { type: "SETTLE_COMPLETE"; token: number }

  | { type: "SKIP_TICK" }
  | { type: "CLAIM_START"; by: number; a: number; b: number; token: number }
  | { type: "CLAIM_RESOLVE"; token: number }
  | { type: "CANCEL_CLAIM"; by: number }
  | { type: "SET_DISCONNECTED"; seats: number[] }
  | { type: "END_GAME_TABLE_EMPTY" }
  | { type: "SAFETY_SWAP"; grid: (Card | null)[]; deck: Card[] }
  | { type: "REMOVE_MATCHED" }
  | { type: "DEBUG_DRAIN_DECK" }
  | { type: "DEBUG_FORCE_END_GAME" }
  | { type: "SET_MESSAGE"; message: string; messageType: MessageType };

// Debug URL flag (?debug=1). Read live so it cannot be stale.
export function debugFlagOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export function initialState(slotCount: number, opts: InitOptions = {}): State {
  const seatCount = opts.seatCount ?? 2;
  const names = opts.names ?? defaultNames(seatCount);
  const seed = opts.seed ?? null;
  const rng: Rng = seed !== null ? createRng(seed) : Math.random;
  const newDeck = createDeck(rng);
  const dealt = newDeck.splice(0, slotCount);
  const newGrid = dealt.concat(Array(slotCount - dealt.length).fill(null));
  const values = rollRandomAttributes(getDieCount(), rng);
  const { rule } = computeRule(values);
  return {
    phase: "AWAITING_ROLL",
    slotCount,
    seatCount,
    names,
    roller: 0,
    flipper: 0,
    grid: newGrid,
    deck: newDeck,
    scores: Array(seatCount).fill(0),
    rule,
    dieValues: values,
    wrongBy: emptyWrongBy(seatCount),
    piles: Array.from({ length: seatCount }, () => [] as Card[]),
    disconnected: Array(seatCount).fill(false),
    flippedThisCycle: new Set(),
    flipsThisTurn: 0,
    claimedThisCycle: false,
    drawEmpty: newDeck.length === 0,
    roundNum: 1,
    roundsSinceClaim: 0,
    quietRotations: 0,

    allFaceUp: false,
    selectedCards: [],
    matchedCards: new Set(),
    peekingCard: null,
    rolling: false,
    message: "",
    messageType: "info",
    inFlight: null,
    claimBy: null,
    settleKind: null,
    settleToken: 0,
    settleBy: null,
    seed,
    rng,
    wrongCalls: 0,

  };
}

function refill(
  grid: (Card | null)[],
  deck: Card[],
  slots: number[]
): { grid: (Card | null)[]; deck: Card[] } {
  const g = [...grid];
  const d = [...deck];
  for (const i of slots) {
    if (d.length > 0) g[i] = d.shift()!;
    else g[i] = null;
  }
  return { grid: g, deck: d };
}

// v6.5 wrong-claim penalty: the claimant returns ONE card from their score
// pile to the BOTTOM of the draw pile. Score drops by one. If their pile is
// empty they return nothing and the score never goes negative. If the draw
// pile was empty, the returned card simply becomes its only card and refills
// the grid through the normal refill path.
function returnOneCard(
  s: State,
  by: number,
): {
  scores: number[];
  piles: Card[][];
  deck: Card[];
  drawEmpty: boolean;
  returnedCard: Card | null;
} {
  const pile = s.piles[by] ?? [];
  if ((s.scores[by] ?? 0) <= 0 || pile.length === 0) {
    return {
      scores: s.scores,
      piles: s.piles,
      deck: s.deck,
      drawEmpty: s.drawEmpty,
      returnedCard: null,
    };
  }
  const nextPile = pile.slice();
  const card = nextPile.pop()!;
  const deck = [...s.deck, card];
  return {
    scores: replaceAt(s.scores, by, (s.scores[by] ?? 0) - 1),
    piles: replaceAt(s.piles, by, nextPile),
    deck,
    drawEmpty: deck.length === 0,
    returnedCard: card,
  };
}

function withGameOverAnnounce(s: State): State {
  const top = Math.max(...s.scores);
  const winners = s.scores
    .map((v, i) => (v === top ? i : -1))
    .filter((i) => i !== -1);
  const outcome =
    winners.length === 1
      ? `${s.names[winners[0]]} wins! ${s.scores.join("–")}`
      : `Tie ${s.scores.join("–")}`;
  return {
    ...s,
    phase: "GAME_OVER",
    message: `Game over — ${outcome}`,
    messageType: "info",
    inFlight: null,
    peekingCard: null,
    claimBy: null,
  };
}

function startRound(s: State, winnerIndex: number | null): State {
  const hasCards = s.grid.some((c) => c !== null);
  const filled = s.grid.filter((c) => c !== null).length;
  if (!hasCards && s.deck.length === 0) return withGameOverAnnounce(s);
  if (filled < 2 && s.deck.length === 0) return withGameOverAnnounce(s);

  const candidate =
    winnerIndex !== null ? winnerIndex : (s.roller + 1) % s.seatCount;
  // If the candidate roller is disconnected, hop forward to the next connected
  // seat. Bounded by nextConnected.
  const nextRoller = s.disconnected[candidate]
    ? nextConnected(candidate, s.seatCount, s.disconnected)
    : candidate;
  return {
    ...s,
    phase: "AWAITING_ROLL",
    roller: nextRoller,
    flipper: nextRoller,
    wrongBy: emptyWrongBy(s.seatCount),
    // `disconnected` is persistent — do NOT reset it here.
    flippedThisCycle: new Set(),
    flipsThisTurn: 0,
    claimedThisCycle: false,
    selectedCards: [],
    matchedCards: new Set(),
    inFlight: null,
    peekingCard: null,
    roundNum: s.roundNum + 1,
    roundsSinceClaim: winnerIndex !== null ? 0 : s.roundsSinceClaim,
    // v6.6: a correct claim always clears the quiet-rotation counter. Any
    // other route leaves it as cycleAdvance set it — never reset blindly.
    quietRotations: winnerIndex !== null ? 0 : s.quietRotations,
    claimBy: null,
  };
}

/**
 * A legal card for a seat is a filled grid slot that is not locked out for
 * that seat by an earlier wrong claim this round.
 */
function hasLegalCard(s: State, seat: number): boolean {
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== null && !s.wrongBy[seat]?.has(i)) return true;
  }
  return false;
}

function cycleAdvance(s: State, addWho: number): State {
  const flipped = new Set(s.flippedThisCycle);
  flipped.add(addWho);
  // Cycle ends when every CONNECTED seat has flipped this cycle. Disconnected
  // seats never contribute a flip, so counting them would stall the loop.
  const conn = Math.max(1, connectedCount(s.seatCount, s.disconnected));
  if (flipped.size >= conn) {
    const noClaim = !s.claimedThisCycle;
    // v6.6: the rotation backstop no longer ends the game on its own. A quiet
    // rotation with an empty draw pile increments quietRotations; a quiet
    // rotation with cards still in the pile resets it. Only the SECOND
    // consecutive quiet rotation on an empty pile ends the game. Unmatched
    // cards are stranded and score for nobody.
    if (noClaim) {
      const q = s.drawEmpty ? s.quietRotations + 1 : 0;
      if (q >= 2) {
        return withGameOverAnnounce({
          ...s,
          flippedThisCycle: new Set(),
          roundsSinceClaim: s.roundsSinceClaim + 1,
          quietRotations: q,
        });
      }
      return startRound({ ...s, flippedThisCycle: flipped, quietRotations: q }, null);
    }
    return startRound({ ...s, flippedThisCycle: flipped }, null);
  }
  const next = nextConnected(s.flipper, s.seatCount, s.disconnected);
  return {
    ...s,
    flipper: next,
    flipsThisTurn: 0,
    flippedThisCycle: flipped,
    inFlight: null,
    peekingCard: null,
  };
}

function replaceAt<T>(arr: T[], idx: number, value: T): T[] {
  const out = arr.slice();
  out[idx] = value;
  return out;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT":
      return initialState(action.slotCount, {
        seatCount: action.seatCount ?? state.seatCount,
        names: action.names ?? state.names,
        seed: action.seed,
      });

    case "TUMBLE":
      if (!state.rolling) return state;
      return { ...state, dieValues: action.values };

    case "ROLL_START":
      if (state.phase !== "AWAITING_ROLL") return state;
      return { ...state, rolling: true };

    case "ROLL_LAND": {
      if (!state.rolling) return state;
      return { ...state, dieValues: action.values, rule: action.rule };
    }

    case "ROLL_SETTLE": {
      if (!state.rolling) return state;
      return { ...state, rolling: false, phase: "FLIPPING", flipper: state.roller };
    }

    case "PLAYER_ENTER_CLAIM": {
      if (state.phase !== "FLIPPING") return state;
      // v6.7: claiming never consumes a flip. flippedThisCycle and
      // flipsThisTurn are left exactly as they were.
      return {
        ...state,
        phase: "CLAIM_SELECTING",
        inFlight: null,
        peekingCard: null,
        selectedCards: [],
        matchedCards: new Set(),
        claimBy: action.by,
        message: "Select 2 cards that match the rule.",
        messageType: "info",
      };
    }

    case "PLAYER_SELECT_CARD": {
      if (state.phase !== "CLAIM_SELECTING") return state;
      if (state.claimBy !== action.by) return state;
      const idx = action.idx;
      if (state.wrongBy[action.by]?.has(idx)) return state;
      if (state.selectedCards.includes(idx)) return state;
      if (state.grid[idx] === null) return state;
      if (state.selectedCards.length >= 2) return state;
      return { ...state, selectedCards: [...state.selectedCards, idx] };
    }


    case "PLAYER_RESOLVE_MATCH": {
      if (state.phase !== "CLAIM_SELECTING") return state;
      if (state.claimBy !== action.by) return state;
      if (state.selectedCards.length !== 2) return state;
      const by = action.by;
      const [ia, ib] = state.selectedCards;
      const a = state.grid[ia];
      const b = state.grid[ib];
      if (a && b && cardsMatchRule(a, b, state.rule)) {
        const scores = replaceAt(state.scores, by, (state.scores[by] ?? 0) + 2);
        const piles = replaceAt(state.piles, by, [
          ...(state.piles[by] ?? []),
          a,
          b,
        ]);
        // Do NOT refill or start the round yet — hold in SETTLING so the
        // matched pair stays in place, face-up, while the Great Match
        // animation plays. SETTLE_COMPLETE does the refill + startRound.
        return {
          ...state,
          phase: "SETTLING",
          settleKind: "MATCH",
          settleToken: state.settleToken + 1,
          settleBy: by,
          scores,
          piles,
          matchedCards: new Set(state.selectedCards),
          selectedCards: [],
          claimedThisCycle: true,
          claimBy: null,
          inFlight: null,
          peekingCard: null,
          message: `${state.names[by]} — match! +2`,
          messageType: "success",
        };
      }
      // Wrong claim
      const wrongForBy = new Set(state.wrongBy[by] ?? []);
      wrongForBy.add(ia);
      wrongForBy.add(ib);
      const nextWrongBy = state.wrongBy.slice();
      nextWrongBy[by] = wrongForBy;
      const returned = returnOneCard(state, by);

      const post: State = {
        ...state,
        phase: "SETTLING",
        settleKind: "WRONG",
        settleToken: state.settleToken + 1,
        settleBy: by,
        wrongBy: nextWrongBy,
        wrongCalls: state.wrongCalls + 1,
        scores: returned.scores,
        piles: returned.piles,
        deck: returned.deck,
        drawEmpty: returned.drawEmpty,
        selectedCards: [],
        matchedCards: new Set(),
        claimBy: null,
        message: returned.returnedCard
          ? `${state.names[by]} — no match. One card back to the pile.`
          : `${state.names[by]} — no match.`,
        messageType: "error",
      };
      return post;
    }

    // Ends the feedback hold. Token-guarded so a stale timer from an earlier
    // settle can never advance the board twice.
    case "SETTLE_COMPLETE": {
      if (state.phase !== "SETTLING") return state;
      if (state.settleToken !== action.token) return state;
      if (state.settleKind === "MATCH") {
        const idxs = Array.from(state.matchedCards);
        const { grid: newGrid, deck: newDeck } = refill(state.grid, state.deck, idxs);
        const draining = newDeck.length === 0;
        const post: State = {
          ...state,
          grid: newGrid,
          deck: newDeck,
          drawEmpty: state.drawEmpty || draining,
          settleKind: null,
          settleBy: null,
        };
        return startRound(post, state.settleBy);
      }
      return {
        ...state,
        phase: "FLIPPING",
        settleKind: null,
        settleBy: null,
      };
    }



    case "FLIP_START": {
      if (state.phase !== "FLIPPING") return state;
      if (state.flipper !== action.by) return state;
      if (state.inFlight) return state;
      if (state.wrongBy[action.by]?.has(action.idx)) return state;
      if (state.grid[action.idx] === null) return state;
      return {
        ...state,
        inFlight: {
          kind: "flip",
          token: action.token,
          by: action.by,
          idx: action.idx,
        },
        peekingCard: action.idx,
      };
    }


    case "FLIP_COMPLETE": {
      if (state.inFlight?.kind !== "flip") return state;
      if (state.inFlight.token !== action.token) return state;
      const who = state.inFlight.by;
      // v6.7: a turn is two flips. Stay with the same flipper for the second
      // flip when one is still available and a legal card remains.
      const flips = state.flipsThisTurn + 1;
      const mid: State = { ...state, flipsThisTurn: flips };
      if (flips < FLIPS_PER_TURN && hasLegalCard(mid, who)) {
        return {
          ...mid,
          phase: "FLIPPING",
          inFlight: null,
          peekingCard: null,
        };
      }
      return cycleAdvance(mid, who);
    }

    case "SKIP_TICK": {
      if (state.phase !== "FLIPPING") return state;
      if (state.inFlight) return state;
      const who = state.flipper;
      // v6.7: a seat cannot take its flip turn when it is disconnected, or
      // when every remaining card is locked out for it by earlier wrong
      // claims. SKIP_TICK advances the rotation past it, and that turn still
      // counts toward the no-claim rotation backstop.
      if (!state.disconnected[who] && hasLegalCard(state, who)) return state;
      return cycleAdvance(state, who);
    }

    case "CLAIM_START": {
      if (state.phase !== "FLIPPING" && state.phase !== "CLAIM_SELECTING") return state;
      if (state.phase === "CLAIM_SELECTING") return state;
      if (state.grid[action.a] === null || state.grid[action.b] === null) return state;
      if (
        state.wrongBy[action.by]?.has(action.a) ||
        state.wrongBy[action.by]?.has(action.b)
      )
        return state;

      // v6.7: claiming never consumes a flip — flippedThisCycle untouched.
      return {
        ...state,
        phase: "CLAIM_RESOLVING",
        peekingCard: null,
        claimBy: action.by,
        inFlight: {
          kind: "claim",
          token: action.token,
          by: action.by,
          a: action.a,
          b: action.b,
        },
      };
    }

    case "CLAIM_RESOLVE": {
      if (state.inFlight?.kind !== "claim") return state;
      if (state.inFlight.token !== action.token) return state;
      const { by, a, b } = state.inFlight;
      const cardA = state.grid[a];
      const cardB = state.grid[b];
      if (cardA && cardB && cardsMatchRule(cardA, cardB, state.rule)) {
        const scores = replaceAt(state.scores, by, (state.scores[by] ?? 0) + 2);
        const piles = replaceAt(state.piles, by, [
          ...(state.piles[by] ?? []),
          cardA,
          cardB,
        ]);
        const { grid: newGrid, deck: newDeck } = refill(state.grid, state.deck, [a, b]);
        const draining = newDeck.length === 0;
        const post: State = {
          ...state,
          scores,
          piles,
          grid: newGrid,
          deck: newDeck,
          claimedThisCycle: true,
          drawEmpty: state.drawEmpty || draining,
          message: `${state.names[by]} — match! +2`,
          messageType: "success",
          inFlight: null,
          claimBy: null,
        };
        return startRound(post, by);
      }
      const wrongForBy = new Set(state.wrongBy[by] ?? []);
      wrongForBy.add(a);
      wrongForBy.add(b);
      const nextWrongBy = state.wrongBy.slice();
      nextWrongBy[by] = wrongForBy;
      const returned = returnOneCard(state, by);

      const post: State = {
        ...state,
        phase: "FLIPPING",
        wrongBy: nextWrongBy,
        wrongCalls: state.wrongCalls + 1,
        scores: returned.scores,
        piles: returned.piles,
        deck: returned.deck,
        drawEmpty: returned.drawEmpty,
        inFlight: null,
        claimBy: null,
        message: returned.returnedCard
          ? `${state.names[by]} — no match. One card back to the pile.`
          : `${state.names[by]} — no match.`,
        messageType: "info",
      };
      return post;
    }

    case "SAFETY_SWAP":
      return {
        ...state,
        grid: action.grid,
        deck: action.deck,
        message: "Refreshing grid — no possible matches!",
        messageType: "warning",
      };

    case "REMOVE_MATCHED": {
      if (state.matchedCards.size === 0) return state;
      const g = [...state.grid];
      state.matchedCards.forEach((i) => { g[i] = null; });
      return { ...state, grid: g };
    }

    // Debug-only: shrink the draw pile so the end-game can be reached quickly.
    // No-op unless ?debug=1 is on. Grid, scores, roller and phase untouched.
    case "DEBUG_DRAIN_DECK": {
      if (!debugFlagOn()) return state;
      if (state.deck.length <= 2) return state;
      return { ...state, deck: state.deck.slice(0, 2) };
    }

    // Debug-only: put the table in the exact state the end-game trigger fires
    // from — empty draw pile, one card left on the grid. Scores, seats, names
    // and round number are untouched, so the next completed rotation with no
    // correct claim ends the game through the normal cycleAdvance path.
    case "DEBUG_FORCE_END_GAME": {
      if (!debugFlagOn()) return state;
      const keep = state.grid.findIndex((c) => c !== null);
      const grid = state.grid.map((c, i) => (i === keep ? c : null));
      return { ...state, grid, deck: [], drawEmpty: true };
    }

    case "SET_MESSAGE":
      return { ...state, message: action.message, messageType: action.messageType };

    // Cancel-claim: a claim INTERRUPTS an in-progress FLIPPING turn; per the
    // rulebook, cancelling returns control to whoever was flipping so they
    // finish their turn. flipper stays put. No skip penalty; cancelling is
    // penalty-free. flippedThisCycle is untouched (the interrupted flip did
    // not complete). claimBy transitions non-null → null, which the host
    // hook watches to bump claimWindow so the consumed claim_locks row is
    // rotated past.
    case "CANCEL_CLAIM": {
      if (state.phase !== "CLAIM_SELECTING") return state;
      if (state.claimBy !== action.by) return state;
      return {
        ...state,
        phase: "FLIPPING",
        selectedCards: [],
        matchedCards: new Set(),
        peekingCard: null,
        inFlight: null,
        claimBy: null,
        message: `${state.names[action.by]} — cancelled.`,
        messageType: "info",
      };
    }

    // SET_DISCONNECTED uses REPLACE semantics — the payload is the complete
    // current set of disconnected seats, not a delta. Idempotent, and gives
    // reconnection for free (a seat missing from `seats` becomes connected).
    // If the current roller is now disconnected while AWAITING_ROLL, reassign
    // the roll to the next connected seat so the game never stalls waiting
    // for a roll that will never come.
    case "SET_DISCONNECTED": {
      const disconnected = Array(state.seatCount).fill(false) as boolean[];
      for (const s of action.seats) {
        if (s >= 0 && s < state.seatCount) disconnected[s] = true;
      }
      let out: State = { ...state, disconnected };
      if (
        out.phase === "AWAITING_ROLL" &&
        disconnected[out.roller] &&
        connectedCount(out.seatCount, disconnected) > 0
      ) {
        const nr = nextConnected(out.roller, out.seatCount, disconnected);
        out = { ...out, roller: nr, flipper: nr };
      }
      return out;
    }

    // Host policy: when the table empties (fewer than 2 connected seats),
    // cleanly end the game with a clear message rather than leaving a lone
    // player staring at a live-looking board. Not a normal completion.
    case "END_GAME_TABLE_EMPTY": {
      return {
        ...state,
        phase: "GAME_OVER",
        message: "Game ended — not enough players remain.",
        messageType: "warning",
        inFlight: null,
        peekingCard: null,
        claimBy: null,
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseGameStateOptions {
  seatCount?: number;
  botSeats?: number[];
  names?: string[];
  /** Optional reproducible seed (daily puzzle). Omitted = Math.random. */
  seed?: string;
}

export function useGameState(
  gridSize: "3x2" | "3x3" = "3x2",
  opts: UseGameStateOptions = {}
) {
  const slotCount = gridSize === "3x3" ? 9 : 6;
  const seatCount = opts.seatCount ?? 2;
  const botSeats = opts.botSeats ?? [1];
  const names = opts.names ?? defaultNames(seatCount);
  const botSeatSet = useMemo(() => new Set(botSeats), [botSeats.join(",")]);
  const humanSeat = useMemo(() => {
    for (let i = 0; i < seatCount; i++) if (!botSeatSet.has(i)) return i;
    return 0;
  }, [seatCount, botSeatSet]);
  // The scheduling bot seat (single-bot memory scheduler preserves today's
  // behaviour verbatim at N=2, botSeats=[1]). Multi-bot memory is out of scope.
  const schedulerBot = botSeats.length > 0 ? botSeats[0] : -1;

  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => initialState(slotCount, { seatCount, names, seed: opts.seed })
  );

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const tokenRef = useRef(0);
  const nextToken = () => ++tokenRef.current;

  const memoryRef = useRef<OpponentMemory | null>(null);
  if (botSeats.length > 0 && memoryRef.current === null) {
    memoryRef.current = createOpponentMemory();
  }
  const prevPeekingRef = useRef<number | null>(null);
  const prevGridRef = useRef<(Card | null)[]>(state.grid);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppClaimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppClaimResolveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-INIT when EITHER the grid size OR the seat count changes. Multiplayer
  // mounts this hook with seatCount=2 (empty frozenSeats) before "Lets do it!"
  // fills the seat map; on that transition we must re-init so the reducer's
  // seat-indexed arrays (scores, skip, wrongBy, disconnected) grow to match.
  const initKeyRef = useRef(`${slotCount}:${seatCount}`);
  useEffect(() => {
    const key = `${slotCount}:${seatCount}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    memoryRef.current?.reset();
    prevPeekingRef.current = null;
    dispatch({ type: "INIT", slotCount, seatCount, names, seed: opts.seed });
  }, [slotCount, seatCount, names, opts.seed]);


  const runRollAnimation = useCallback((predetermined?: string[]): Promise<string[]> => {
    return new Promise((resolve) => {
      dispatch({ type: "ROLL_START" });
      const count = getDieCount();
      const finalValues =
        predetermined && predetermined.length === count
          ? predetermined
          : rollRandomAttributes(count, rngOf(stateRef.current));
      const { rule } = computeRule(finalValues);
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = setInterval(() => {
        dispatch({ type: "TUMBLE", values: rollRandomAttributes(count) });
      }, 100);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = setTimeout(() => {
        rollTimeoutRef.current = null;
        if (rollIntervalRef.current) {
          clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        dispatch({ type: "ROLL_LAND", values: finalValues, rule });
        if (rollSettleRef.current) clearTimeout(rollSettleRef.current);
        // Total ROLLING-phase duration (tumble + hold + land) is
        // ROLL_HERO_MS. The reducer must match the overlay so the server
        // does not unlock flips/claims before the die has visually landed.
        rollSettleRef.current = setTimeout(() => {
          rollSettleRef.current = null;
          dispatch({ type: "ROLL_SETTLE" });
          resolve(rule);
        }, ROLL_HERO_MS - 450);
      }, 450);
    });
  }, []);

  const rollDice = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== "AWAITING_ROLL") return;
    if (s.roller !== humanSeat) return;
    if (s.rolling) return;
    await runRollAnimation();
  }, [runRollAnimation, humanSeat]);

  const doRollDice = runRollAnimation;

  // Bot auto-roll
  useEffect(() => {
    if (state.phase !== "AWAITING_ROLL") return;
    if (!botSeatSet.has(state.roller)) return;
    if (state.rolling) return;
    const t = setTimeout(() => {
      runRollAnimation();
    }, OPPONENT_TUNING.thinkDelayMs);
    return () => clearTimeout(t);
  }, [state.phase, state.roller, state.rolling, runRollAnimation, botSeatSet]);

  const peekCard = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.phase !== "FLIPPING") return;
    if (s.flipper !== humanSeat) return;
    if (s.inFlight) return;
    if (s.wrongBy[humanSeat].has(index)) return;
    if (s.grid[index] === null) return;
    const token = nextToken();
    dispatch({ type: "FLIP_START", by: humanSeat, idx: index, token });
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => {
      peekTimerRef.current = null;
      dispatch({ type: "FLIP_COMPLETE", token });
    }, REVEAL_MS);
  }, [humanSeat]);

  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (state.inFlight) return;
    // Auto-tick past a disconnected flipper so the round never hard-stops.
    if (!state.disconnected[state.flipper]) return;
    dispatch({ type: "SKIP_TICK" });
  }, [state.phase, state.flipper, state.inFlight, state.disconnected]);

  // Bot auto-flip
  const inFlightNullMarker = state.inFlight === null;
  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (!botSeatSet.has(state.flipper)) return;
    if (!inFlightNullMarker) return;
    const botSeat = state.flipper;
    if (oppDelayRef.current) clearTimeout(oppDelayRef.current);
    oppDelayRef.current = setTimeout(() => {
      oppDelayRef.current = null;
      const s = stateRef.current;
      if (s.phase !== "FLIPPING" || s.flipper !== botSeat || s.inFlight) return;
      const candidates = s.grid
        .map((c, i) => (c !== null && !s.wrongBy[botSeat].has(i) ? i : -1))
        .filter((i) => i !== -1);
      if (candidates.length === 0) {
        dispatch({ type: "SKIP_TICK" });
        return;
      }
      const unknown = candidates.filter(
        (i) => memoryRef.current?.recall(i) == null
      );
      const pool = unknown.length > 0 ? unknown : candidates;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const token = nextToken();
      dispatch({ type: "FLIP_START", by: botSeat, idx: pick, token });
      if (oppRevealRef.current) clearTimeout(oppRevealRef.current);
      oppRevealRef.current = setTimeout(() => {
        oppRevealRef.current = null;
        dispatch({ type: "FLIP_COMPLETE", token });
      }, REVEAL_MS);
    }, OPPONENT_TUNING.thinkDelayMs);
    return () => {
      if (oppDelayRef.current) {
        clearTimeout(oppDelayRef.current);
        oppDelayRef.current = null;
      }
    };
  }, [state.phase, state.flipper, inFlightNullMarker, botSeatSet]);

  const enterClaimMode = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "CLAIM_SELECTING" || s.phase === "CLAIM_RESOLVING") return;
    if (s.phase === "GAME_OVER") return;
    if (s.rolling) return;
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    if (s.phase === "AWAITING_ROLL") return;
    dispatch({ type: "PLAYER_ENTER_CLAIM", by: humanSeat });
  }, [runRollAnimation, humanSeat]);

  const selectCard = useCallback((index: number) => {
    dispatch({ type: "PLAYER_SELECT_CARD", by: humanSeat, idx: index });
  }, [humanSeat]);

  const resolveMatch = useCallback(() => {
    dispatch({ type: "PLAYER_RESOLVE_MATCH", by: humanSeat });
  }, [humanSeat]);

  const opponentClaim = useCallback((a: number, b: number) => {
    const s = stateRef.current;
    if (s.phase !== "FLIPPING") return;
    if (schedulerBot < 0) return;
    if (a === b) return;
    if (s.grid[a] === null || s.grid[b] === null) return;
    if (s.wrongBy[schedulerBot].has(a) || s.wrongBy[schedulerBot].has(b)) return;
    const token = nextToken();
    dispatch({ type: "CLAIM_START", by: schedulerBot, a, b, token });
    if (oppClaimResolveRef.current) clearTimeout(oppClaimResolveRef.current);
    oppClaimResolveRef.current = setTimeout(() => {
      oppClaimResolveRef.current = null;
      dispatch({ type: "CLAIM_RESOLVE", token });
    }, 1600);
  }, [schedulerBot]);

  const resolveOpponentClaim = useCallback(() => {}, []);

  // v6.5: Last Call removed. Retained as a no-op so the retiring
  // GameWindow.tsx keeps compiling until it is removed.
  const claimLastCall = useCallback((_a: number, _b: number) => {}, []);

  const removeMatchedFromGrid = useCallback(() => {
    dispatch({ type: "REMOVE_MATCHED" });
  }, []);

  // Dead-grid safety valve
  useEffect(() => {
    if (
      state.phase === "GAME_OVER" ||
      state.phase === "CLAIM_SELECTING" ||
      state.phase === "CLAIM_RESOLVING" ||
      state.rolling
    ) {
      return;
    }
    const grid = state.grid;
    const deck = state.deck;
    if (!grid.some((c) => c !== null)) return;
    if (deck.length === 0) return;
    if (hasAnyValidPair(grid)) return;
    const filledIndices = grid
      .map((c, i) => (c !== null ? i : -1))
      .filter((i) => i !== -1);
    if (filledIndices.length < 2 || deck.length < 2) return;
    // Seed-aware: draws from the state rng so a reshuffle stays reproducible.
    const swapped = computeSafetySwap(grid, deck, rngOf(state));
    dispatch({ type: "SAFETY_SWAP", grid: swapped.grid, deck: swapped.deck });
  }, [state.grid, state.deck, state.phase, state.rolling]);

  // Bot memory — only if any bot seat exists
  useEffect(() => {
    if (!memoryRef.current) return;
    const prev = prevGridRef.current;
    for (let i = 0; i < state.grid.length; i++) {
      const pc = prev[i] ?? null;
      const cc = state.grid[i] ?? null;
      if ((pc?.id ?? null) !== (cc?.id ?? null)) {
        memoryRef.current.forget(i);
      }
    }
    prevGridRef.current = state.grid;
  }, [state.grid]);

  useEffect(() => {
    if (!memoryRef.current) return;
    if (schedulerBot < 0) return;
    const prev = prevPeekingRef.current;
    prevPeekingRef.current = state.peekingCard;
    if (prev === null || state.peekingCard !== null) return;
    const card = state.grid[prev];
    memoryRef.current.decayAll();
    if (card) memoryRef.current.observe(prev, card);

    if (state.phase !== "FLIPPING" || state.inFlight) return;
    const excluded = new Set<number>(state.wrongBy[schedulerBot]);
    state.grid.forEach((c, i) => { if (c === null) excluded.add(i); });
    const best = memoryRef.current.bestPair(state.rule, excluded);
    if (!best || best.confidence < OPPONENT_TUNING.confidenceThreshold) return;
    const span = OPPONENT_TUNING.reactionMaxMs - OPPONENT_TUNING.reactionMinMs;
    const t = Math.max(
      0,
      Math.min(
        1,
        (best.confidence - OPPONENT_TUNING.confidenceThreshold) /
          (2 - OPPONENT_TUNING.confidenceThreshold)
      )
    );
    const delay = OPPONENT_TUNING.reactionMaxMs - t * span;
    if (oppClaimTimerRef.current) clearTimeout(oppClaimTimerRef.current);
    oppClaimTimerRef.current = setTimeout(() => {
      oppClaimTimerRef.current = null;
      opponentClaim(best.a, best.b);
    }, delay);
  }, [state.peekingCard, state.grid, state.phase, state.inFlight, state.wrongBy, state.rule, opponentClaim, schedulerBot]);

  useEffect(() => {
    if (oppClaimTimerRef.current) {
      clearTimeout(oppClaimTimerRef.current);
      oppClaimTimerRef.current = null;
    }
  }, [state.roundNum, state.phase]);

  const opponentClaimingValue = useMemo(
    () =>
      state.inFlight?.kind === "claim" && botSeatSet.has(state.inFlight.by)
        ? { indices: [state.inFlight.a, state.inFlight.b] as [number, number] }
        : null,
    [state.inFlight, botSeatSet]
  );

  const wrongCardsUnion = useMemo(() => {
    const u = new Set<number>();
    for (const s of state.wrongBy) s.forEach((i) => u.add(i));
    return u;
  }, [state.wrongBy]);

  return {
    // Multiplayer escape hatches — host uses these to broadcast state and
    // inject validated intents from joiners. Do NOT use in single-player UI.
    state,
    dispatch,

    deck: state.deck,
    grid: state.grid,
    matchRule: state.rule,
    dieValues: state.dieValues,
    scores: state.scores,
    roundNum: state.roundNum,
    players: state.names,
    rollerIndex: state.roller,
    flipperIndex: state.flipper,
    // v6.5: no lockout. Retained for the retiring GameWindow.tsx.
    skipNextFlip: state.disconnected,
    peekingCard: state.peekingCard,
    claimMode: state.phase === "CLAIM_SELECTING",
    selectedCards: state.selectedCards,
    wrongCards: wrongCardsUnion,
    wrongByMe: state.wrongBy[humanSeat] ?? new Set<number>(),
    matchedCards: state.matchedCards,
    gameOver: state.phase === "GAME_OVER",
    message: state.message,
    messageType: state.messageType,
    rolling: state.rolling,
    peekCard,
    enterClaimMode,
    selectCard,
    removeMatchedFromGrid,
    resolveMatch,
    doRollDice,
    opponentClaiming: opponentClaimingValue,
    opponentClaim,
    resolveOpponentClaim,
    rollPhase: state.phase === "AWAITING_ROLL",
    rollDice,
    lastCall: false as boolean,
    allFaceUp: state.allFaceUp,
    drawEmpty: state.drawEmpty,
    roundsSinceClaim: state.roundsSinceClaim,
    claimLastCall,
  };
}
