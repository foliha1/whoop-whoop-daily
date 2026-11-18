// ============================================================================
// dailyEngine — the daily puzzle's own tiny state machine.
//
// The daily is NOT a game of Whoop! Whoop!: it is one recall test with three
// rule changes. There is no draw pile, no refills, no re-rolls, no bot.
//
// Sequence (see DailyPhase):
//   READY    static start gate; nothing runs until START
//   DEAL     nine cards deal face down (3×3)
//   STUDY    all nine flip face up and hold for STUDY_MS with a countdown
//   HIDE     all nine flip back face down
//   ROLL     the die rolls for the current round (clock paused)
//   PLAY     player taps two cards; the second tap locks the claim (one peek per run)
//   WHOOPED  the round ran out of misses: it ends with the board untouched
//   DONE     all three rounds played out
//
// Misses are capped PER ROUND (MISSES_PER_ROUND). A wrong pair spends one of
// the round's two misses and play continues in that round. The second miss
// Whoops the round: nothing is revealed and nothing leaves the board — the
// round simply ends and the next one rolls. Only a solve shrinks the board, so
// a clean run plays 9 → 7 → 5 while a failed round keeps its cards in play.
// The run never ends early — every player plays all three rounds.
//
// All three die rolls are drawn from the daily seed at init time and validated
// so that every reachable board still holds a pair for that round's rule.
// ============================================================================

import { createDeck, type Card } from "@/cardData";
import { createRng, type Rng } from "@/lib/rng";
import { pickRoll } from "@/lib/rolls";
import type { RollAttribute } from "@/lib/multiplayer";

export const STUDY_MS = 10000;
/** Misses allowed in each round. The third miss is impossible — 2 Whoops it. */
export const MISSES_PER_ROUND = 2;
/** How long the whole remaining board stays face up during a peek. */
export const PEEK_MS = 5000;
export const DAILY_SLOTS = 9;
export const DAILY_ROUNDS = 3;

export const DAILY_ROLL_ATTRS: readonly RollAttribute[] = [
  "SHAPE",
  "NUMBER",
  "COLOR",
] as const;

export type DailyPhase =
  | "READY"
  | "DEAL"
  | "STUDY"
  | "HIDE"
  | "ROLL"
  | "PLAY"
  | "WHOOPED"
  | "DONE";

export interface DailyRoll {
  attribute: RollAttribute;
  faceIndex: 0 | 1;
}

/** One entry per resolved call within a round, in the order they happened. */
export type DailyMark = "MISS" | "SOLVE";

export interface DailyState {
  phase: DailyPhase;
  /** Fixed nine slots; a slot becomes null once its card leaves the board. */
  grid: (Card | null)[];
  faceUp: boolean;
  /** The three rolls for the day, decided at init from the seed. */
  rolls: DailyRoll[];
  /** 1-based round, 1 → 3. */
  roundIndex: number;
  selected: number[];
  /** Misses spent in the current round. Resets each round, caps at 2. */
  roundMisses: number;
  /** Misses spent across the whole run. */
  totalMisses: number;
  /** Rounds solved by a correct call, 0 → 3. */
  roundsSolved: number;
  /** Per-round event lists, index 0 = round 1. */
  roundEvents: DailyMark[][];
  /** One peek per run. */
  peekUsed: boolean;
  /** The round the peek was used in, or null. */
  peekRound: number | null;
  /** True while the peek reveal is showing. */
  peeking: boolean;
  /** True when no round was solved. */
  failed: boolean;
  /** Bumps on every wrong call so the UI can replay its shake. */
  wrongToken: number;
  /** Indices that were just called wrong (cleared by CLEAR_WRONG). */
  wrongPair: number[];
  /** Indices of the pair that just matched (cleared by CLEAR_MATCH). */
  matchedPair: number[];
  /** Wall-clock ms when the running clock last started. Null while paused. */
  startedAt: number | null;
  /** Clock time banked from completed rounds, in ms. */
  accumulatedMs: number;
  /** Final total time. Null until DONE. Recorded but never scored. */
  elapsedMs: number | null;
}

export type DailyAction =
  | { type: "START" }
  | { type: "REVEAL" }
  | { type: "HIDE" }
  | { type: "ROLL_START" }
  | { type: "PLAY_START"; at: number }
  | { type: "SELECT"; idx: number }
  | { type: "RESOLVE"; at: number }
  | { type: "PEEK" }
  | { type: "PEEK_END" }
  | { type: "ROUND_END"; at: number }
  | { type: "CLEAR_WRONG" }
  | { type: "CLEAR_MATCH" };

export function matchesOn(a: Card, b: Card, attr: RollAttribute): boolean {
  if (attr === "SHAPE") return a.shape === b.shape;
  if (attr === "NUMBER") return a.number === b.number;
  return a.color === b.color;
}

