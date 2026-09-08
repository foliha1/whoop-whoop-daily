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

  // The regression that shipped: a claim from the seat whose OWN flip is still
  // animating, and the orphaned FLIP_COMPLETE that fires afterwards.
  if (s.inFlight?.kind === "flip") {
    out.push({ type: "PLAYER_ENTER_CLAIM", by: s.inFlight.by });
    out.push({ type: "FLIP_COMPLETE", token: s.inFlight.token });
  }
  if (s.phase === "CLAIM_SELECTING" || s.phase === "SETTLING") {
    // Stale flip completions arriving after the claim took over.
    out.push({ type: "FLIP_COMPLETE", token });
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

// ---------------------------------------------------------------------------
// Play-experience probe (not an invariant test).
//
// The fuzzer plays randomly, which says nothing about pacing. This sweep plays
// COMPETENTLY: a seat claims when it can see a legal matching pair, with a
// small miss rate, and every seat takes its two flips otherwise. It reports
// rounds, claims and a rough wall-clock estimate so pacing problems surface.
// ---------------------------------------------------------------------------

const TIME_MODEL = {
  rollMs: 2000,      // roll hero
  flipMs: 900,       // one flip + read beat
  claimMs: 2600,     // press + two selections + settle
  windowMs: 2000,    // rotation claim window
};

function matchingPair(s: State, seat: number): [number, number] | null {
  const idxs: number[] = [];
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i] !== null && !s.wrongBy[seat]?.has(i)) idxs.push(i);
  }
  for (let i = 0; i < idxs.length; i++) {
    for (let j = i + 1; j < idxs.length; j++) {
      const a = s.grid[idxs[i]]!, b = s.grid[idxs[j]]!;
      const attr = s.rule[0];
      const same =
        attr === "SHAPE" ? a.shape === b.shape :
        attr === "NUMBER" ? a.number === b.number :
        a.color === b.color;
      if (same) return [idxs[i], idxs[j]];
    }
  }
  return null;
}

function playCompetently(seed: string, seatCount: number) {
  const rng = mulberry32(
    [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 11) >>> 0,
  );
  let s = initialState(9, { seatCount, seed: `${seed}:deck` });
  let token = 1;
  let ms = 0;
  let claims = 0;
  let wrongs = 0;
  let steps = 0;
  const perSeatIdle: number[] = Array(seatCount).fill(0);

  while (s.phase !== "GAME_OVER" && steps < 20000) {
    steps++;
    if (s.phase === "AWAITING_ROLL") {
      if (!s.rolling) s = reducer(s, { type: "ROLL_START" });
      else {
        const attr = ["SHAPE", "NUMBER", "COLOR"][Math.floor(rng() * 3)];
        s = reducer(s, { type: "ROLL_LAND", values: [attr], rule: [attr] });
        s = reducer(s, { type: "ROLL_SETTLE" });
        ms += TIME_MODEL.rollMs;
      }
      continue;
    }
    if (s.phase === "FLIPPING" || s.phase === "CLAIM_WINDOW") {
      // Someone spots the pair. 85% of the time they claim it correctly.
      let claimed = false;
      for (let k = 0; k < seatCount; k++) {
        const by = (s.flipper + k) % seatCount;
        if (s.disconnected[by]) continue;
        const pair = matchingPair(s, by);
        if (pair && rng() < 0.85) {
          s = reducer(s, { type: "CLAIM_START", by, a: pair[0], b: pair[1], token: token++ });
          s = reducer(s, { type: "CLAIM_RESOLVE", token: token - 1 });
          ms += TIME_MODEL.claimMs;
          claims++;
          claimed = true;
          break;
        }
      }
      if (claimed) continue;
      if (s.phase === "CLAIM_WINDOW") {
        s = reducer(s, { type: "CLAIM_WINDOW_EXPIRE", token: s.claimWindowToken });
        ms += TIME_MODEL.windowMs;
        continue;
      }
      // Occasional wrong claim so penalties and locks are exercised.
      if (rng() < 0.08) {
        const idxs: number[] = [];
        for (let i = 0; i < s.grid.length; i++) {
          if (s.grid[i] !== null && !s.wrongBy[s.flipper]?.has(i)) idxs.push(i);
        }
        if (idxs.length >= 2) {
          s = reducer(s, { type: "CLAIM_START", by: s.flipper, a: idxs[0], b: idxs[1], token: token++ });
          s = reducer(s, { type: "CLAIM_RESOLVE", token: token - 1 });
          ms += TIME_MODEL.claimMs;
          wrongs++;
          continue;
        }
      }
      const who = s.flipper;
      const cards: number[] = [];
      for (let i = 0; i < s.grid.length; i++) {
        if (s.grid[i] !== null && !s.wrongBy[who]?.has(i)) cards.push(i);
      }
      if (s.disconnected[who] || cards.length === 0) {
        s = reducer(s, { type: "SKIP_TICK" });
        continue;
      }
      const idx = cards[Math.floor(rng() * cards.length)];
      s = reducer(s, { type: "FLIP_START", by: who, idx, token: token++ });
      s = reducer(s, { type: "FLIP_COMPLETE", token: token - 1 });
      ms += TIME_MODEL.flipMs;
      for (let i = 0; i < seatCount; i++) perSeatIdle[i] += i === who ? 0 : TIME_MODEL.flipMs;
      continue;
    }
    if (s.phase === "SETTLING") {
      s = reducer(s, { type: "SETTLE_COMPLETE", token: s.settleToken });
      continue;
    }
    if (s.phase === "CLAIM_SELECTING") {
      s = reducer(s, { type: "CANCEL_CLAIM", by: s.claimBy! });
      continue;
    }
    if (s.phase === "CLAIM_RESOLVING") {
      s = reducer(s, { type: "CLAIM_RESOLVE", token: (s.inFlight as { token: number }).token });
      continue;
    }
    break;
  }
  return {
    minutes: ms / 60000,
    rounds: s.roundNum,
    claims,
    wrongs,
    finished: s.phase === "GAME_OVER",
    winnerScore: Math.max(...s.scores),
    overshoot: Math.max(...s.scores) - TARGET_SCORE,
    maxIdleMs: Math.max(...perSeatIdle),
  };
}

