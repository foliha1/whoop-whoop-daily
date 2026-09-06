// ============================================================================
// Property-based / fuzz suite for the Classic reducer.
//
// The reducer is pure and seedable, so we can drive it with randomised but
// LEGAL action sequences from a fixed seed and assert every invariant after
// every single dispatch. Any failure prints the seed plus the exact action
// sequence that produced it.
//
// This file asserts only. It never changes game logic.
// ============================================================================

import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import {
  initialState,
  reducer,
  FLIPS_PER_TURN,
  TARGET_SCORE,
  type Action,
  type State,
} from "@/hooks/useGameState";
import { ALL_CARDS } from "@/cardData";
import type { Card } from "@/cardData";

const TOTAL_CARDS = ALL_CARDS.length; // 48

// ---------------------------------------------------------------------------
// Card accounting
// ---------------------------------------------------------------------------

/**
 * Every card the system currently holds, once.
 *
 * Mid-animation subtlety: on a correct claim the pair is pushed onto the
 * claimant's pile immediately but STAYS on the grid until SETTLE_COMPLETE
 * refills those slots. Those slots are therefore the same physical cards as
 * the last two pile entries and must not be counted twice.
 */
function allCardIds(s: State): string[] {
  const out: string[] = [];
  const heldByMatch = s.settleKind === "MATCH" ? s.matchedCards : new Set<number>();
  s.grid.forEach((c, i) => {
    if (c && !heldByMatch.has(i)) out.push(c.id);
  });
  for (const c of s.deck) out.push(c.id);
  for (const pile of s.piles) for (const c of pile) out.push(c.id);
  return out;
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

interface Ctx {
  prev: State | null;
  action: Action | null;
}

function checkInvariants(s: State, ctx: Ctx): string | null {
  const { prev, action } = ctx;

  // 1 + 2. Conservation and no duplicates.
  const ids = allCardIds(s);
  if (ids.length !== TOTAL_CARDS) {
    return `conservation: ${ids.length} cards accounted for, expected ${TOTAL_CARDS}`;
  }
  if (new Set(ids).size !== ids.length) {
    const seen = new Set<string>();
    const dupe = ids.find((id) => (seen.has(id) ? true : (seen.add(id), false)));
    return `duplicate card ${dupe}`;
  }

  // 3. Score integrity.
  for (let i = 0; i < s.seatCount; i++) {
    if (s.scores[i] < 0) return `seat ${i} score negative (${s.scores[i]})`;
    if (s.scores[i] !== s.piles[i].length) {
      return `seat ${i} score ${s.scores[i]} != pile length ${s.piles[i].length}`;
    }
  }
  if (prev && action && action.type !== "INIT") {
    for (let i = 0; i < s.seatCount; i++) {
      const d = s.scores[i] - (prev.scores[i] ?? 0);
      if (d !== 0 && d !== 2 && d !== -1) {
        return `seat ${i} score moved by ${d} on ${action.type}`;
      }
      if (d === 2 && s.settleKind !== "MATCH") {
        return `seat ${i} gained 2 outside a MATCH settle on ${action.type}`;
      }
      if (d === -1) {
        if (s.settleKind !== "WRONG") {
          return `seat ${i} lost 1 outside a WRONG settle on ${action.type}`;
        }
        if ((prev.scores[i] ?? 0) <= 0) {
          return `seat ${i} penalised from an empty pile`;
        }
      }
    }
  }

  // 4. Empty-pile penalty: a wrong claim by an empty-pile seat still locks.
  if (
    prev &&
    action &&
    s.settleKind === "WRONG" &&
    prev.settleKind !== "WRONG" &&
    s.settleBy !== null
  ) {
    const by = s.settleBy;
    if ((prev.scores[by] ?? 0) === 0) {
      if (s.scores[by] !== 0) return `empty-pile seat ${by} score changed`;
      if (s.piles[by].length !== 0) return `empty-pile seat ${by} pile changed`;
      if (s.deck.length !== prev.deck.length) {
        return `empty-pile penalty returned a card to the draw pile`;
      }
    }
    if ((s.wrongBy[by]?.size ?? 0) < 2) {
      return `wrong claim by seat ${by} did not lock two cards`;
    }
  }

  // 5. Turn structure.
  if (s.flipsThisTurn < 0 || s.flipsThisTurn > FLIPS_PER_TURN) {
    return `flipsThisTurn out of range (${s.flipsThisTurn})`;
  }

  // 8/9. Winner sanity.
  if (s.phase === "GAME_OVER") {
    for (const v of s.scores) {
      if (v > TOTAL_CARDS) return `impossible score ${v}`;
    }
  }

  // 10. Locks clear at round end. A fresh round has no locks and nothing
  // face-up / selected.
  if (prev && s.roundNum > prev.roundNum) {
    for (let i = 0; i < s.seatCount; i++) {
      if (s.wrongBy[i].size !== 0) return `seat ${i} lock survived round end`;
    }
    if (s.selectedCards.length !== 0) return `selection survived round end`;
    if (s.matchedCards.size !== 0) return `matched marks survived round end`;
    if (s.peekingCard !== null) return `face-up peek survived round end`;
    if (s.claimWindowOpen) return `claim window survived round end`;
  }

  // Sanity on internal shape.
  if (s.grid.length !== s.slotCount) return `grid length drifted`;
  if (s.claimBy !== null && s.phase !== "CLAIM_SELECTING" && s.phase !== "CLAIM_RESOLVING") {
    return `claimBy set in phase ${s.phase}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legal action enumeration
// ---------------------------------------------------------------------------

type Rng = () => number;
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

function legalCards(s: State, seat: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== null && !s.wrongBy[seat]?.has(i)) out.push(i);
  }
  return out;
}

function connectedSeats(s: State): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.seatCount; i++) if (!s.disconnected[i]) out.push(i);
  return out;
}

/**
 * Actions that are guaranteed to move the game forward from `s`.
 * Used both to drive the fuzzer and to assert invariant 11 (no hang).
 */
function progressActions(s: State, token: number): Action[] {
  const out: Action[] = [];
  switch (s.phase) {
    case "AWAITING_ROLL":
      if (!s.rolling) out.push({ type: "ROLL_START" });
      else {
        out.push({ type: "ROLL_LAND", values: ["SHAPE"], rule: ["SHAPE"] });
        out.push({ type: "ROLL_SETTLE" });
      }
      break;
    case "FLIPPING": {
      if (s.inFlight?.kind === "flip") {
        out.push({ type: "FLIP_COMPLETE", token: s.inFlight.token });
        break;
      }
      const who = s.flipper;
      const cards = legalCards(s, who);
      if (!s.disconnected[who] && cards.length > 0) {
        for (const idx of cards) out.push({ type: "FLIP_START", by: who, idx, token });
      } else {
        out.push({ type: "SKIP_TICK" });
      }
      break;
    }
    case "CLAIM_SELECTING": {
      const by = s.claimBy!;
      if (s.selectedCards.length === 2) {
        out.push({ type: "PLAYER_RESOLVE_MATCH", by });
      } else {
        const cards = legalCards(s, by).filter((i) => !s.selectedCards.includes(i));
        for (const idx of cards) out.push({ type: "PLAYER_SELECT_CARD", by, idx });
        // Always escapable, even when the claimant has no legal cards left.
        out.push({ type: "CANCEL_CLAIM", by });
        out.push({ type: "CLAIM_ABANDONED", seq: s.claimSeq });
      }
      break;
    }
    case "CLAIM_RESOLVING":
      if (s.inFlight?.kind === "claim") {
        out.push({ type: "CLAIM_RESOLVE", token: s.inFlight.token });
      }
      break;
    case "CLAIM_WINDOW":
      out.push({ type: "CLAIM_WINDOW_EXPIRE", token: s.claimWindowToken });
      break;
    case "SETTLING":
      out.push({ type: "SETTLE_COMPLETE", token: s.settleToken });
      break;
    case "GAME_OVER":
      break;
  }
  return out;
}

/**
 * The full legal-but-not-necessarily-advancing action pool: races, repeats,
 * disconnects, mid-animation claims. Everything a real table can produce.
 */
function noiseActions(s: State, token: number, rng: Rng): Action[] {
  const out: Action[] = [];
  const conn = connectedSeats(s);
  if (conn.length === 0) return out;

  // Claims from any connected seat, in any claimable phase — including during
  // another seat's flip animation, during the settle, and in the rotation
  // claim window.
  if (s.phase === "FLIPPING" || s.phase === "CLAIM_WINDOW") {
    for (const by of conn) {
      out.push({ type: "PLAYER_ENTER_CLAIM", by });
      const cards = legalCards(s, by);
      if (cards.length >= 2) {
        const a = pick(cards, rng);
        const b = pick(cards.filter((i) => i !== a), rng);
        out.push({ type: "CLAIM_START", by, a, b, token });
      }
    }
  }

  // Rapid repeats / illegal-timing presses. The reducer must ignore these.
  if (s.phase === "CLAIM_SELECTING" && s.selectedCards.length > 0) {
    out.push({ type: "PLAYER_SELECT_CARD", by: s.claimBy!, idx: s.selectedCards[0] });
  }
  if (s.phase === "SETTLING") {
    for (const by of conn) out.push({ type: "PLAYER_ENTER_CLAIM", by });
    // Overlap that caused a live bug: window expiry landing during a settle.
    if (s.claimWindowOpen) {
      out.push({ type: "CLAIM_WINDOW_EXPIRE", token: s.claimWindowToken });
    }
  }
  if (s.phase === "CLAIM_SELECTING" && s.claimWindowOpen) {
    out.push({ type: "CLAIM_WINDOW_EXPIRE", token: s.claimWindowToken });
  }
  // Stale tokens / sequences must be inert.
  out.push({ type: "SETTLE_COMPLETE", token: s.settleToken - 1 });
  out.push({ type: "CLAIM_ABANDONED", seq: s.claimSeq - 1 });
  out.push({ type: "CLAIM_WINDOW_EXPIRE", token: s.claimWindowToken - 1 });

  // Disconnect / reconnect churn, including the flipper and the roller.
  if (s.seatCount > 2 || rng() < 0.5) {
    const seats: number[] = [];
    for (let i = 0; i < s.seatCount; i++) if (rng() < 0.22) seats.push(i);
    // Keep at least one seat connected: fewer than two connected is host
    // policy (END_GAME_TABLE_EMPTY), not a reducer state we fuzz through.
    if (seats.length < s.seatCount) out.push({ type: "SET_DISCONNECTED", seats });
  }
  return out;
}

// ---------------------------------------------------------------------------
// One fuzzed game
// ---------------------------------------------------------------------------

interface Failure {
  seed: string;
  seatCount: number;
  reason: string;
  sequence: string[];
}

interface RunResult {
  dispatches: number;
  rounds: number;
  finished: boolean;
  failure: Failure | null;
  /** Longest run of dispatches in which one connected seat never acted. */
  maxRound: number;
}

const MAX_STEPS = 4000;

function runGame(seed: string, seatCount: number): RunResult {
  const rng = mulberry32(
    [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0,
  );
  let s = initialState(9, { seatCount, seed: `${seed}:deck` });
  const log: string[] = [];
  let token = 1;
  let dispatches = 0;
  let maxRound = 0;

  const err0 = checkInvariants(s, { prev: null, action: null });
  if (err0) return { dispatches, rounds: s.roundNum, finished: false, maxRound, failure: { seed, seatCount, reason: err0, sequence: [] } };

  for (let step = 0; step < MAX_STEPS; step++) {
    if (s.phase === "GAME_OVER") break;

    const progress = progressActions(s, token);

    // Invariant 11: no hang. Every reachable non-terminal state must offer at
    // least one action that advances the game.
    if (progress.length === 0) {
      return {
        dispatches,
        rounds: s.roundNum,
        finished: false,
        maxRound,
        failure: {
          seed,
          seatCount,
          reason: `HANG: no legal advancing action in phase ${s.phase} (round ${s.roundNum})`,
          sequence: log.slice(-40),
        },
      };
    }

    const noise = noiseActions(s, token, rng);
    // 35% noise so races and repeats are common but games still terminate.
    const useNoise = noise.length > 0 && rng() < 0.35;
    const action = useNoise ? pick(noise, rng) : pick(progress, rng);
    token++;

    const prev = s;
    const next = reducer(s, action);
    dispatches++;
    log.push(JSON.stringify(action));

    // Invariants 6 + 7 + 8, which need the transition, not just the state.
    const transitionErr = checkTransition(prev, next, action);
    const err = transitionErr ?? checkInvariants(next, { prev, action });
    if (err) {
      return {
        dispatches,
        rounds: next.roundNum,
        finished: false,
        maxRound,
        failure: { seed, seatCount, reason: err, sequence: log.slice(-40) },
      };
    }
    if (next.roundNum > prev.roundNum) maxRound = Math.max(maxRound, step);
    s = next;
  }

  return {
    dispatches,
    rounds: s.roundNum,
    finished: s.phase === "GAME_OVER",
    maxRound,
    failure: null,
  };
}

/** Transition-shaped invariants: claims never cost a flip; round-end causes. */
function checkTransition(prev: State, next: State, action: Action): string | null {
  // 6. Claims never cost a flip.
  const claimish =
    action.type === "PLAYER_ENTER_CLAIM" ||
    action.type === "CLAIM_START" ||
    action.type === "CANCEL_CLAIM" ||
    action.type === "CLAIM_ABANDONED" ||
    action.type === "PLAYER_SELECT_CARD";
  if (claimish && next.roundNum === prev.roundNum) {
    if (next.flipsThisTurn !== prev.flipsThisTurn) {
      return `${action.type} changed flipsThisTurn ${prev.flipsThisTurn}→${next.flipsThisTurn}`;
    }
    if (next.flippedThisCycle.size !== prev.flippedThisCycle.size) {
      return `${action.type} changed flippedThisCycle`;
    }
    if (next.flipper !== prev.flipper) {
      return `${action.type} moved the flipper ${prev.flipper}→${next.flipper}`;
    }
  }

  // 7 + 8. Round end and roller movement.
  if (next.roundNum > prev.roundNum) {
    const viaMatch = prev.settleKind === "MATCH" && action.type === "SETTLE_COMPLETE";
    const viaRotation =
      action.type === "CLAIM_WINDOW_EXPIRE" ||
      action.type === "SETTLE_COMPLETE" ||
      action.type === "CANCEL_CLAIM" ||
      action.type === "CLAIM_ABANDONED" ||
      action.type === "FLIP_COMPLETE" ||
      action.type === "SKIP_TICK";
    if (!viaMatch && !viaRotation) {
      return `round ended on ${action.type}, which is not a legal round-end cause`;
    }
    if (viaMatch) {
      // Claimant becomes the new Roller.
      if (prev.settleBy !== null && next.roller !== prev.settleBy && !next.disconnected[prev.settleBy]) {
        return `roller did not pass to claimant ${prev.settleBy} (got ${next.roller})`;
      }
    } else {
      // No correct claim: the roll passes clockwise to the next connected
      // seat. With only one connected seat there is nowhere for it to go, so
      // it legitimately stays put.
      const conn = connectedSeats(next);
      if (conn.length >= 2 && next.roller === prev.roller) {
        return `roller did not advance after a no-claim rotation (stayed ${next.roller}, connected ${conn.join(",")})`;
      }
      if (conn.length >= 1 && !conn.includes(next.roller)) {
        return `roll passed to disconnected seat ${next.roller}`;
      }
    }

  }

  // 9. Game end causes.
  if (next.phase === "GAME_OVER" && prev.phase !== "GAME_OVER") {
    if (action.type !== "END_GAME_TABLE_EMPTY") {
      const reachedTarget = next.scores.some((v) => v >= TARGET_SCORE);
      const filled = next.grid.filter((c) => c !== null).length;
      const degenerate = next.deck.length === 0 && filled < 2;
      const dead =
        next.deck.length === 0 &&
        !hasAnySharedAttribute(next.grid.filter((c): c is Card => c !== null));
      if (!reachedTarget && !degenerate && !dead) {
        return `game ended with no seat at ${TARGET_SCORE} and no degenerate state (scores ${next.scores.join(",")}, deck ${next.deck.length}, filled ${filled})`;
      }
      if (reachedTarget) {
        const top = Math.max(...next.scores);
        if (top < TARGET_SCORE) return `declared winner below target`;
      }
    }
  }
  return null;
}

function hasAnySharedAttribute(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (a.shape === b.shape || a.number === b.number || a.color === b.color) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

const GAMES_PER_COUNT = 2000;

interface Summary {
  games: number;
  dispatches: number;
  finished: number;
  stalled: number;
  roundsTotal: number;
  maxRounds: number;
  failures: Failure[];
}

function sweep(seatCount: number, label: string): Summary {
  const sum: Summary = {
    games: 0,
    dispatches: 0,
    finished: 0,
    stalled: 0,
    roundsTotal: 0,
    maxRounds: 0,
    failures: [],
  };
  for (let g = 0; g < GAMES_PER_COUNT; g++) {
    const seed = `${label}#${g}`;
    const r = runGame(seed, seatCount);
    sum.games++;
    sum.dispatches += r.dispatches;
    sum.roundsTotal += r.rounds;
    sum.maxRounds = Math.max(sum.maxRounds, r.rounds);
    if (r.finished) sum.finished++;
    else if (!r.failure) sum.stalled++;
    if (r.failure && sum.failures.length < 5) sum.failures.push(r.failure);
  }
  return sum;
}

const report: Record<string, Summary> = {};

describe("Classic reducer fuzz", () => {
  for (const seatCount of [2, 3, 4, 5, 6]) {
    it(`holds every invariant across ${GAMES_PER_COUNT} games at ${seatCount} players`, () => {
      const sum = sweep(seatCount, `p${seatCount}`);
      report[`${seatCount}p`] = sum;
      if (sum.failures.length > 0) {
        const f = sum.failures[0];
        throw new Error(
          `${sum.failures.length}+ failures at ${seatCount} players.\n` +
            `seed=${f.seed}\nreason=${f.reason}\nlast actions:\n  ${f.sequence.join("\n  ")}`,
        );
      }
      expect(sum.failures).toEqual([]);
    }, 300000);
  }

  it(`holds every invariant across ${GAMES_PER_COUNT} solo games`, () => {
    const sum = sweep(2, "solo");
    report.solo = sum;
    if (sum.failures.length > 0) {
      const f = sum.failures[0];
      throw new Error(
        `solo failure.\nseed=${f.seed}\nreason=${f.reason}\nlast actions:\n  ${f.sequence.join("\n  ")}`,
      );
    }
    expect(sum.failures).toEqual([]);
  }, 300000);

  it("reports coverage", () => {
    let games = 0, dispatches = 0, finished = 0, stalled = 0;
    const lines: string[] = [];
    for (const [k, v] of Object.entries(report)) {
      games += v.games;
      dispatches += v.dispatches;
      finished += v.finished;
      stalled += v.stalled;
      lines.push(
        `${k}: games=${v.games} dispatches=${v.dispatches} finished=${v.finished} ` +
          `unfinished=${v.stalled} avgRounds=${(v.roundsTotal / v.games).toFixed(1)} ` +
          `maxRounds=${v.maxRounds}`,
      );
    }
    console.log(
      `\n=== fuzz coverage ===\n${lines.join("\n")}\n` +
        `TOTAL games=${games} dispatches=${dispatches} finished=${finished} unfinished=${stalled}\n`,
    );
    expect(games).toBeGreaterThan(0);
  });
});