/** Every unordered pair of card indices matching `attr` on the given board. */
export function pairsFor(
  board: (Card | null)[],
  attr: RollAttribute
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < board.length; i++) {
    const a = board[i];
    if (!a) continue;
    for (let j = i + 1; j < board.length; j++) {
      const b = board[j];
      if (!b) continue;
      if (matchesOn(a, b, attr)) out.push([i, j]);
    }
  }
  return out;
}

function without(board: (Card | null)[], i: number, j: number): (Card | null)[] {
  const next = [...board];
  next[i] = null;
  next[j] = null;
  return next;
}

/**
 * True when the three rolls are solvable no matter which valid pair the player
 * removes each round. Exhaustive — the board is tiny.
 */
export function rollsAreSolvable(
  board: (Card | null)[],
  rolls: DailyRoll[]
): boolean {
  const walk = (b: (Card | null)[], round: number): boolean => {
    if (round >= rolls.length) return true;
    const options = pairsFor(b, rolls[round].attribute);
    if (options.length === 0) return false;
    return options.every(([i, j]) => walk(without(b, i, j), round + 1));
  };
  return walk(board, 0);
}

/** Re-draws allowed when a round repeats the previous round's attribute. */
const REPEAT_REDRAWS = 2;
/** Guard bound on the loop that blocks a third identical attribute. */
const TRIPLE_GUARD = 50;
/** Roll-search attempts per dealt board. */
const ROLL_ATTEMPTS = 500;
/** Boards to try. 5 × 9 = 45 cards of the 48-card seeded deck. */
const MAX_DEALS = 5;

/**
 * Deal the day's nine cards and the day's three dice, all from the seeded
 * stream so every player worldwide gets the identical puzzle.
 */
export function initDailyState(seed: string, rngIn?: Rng): DailyState {
  const rng: Rng = rngIn ?? createRng(seed);
  const deck = createDeck(rng);

  let grid: (Card | null)[] = [];
  let rolls: DailyRoll[] = [];

  for (let deal = 0; deal < MAX_DEALS; deal++) {
    // Redeal takes the NEXT nine cards of the same shuffled deck, so the whole
    // search stays a single deterministic walk of the seeded stream.
    const offset = deal * DAILY_SLOTS;
    const board: (Card | null)[] = deck.slice(offset, offset + DAILY_SLOTS);
    if (board.length < DAILY_SLOTS) break;

    for (let attempt = 0; attempt < ROLL_ATTEMPTS; attempt++) {
      const candidate: DailyRoll[] = [];
      for (let r = 0; r < DAILY_ROUNDS; r++) {
        let roll = pickRoll(DAILY_ROLL_ATTRS, rng);
        // Bounded re-draw: a back-to-back repeat is allowed but unlikely
        // (~7% of days). Two re-draws is the tuning knob.
        for (let i = 0; i < REPEAT_REDRAWS; i++) {
          if (r === 0 || roll.attribute !== candidate[r - 1].attribute) break;
          roll = pickRoll(DAILY_ROLL_ATTRS, rng);
        }
        // Hard block: never three of the same rule in a row.
        if (r === DAILY_ROUNDS - 1 && candidate[0].attribute === candidate[1].attribute) {
          for (let guard = 0; guard < TRIPLE_GUARD; guard++) {
            if (roll.attribute !== candidate[r - 1].attribute) break;
            roll = pickRoll(DAILY_ROLL_ATTRS, rng);
          }
        }
        candidate.push(roll);
      }
      if (rollsAreSolvable(board, candidate)) {
        grid = board;
        rolls = candidate;
        break;
      }
    }
    if (rolls.length > 0) break;
  }

  if (rolls.length === 0) {
    // Unreachable in practice (measured: the first attempt of the first deal
    // always succeeds). Fail loudly rather than commit a broken day.
    throw new Error(`dailyEngine: no solvable roll set for seed "${seed}"`);
  }


  return {
    phase: "READY",
    grid,
    faceUp: false,
    rolls,
    roundIndex: 1,
    selected: [],
    roundMisses: 0,
    totalMisses: 0,
    roundsSolved: 0,
    roundEvents: Array.from({ length: DAILY_ROUNDS }, () => [] as DailyMark[]),
    peekUsed: false,
    peekRound: null,
    peeking: false,
    failed: false,
    wrongToken: 0,
    wrongPair: [],
    matchedPair: [],
    startedAt: null,
    accumulatedMs: 0,
    elapsedMs: null,
  };
}

/** The rule in play for the current round. */
export function currentRoll(state: DailyState): DailyRoll {
  return state.rolls[Math.min(state.roundIndex, DAILY_ROUNDS) - 1];
}

/** Cards still on the board. */
export function remainingCount(state: DailyState): number {
  return state.grid.filter((c) => c !== null).length;
}