describe("Classic pacing probe", () => {
  it("reports realistic game length per table size", () => {
    const lines: string[] = [];
    for (const seatCount of [2, 3, 4, 5, 6]) {
      const runs = Array.from({ length: 400 }, (_, g) =>
        playCompetently(`pace${seatCount}#${g}`, seatCount),
      );
      const mins = runs.map((r) => r.minutes).sort((a, b) => a - b);
      const med = mins[Math.floor(mins.length / 2)];
      const p95 = mins[Math.floor(mins.length * 0.95)];
      const unfinished = runs.filter((r) => !r.finished).length;
      const inBand = runs.filter((r) => r.minutes >= 15 && r.minutes <= 20).length;
      const overshoot = runs.filter((r) => r.overshoot > 0).length;
      lines.push(
        `${seatCount}p median=${med.toFixed(1)}min p95=${p95.toFixed(1)}min ` +
          `min=${mins[0].toFixed(1)} max=${mins[mins.length - 1].toFixed(1)} ` +
          `in15-20band=${inBand}/400 overshot10=${overshoot}/400 unfinished=${unfinished}`,
      );
    }
    console.log(`\n=== pacing probe ===\n${lines.join("\n")}\n`);
    expect(lines.length).toBe(5);
  }, 120000);
});

// ---------------------------------------------------------------------------
// REGRESSION CLASS: claiming from the seat that currently has a flip in
// flight. The interface allows it (the WHOOP button is always pressable) and
// the rules require it (a claim never costs a flip), but the original suite
// only ever drove claims and flips as separate, tidy actions — so the state
// "claim dispatched while THIS seat's flip animation is still running" was
// never reached. These cases dispatch a claim from the current flipper at
// every point in its turn, at every table size and in solo, asserting the
// full invariant set after every dispatch.
// ---------------------------------------------------------------------------

/** Drive a fresh game to FLIPPING with a known rule. */
function atFlipping(seed: string, seatCount: number, attr = "SHAPE"): State {
  let s = initialState(9, { seatCount, seed });
  s = reducer(s, { type: "ROLL_START" });
  s = reducer(s, { type: "ROLL_LAND", values: [attr], rule: [attr] });
  s = reducer(s, { type: "ROLL_SETTLE" });
  return s;
}

type ClaimPoint =
  | "before-flip-one"
  | "during-flip-one"
  | "between-flips"
  | "during-flip-two"
  | "after-both-flips";

const CLAIM_POINTS: ClaimPoint[] = [
  "before-flip-one",
  "during-flip-one",
  "between-flips",
  "during-flip-two",
  "after-both-flips",
];