/** True when the peek may be taken right now. */
export function canPeek(state: DailyState): boolean {
  return (
    state.phase === "PLAY" &&
    !state.peekUsed &&
    !state.peeking &&
    state.selected.length === 0
  );
}

function pushEvent(state: DailyState, mark: DailyMark): DailyMark[][] {
  return state.roundEvents.map((events, i) =>
    i === state.roundIndex - 1 ? [...events, mark] : events
  );
}

export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "START":
      if (state.phase !== "READY") return state;
      return { ...state, phase: "DEAL" };

    case "REVEAL":
      if (state.phase !== "DEAL") return state;
      return { ...state, phase: "STUDY", faceUp: true };

    case "HIDE":
      if (state.phase !== "STUDY") return state;
      return { ...state, phase: "HIDE", faceUp: false };

    case "ROLL_START":
      if (state.phase !== "HIDE") return state;
      return { ...state, phase: "ROLL" };

    case "PLAY_START":
      if (state.phase !== "ROLL") return state;
      return { ...state, phase: "PLAY", startedAt: action.at };

    case "PEEK":
      if (!canPeek(state)) return state;
      return {
        ...state,
        peeking: true,
        faceUp: true,
        peekUsed: true,
        peekRound: state.roundIndex,
      };

    case "PEEK_END":
      if (!state.peeking) return state;
      return { ...state, peeking: false, faceUp: false };

    case "SELECT": {
      if (state.phase !== "PLAY" || state.peeking) return state;
      if (state.grid[action.idx] == null) return state;
      if (state.selected.length >= 2) return state;
      if (state.selected.includes(action.idx)) {
        return { ...state, selected: state.selected.filter((i) => i !== action.idx) };
      }
      return { ...state, selected: [...state.selected, action.idx] };
    }

    case "RESOLVE": {
      if (state.phase !== "PLAY" || state.selected.length !== 2) return state;
      const [i, j] = state.selected;
      const a = state.grid[i];
      const b = state.grid[j];
      const attr = currentRoll(state).attribute;
      const correct = !!a && !!b && matchesOn(a, b, attr);

      const banked =
        state.accumulatedMs + Math.max(0, action.at - (state.startedAt ?? action.at));

      if (!correct) {
        const roundMisses = state.roundMisses + 1;
        const whooped = roundMisses >= MISSES_PER_ROUND;
        return {
          ...state,
          phase: whooped ? "WHOOPED" : state.phase,
          selected: [],
          wrongPair: [i, j],
          wrongToken: state.wrongToken + 1,
          roundMisses,
          totalMisses: state.totalMisses + 1,
          roundEvents: pushEvent(state, "MISS"),
          startedAt: whooped ? null : state.startedAt,
          accumulatedMs: whooped ? banked : state.accumulatedMs,
        };
      }

      const grid = without(state.grid, i, j);
      const last = state.roundIndex >= DAILY_ROUNDS;
      const roundsSolved = state.roundsSolved + 1;

      return {
        ...state,
        phase: last ? "DONE" : "HIDE",
        roundIndex: last ? state.roundIndex : state.roundIndex + 1,
        roundMisses: last ? state.roundMisses : 0,
        roundsSolved,
        roundEvents: pushEvent(state, "SOLVE"),
        grid,
        selected: [],
        matchedPair: [i, j],
        wrongPair: [],
        failed: last ? roundsSolved === 0 : false,
        startedAt: null,
        accumulatedMs: banked,
        elapsedMs: last ? banked : null,
      };
    }

    // The Whooped round ends with the board untouched: no reveal, no removal.
    case "ROUND_END": {
      if (state.phase !== "WHOOPED") return state;
      const last = state.roundIndex >= DAILY_ROUNDS;
      return {
        ...state,
        phase: last ? "DONE" : "HIDE",
        roundIndex: last ? state.roundIndex : state.roundIndex + 1,
        roundMisses: last ? state.roundMisses : 0,
        wrongPair: [],
        selected: [],
        
        faceUp: false,
        failed: last ? state.roundsSolved === 0 : false,
        startedAt: null,
        elapsedMs: last ? state.accumulatedMs : null,
      };
    }

    case "CLEAR_WRONG":
      return state.wrongPair.length === 0 ? state : { ...state, wrongPair: [] };

    case "CLEAR_MATCH":
      return state.matchedPair.length === 0 ? state : { ...state, matchedPair: [] };

    default:
      return state;
  }
}

/** Live time to display while playing (or the frozen final time when done). */
export function liveElapsedMs(state: DailyState, now: number): number {
  if (state.elapsedMs !== null) return state.elapsedMs;
  const running = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
  return state.accumulatedMs + running;
}

/** `12.3` — seconds to one decimal. */
export function formatSeconds(ms: number): string {
  return (Math.floor(ms / 100) / 10).toFixed(1);
}