describe("claim from the seat with a flip in flight", () => {
  it("is legal, cancels the flip cleanly, and preserves remaining flips", () => {
    const failures: string[] = [];
    let cases = 0;
    let dispatches = 0;

    // seatCount 2 is also the solo table (human + WHOOP), driven explicitly
    // below as `solo` so the label appears in any failure.
    const tables: Array<{ label: string; seatCount: number }> = [
      { label: "solo", seatCount: 2 },
      ...[2, 3, 4, 5, 6].map((n) => ({ label: `${n}p`, seatCount: n })),
    ];

    for (const { label, seatCount } of tables) {
      for (const point of CLAIM_POINTS) {
        for (const finish of ["match", "wrong", "cancel"] as const) {
          for (let g = 0; g < 24; g++) {
            cases++;
            const tag = `${label}/${point}/${finish}#${g}`;
            let s = atFlipping(`whoop-inflight:${tag}`, seatCount);
            let prev: State = s;
            let token = 100;
            let staleFlipToken: number | null = null;

            const step = (a: Action) => {
              prev = s;
              s = reducer(s, a);
              dispatches++;
              const bad = checkInvariants(s, { prev, action: a });
              if (bad) failures.push(`${tag} after ${a.type}: ${bad}`);
            };

            const seat = s.flipper;
            const freeIdxs = s.grid
              .map((c, i) => (c === null ? -1 : i))
              .filter((i) => i >= 0);

            // Walk the flipper's turn up to the chosen claim point.
            if (point !== "before-flip-one") {
              staleFlipToken = token++;
              step({ type: "FLIP_START", by: seat, idx: freeIdxs[0], token: staleFlipToken });
              if (point !== "during-flip-one") {
                step({ type: "FLIP_COMPLETE", token: staleFlipToken });
                staleFlipToken = null;
                if (point === "during-flip-two" || point === "after-both-flips") {
                  if (s.phase === "FLIPPING" && s.flipper === seat) {
                    staleFlipToken = token++;
                    step({ type: "FLIP_START", by: seat, idx: freeIdxs[1], token: staleFlipToken });
                    if (point === "after-both-flips") {
                      step({ type: "FLIP_COMPLETE", token: staleFlipToken });
                      staleFlipToken = null;
                    }
                  }
                }
              }
            }

            // The claim itself, from the seat mid-turn.
            const claimant = s.phase === "CLAIM_WINDOW" ? seat : s.flipper;
            const flipsBefore = s.flipsThisTurn;
            const inFlightBefore = s.inFlight;
            const claimable = s.phase === "FLIPPING" || s.phase === "CLAIM_WINDOW";
            if (!claimable) continue; // rotation ended on the last flip

            step({ type: "PLAYER_ENTER_CLAIM", by: claimant });

            if (s.phase !== "CLAIM_SELECTING") {
              failures.push(`${tag}: claim refused (phase ${s.phase})`);
              continue;
            }
            if (s.claimBy !== claimant) failures.push(`${tag}: claimBy ${s.claimBy} != ${claimant}`);
            // The in-flight flip is CANCELLED cleanly: no half-applied flip
            // and no card left mid-reveal.
            if (s.inFlight !== null) failures.push(`${tag}: inFlight survived the claim`);
            if (s.peekingCard !== null) failures.push(`${tag}: peekingCard survived the claim`);
            // A claim never costs a flip.
            if (s.flipsThisTurn !== flipsBefore) {
              failures.push(`${tag}: flipsThisTurn ${flipsBefore} -> ${s.flipsThisTurn}`);
            }

            // The orphaned FLIP_COMPLETE timer still fires: it must be a
            // total no-op, not a rewind of the board.
            if (staleFlipToken !== null && inFlightBefore) {
              const before = s;
              step({ type: "FLIP_COMPLETE", token: staleFlipToken });
              if (s !== before) failures.push(`${tag}: stale FLIP_COMPLETE mutated state`);
            }

            // Finish the claim three different ways.
            if (finish === "cancel") {
              step({ type: "CANCEL_CLAIM", by: claimant });
            } else {
              const pair =
                finish === "match"
                  ? matchingPair(s, claimant)
                  : (() => {
                      const idxs = s.grid
                        .map((c, i) => (c === null ? -1 : i))
                        .filter((i) => i >= 0 && !s.wrongBy[claimant]?.has(i));
                      const good = matchingPair(s, claimant);
                      const wrong = idxs.filter(
                        (i) => !good || (i !== good[0] && i !== good[1]),
                      );
                      return wrong.length >= 2 ? ([wrong[0], wrong[1]] as [number, number]) : null;
                    })();
              if (!pair) {
                step({ type: "CANCEL_CLAIM", by: claimant });
              } else {
                step({ type: "PLAYER_SELECT_CARD", by: claimant, idx: pair[0] });
                step({ type: "PLAYER_SELECT_CARD", by: claimant, idx: pair[1] });
                step({ type: "PLAYER_RESOLVE_MATCH", by: claimant });
                if (s.phase === "SETTLING") step({ type: "SETTLE_COMPLETE", token: s.settleToken });
              }
            }

            // If the round is still live, the seat keeps the flips it had.
            if (s.phase === "FLIPPING" && s.flipper === claimant) {
              if (s.flipsThisTurn !== flipsBefore) {
                failures.push(
                  `${tag}: flips lost after resolve (${flipsBefore} -> ${s.flipsThisTurn})`,
                );
              }
              if (s.flipsThisTurn < FLIPS_PER_TURN) {
                // ...and can actually still flip.
                const idx = s.grid.findIndex(
                  (c, i) => c !== null && !s.wrongBy[claimant]?.has(i),
                );
                if (idx >= 0) {
                  const t = token++;
                  step({ type: "FLIP_START", by: claimant, idx, token: t });
                  if (s.inFlight === null) failures.push(`${tag}: could not flip after claim`);
                  step({ type: "FLIP_COMPLETE", token: t });
                }
              }
            }
          }
        }
      }
    }

    console.log(
      `\n=== claim-during-own-flip ===\ncases=${cases} dispatches=${dispatches} failures=${failures.length}`,
    );
    if (failures.length) console.log(failures.slice(0, 20).join("\n"));
    expect(failures).toEqual([]);
  }, 60000);
});
