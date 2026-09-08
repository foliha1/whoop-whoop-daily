/**
 * Headless solo-game simulator. Mirrors useSoloGame's timers and React effect
 * dependency semantics (cleanup-on-dep-change) against the real reducer and
 * the real whoopBrain, on a virtual clock. Measurement only — imports the
 * shipping modules, changes nothing.
 *
 * Run: bun scripts/soloSim.ts [games] [label]
 */
import {
  reducer,
  initialState,
  type State,
  type Action,
  SETTLE_MATCH_MS,
  SETTLE_WRONG_MS,
  MAX_WRONG_CLAIMS_PER_ROUND,
  TARGET_SCORE,
} from "@/hooks/useGameState";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import {
  createBrain,
  observe,
  forget,
  decay,
  findClaim,
  pickFlipTarget,
  pickReactionDelay,
  CONFIDENCE_THRESHOLD,
  type Brain,
} from "@/lib/whoopBrain";
import type { Card } from "@/cardData";

const WHOOP = 1;
const HUMAN = 0;
const REVEAL_MS = 2000;
const WHOOP_ROLL_DELAY_MS = 1200;
const WHOOP_FLIP_DELAY_MS = 1400;

// human probe pacing
const R_MIN = Number(process.env.R_MIN ?? 1500);
const R_MAX = Number(process.env.R_MAX ?? 3400);
const reactionDelay = (rng: () => number) =>
  process.env.R_MIN ? R_MIN + rng() * (R_MAX - R_MIN) : pickReactionDelay(rng);
const HUMAN_ROLL_MS = 900;
const HUMAN_FLIP_MS = 1200;
const HUMAN_REACTION_MS = 1100;
const HUMAN_ACCURACY = Number(process.env.HUMAN_ACCURACY ?? 0.85);
// Competent, not superhuman: a person holds a handful of positions in mind.
const HUMAN_MEMORY = Number(process.env.HUMAN_MEMORY ?? 5);

type Timer = { at: number; seq: number; fn: () => void; id: number };

class Clock {
  now = 0;
  private q: Timer[] = [];
  private seq = 0;
  private nextId = 1;
  set(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.q.push({ at: this.now + Math.max(0, ms), seq: this.seq++, fn, id });
    return id;
  }
  clear(id: number | null) {
    if (id === null) return;
    this.q = this.q.filter((t) => t.id !== id);
  }
  step(): boolean {
    if (this.q.length === 0) return false;
    this.q.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const t = this.q.shift()!;
    this.now = t.at;
    t.fn();
    return true;
  }
}

interface Stats {
  claimsAttempted: number;
  claimsScheduled: number;
  cancelledByDeps: number;
  droppedAtGuard: number;
  droppedCapped: number;
  noPairFound: number;
  confAtRoundEnd: number[];
  whoopScore: number;
  humanScore: number;
  rounds: number;
  whoopWrong: number;
  obs: number;
  brainSizeAtRoundEnd: number[];
  flipsSeen: number;
}

function matchOn(a: Card, b: Card, attr: string) {
  if (attr === "SHAPE") return a.shape === b.shape;
  if (attr === "NUMBER") return a.number === b.number;
  if (attr === "COLOR") return a.color === b.color;
  return false;
}

/** Perfect-memory competent human probe. */
function humanFindPair(
  seen: Map<number, Card>,
  grid: (Card | null)[],
  rule: string[],
  excluded: Set<number>,
): [number, number] | null {
  const keys = [...seen.keys()].filter(
    (i) => !excluded.has(i) && grid[i] !== null && grid[i]!.id === seen.get(i)!.id,
  );
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = seen.get(keys[i])!;
      const b = seen.get(keys[j])!;
      if (rule.every((r) => matchOn(a, b, r))) return [keys[i], keys[j]];
    }
  return null;
}

export function playGame(seedRandom: () => number, stats: Stats): void {
  const clock = new Clock();
  let state: State = initialState(9, {
    seatCount: 2,
    names: ["You", "WHOOP"],
  });
  let brain: Brain = createBrain();
  const humanSeen = new Map<number, Card>();
  let token = 0;
  const nextToken = () => ++token;
  let steps = 0;

  // effect bookkeeping
  const timers: Record<string, number | null> = {};
  const deps: Record<string, string> = {};
  let prevPeek: number | null = state.peekingCard;
  let prevGrid = state.grid;
  let scheduledWindow = -1;
  let seenSettle = -1;
  let wrongAttempts = 0;

  const dispatch = (a: Action) => {
    const next = reducer(state, a);
    state = next;
    runEffects();
  };

  function cancel(key: string) {
    clock.clear(timers[key] ?? null);
    timers[key] = null;
  }

  function runEffects() {
    if (++steps > 200000) throw new Error("step cap");
    if (state.phase === "GAME_OVER") return;

    // --- observation effect (peek cleared) ---
    {
      const p = prevPeek;
      prevPeek = state.peekingCard;
      if (p !== null && state.peekingCard === null) {
        const card = state.grid[p];
        if (card) {
          brain = decay(brain);
          brain = observe(brain, p, card, seedRandom);
          stats.obs++;
          if (process.env.TRACE) console.log(`t=${clock.now} OBSERVE ${p} size=${brain.entries.size} round=${state.roundNum} rule=${state.rule}`);
        }
      }
    }
    // human observes everything (perfect memory probe)
    if (state.peekingCard !== null) {
      const c = state.grid[state.peekingCard];
      if (c) {
        humanSeen.delete(state.peekingCard);
        humanSeen.set(state.peekingCard, c);
        while (humanSeen.size > HUMAN_MEMORY) {
          humanSeen.delete(humanSeen.keys().next().value as number);
        }
      }
    }
    // --- forget on grid change ---
    {
      const prev = prevGrid;
      for (let i = 0; i < state.grid.length; i++) {
        const a = prev[i]?.id ?? null;
        const b = state.grid[i]?.id ?? null;
        if (a !== b) {
          if (brain.entries.has(i) && process.env.TRACE) console.log(`t=${clock.now} FORGET ${i} ${a}->${b}`);
          brain = forget(brain, i);
          humanSeen.delete(i);
        }
      }
      prevGrid = state.grid;
    }
    // wrong-claim reveal: both cards are public for the rest of the round
    if (state.phase === "SETTLING" && state.settleKind === "WRONG" && seenSettle !== state.settleToken) {
      seenSettle = state.settleToken;
      for (const idx of state.selectedCards) {
        const c = state.grid[idx];
        if (c) {
          brain = observe(brain, idx, c, seedRandom);
          humanSeen.set(idx, c);
        }
      }
    }

    // --- settle scheduler ---
    depEffect("settle", `${state.phase}|${state.settleKind}|${state.settleToken}`, () => {
      if (state.phase !== "SETTLING" || state.settleKind === null) return;
      const ms = state.settleKind === "MATCH" ? SETTLE_MATCH_MS : SETTLE_WRONG_MS;
      const tk = state.settleToken;
      timers.settle = clock.set(() => dispatch({ type: "SETTLE_COMPLETE", token: tk }), ms);
    });

    // --- claim window expiry (host-side, not dep-cancelled) ---
    if (!state.claimWindowOpen) {
      cancel("window");
      scheduledWindow = -1;
    } else if (scheduledWindow !== state.claimWindowToken) {
      scheduledWindow = state.claimWindowToken;
      cancel("window");
      const tk = state.claimWindowToken;
      timers.window = clock.set(
        () => dispatch({ type: "CLAIM_WINDOW_EXPIRE", token: tk }),
        2000,
      );
    }

    // --- WHOOP auto roll ---
    depEffect("wroll", `${state.phase}|${state.roller}|${state.rolling}`, () => {
      if (state.phase !== "AWAITING_ROLL" || state.roller !== WHOOP || state.rolling) return;
      timers.wroll = clock.set(() => roll(), WHOOP_ROLL_DELAY_MS);
    });
    // --- human auto roll (probe) ---
    depEffect("hroll", `${state.phase}|${state.roller}|${state.rolling}`, () => {
      if (state.phase !== "AWAITING_ROLL" || state.roller !== HUMAN || state.rolling) return;
      timers.hroll = clock.set(() => roll(), HUMAN_ROLL_MS);
    });

    // --- WHOOP flip ---
    depEffect(
      "wflip",
      `${state.phase}|${state.flipper}|${!!state.inFlight}`,
      () => {
        if (state.phase !== "FLIPPING" || state.flipper !== WHOOP || state.inFlight) return;
        timers.wflip = clock.set(() => {
          const cands = state.grid
            .map((c, i) => (c !== null && !state.wrongBy[WHOOP].has(i) ? i : -1))
            .filter((i) => i !== -1);
          const pick = pickFlipTarget(brain, cands, seedRandom);
          if (pick === null) return dispatch({ type: "SKIP_TICK" });
          const tk = nextToken();
          dispatch({ type: "FLIP_START", by: WHOOP, idx: pick, token: tk });
          clock.set(() => dispatch({ type: "FLIP_COMPLETE", token: tk }), REVEAL_MS);
        }, WHOOP_FLIP_DELAY_MS);
      },
    );

    // --- human flip ---
    depEffect(
      "hflip",
      `${state.phase}|${state.flipper}|${!!state.inFlight}`,
      () => {
        if (state.phase !== "FLIPPING" || state.flipper !== HUMAN || state.inFlight) return;
        timers.hflip = clock.set(() => {
          const cands = state.grid
            .map((c, i) => (c !== null && !state.wrongBy[HUMAN].has(i) ? i : -1))
            .filter((i) => i !== -1);
          const unseen = cands.filter((i) => !humanSeen.has(i));
          const pool = unseen.length ? unseen : cands;
          if (pool.length === 0) return dispatch({ type: "SKIP_TICK" });
          const pick = pool[Math.floor(seedRandom() * pool.length)];
          const tk = nextToken();
          dispatch({ type: "FLIP_START", by: HUMAN, idx: pick, token: tk });
          clock.set(() => dispatch({ type: "FLIP_COMPLETE", token: tk }), REVEAL_MS);
        }, HUMAN_FLIP_MS);
      },
    );

    // --- WHOOP claim (persistent scheduler, mirrors useSoloGame) ---
    tickScheduler();

    // --- human claim probe ---
    depEffect(
      "hclaim",
      [
        state.peekingCard,
        state.phase,
        !!state.inFlight,
        state.claimBy,
        state.wrongBy[HUMAN].size,
        state.missesThisRound[HUMAN],
        state.rule.join(","),
        state.grid.map((c) => c?.id ?? "-").join("|"),
      ].join("~"),
      () => {
        if (state.phase !== "FLIPPING" && state.phase !== "CLAIM_WINDOW") return;
        if (state.inFlight || state.claimBy !== null) return;
        if ((state.missesThisRound[HUMAN] ?? 0) >= MAX_WRONG_CLAIMS_PER_ROUND) return;
        const excl = new Set<number>(state.wrongBy[HUMAN]);
        const pair = humanFindPair(humanSeen, state.grid, state.rule, excl);
        if (!pair) return;
        if (seedRandom() > HUMAN_ACCURACY) return;
        timers.hclaim = clock.set(() => {
          const s = state;
          if (
            (s.phase !== "FLIPPING" && s.phase !== "CLAIM_WINDOW") ||
            s.inFlight ||
            s.claimBy !== null ||
            s.grid[pair[0]] === null ||
            s.grid[pair[1]] === null
          )
            return;
          dispatch({ type: "PLAYER_ENTER_CLAIM", by: HUMAN });
          dispatch({ type: "PLAYER_SELECT_CARD", by: HUMAN, idx: pair[0] });
          dispatch({ type: "PLAYER_SELECT_CARD", by: HUMAN, idx: pair[1] });
          dispatch({ type: "PLAYER_RESOLVE_MATCH", by: HUMAN });
        }, HUMAN_REACTION_MS);
      },
    );
  }

  let fireAt: number | null = null;
  let armedRound = -1;
  let schedulerRunning = false;
  function tickScheduler() {
    if (schedulerRunning) return;
    schedulerRunning = true;
    const id = clock.set(function loop() {
      schedulerRunning = false;
      const s = state;
      if (s.phase === "GAME_OVER") return;
      if (armedRound !== s.roundNum) {
        armedRound = s.roundNum;
        fireAt = null;
      }
      if ((s.missesThisRound[WHOOP] ?? 0) >= MAX_WRONG_CLAIMS_PER_ROUND) {
        stats.droppedCapped++;
        fireAt = null;
        rearm();
        return;
      }
      const excluded = new Set<number>(s.wrongBy[WHOOP]);
      s.grid.forEach((c, i) => {
        if (c === null) excluded.add(i);
      });
      const best = findClaim(brain, s.rule, excluded);
      if (!best) {
        stats.noPairFound++;
        fireAt = null;
        rearm();
        return;
      }
      if (fireAt === null) {
        stats.claimsScheduled++;
        fireAt = clock.now + reactionDelay(seedRandom);
        rearm();
        return;
      }
      if (clock.now < fireAt) {
        rearm();
        return;
      }
      if (
        (s.phase !== "FLIPPING" && s.phase !== "CLAIM_WINDOW") ||
        s.inFlight ||
        s.claimBy !== null
      ) {
        stats.droppedAtGuard++;
        rearm();
        return;
      }
      fireAt = null;
      stats.claimsAttempted++;
      {
        const ca = s.grid[best.a]!;
        const cb = s.grid[best.b]!;
        if (!s.rule.every((r) => matchOn(ca, cb, r))) wrongAttempts++;
      }
      const tk = nextToken();
      dispatch({ type: "CLAIM_START", by: WHOOP, a: best.a, b: best.b, token: tk });
      clock.set(() => dispatch({ type: "CLAIM_RESOLVE", token: tk }), 1600);
    }, 200);
    void id;
  }
  function rearm() {
    tickScheduler();
  }

  function depEffect(key: string, dep: string, run: () => void) {
    if (deps[key] === dep) return;
    deps[key] = dep;
    if (timers[key] != null) {
      cancel(key);
      if (key === "wclaim") stats.cancelledByDeps++;
    }
    run();
  }

  function roll() {
    if (state.phase !== "AWAITING_ROLL" || state.rolling) return;
    const attrs = ["SHAPE", "NUMBER", "COLOR"];
    const attribute = attrs[Math.floor(seedRandom() * 3)];
    dispatch({ type: "ROLL_START" });
    clock.set(() => {
      dispatch({ type: "ROLL_LAND", values: [attribute], rule: [attribute] });
      clock.set(() => dispatch({ type: "ROLL_SETTLE" }), ROLL_HERO_MS - 450);
    }, 450);
  }

  // measure memory above threshold at round boundaries
  let lastRound = state.roundNum;
  let lastWrongTok = -1;

  runEffects();
  let guard = 0;
  while (state.phase !== "GAME_OVER" && guard++ < 400000) {
    if (!clock.step()) break;
    if (state.roundNum !== lastRound) {
      lastRound = state.roundNum;
      let n = 0;
      for (const [, m] of brain.entries)
        if (m.confidence > CONFIDENCE_THRESHOLD) n++;
      stats.confAtRoundEnd.push(n);
      stats.brainSizeAtRoundEnd.push(brain.entries.size);
    }
  }
  stats.rounds += state.roundNum;
  stats.whoopWrong = wrongAttempts;
  stats.whoopScore = state.scores[WHOOP];
  stats.humanScore = state.scores[HUMAN];
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = Number(process.argv[2] ?? 500);
const label = process.argv[3] ?? "run";
const agg = {
  attempts: [] as number[],
  zero: 0,
  cancelled: 0,
  guardDropped: 0,
  capped: 0,
  noPair: 0,
  conf: [] as number[],
  bsize: [] as number[],
  obs: [] as number[],
  wrong: [] as number[],
  whoop: [] as number[],
  human: [] as number[],
  rounds: [] as number[],
  whoopWins: 0,
  humanWins: 0,
  ties: 0,
  errors: 0,
};
for (let g = 0; g < N; g++) {
  const stats: Stats = {
    claimsAttempted: 0,
    claimsScheduled: 0,
    cancelledByDeps: 0,
    droppedAtGuard: 0,
    droppedCapped: 0,
    noPairFound: 0,
    confAtRoundEnd: [],
    whoopScore: 0,
    humanScore: 0,
    rounds: 0,
    whoopWrong: 0,
    obs: 0,
    brainSizeAtRoundEnd: [],
    flipsSeen: 0,
  };
  try {
    playGame(mulberry32(1000 + g), stats);
  } catch {
    agg.errors++;
  }
  agg.attempts.push(stats.claimsAttempted);
  if (stats.claimsAttempted === 0) agg.zero++;
  agg.cancelled += stats.cancelledByDeps;
  agg.guardDropped += stats.droppedAtGuard;
  agg.capped += stats.droppedCapped;
  agg.noPair += stats.noPairFound;
  agg.conf.push(...stats.confAtRoundEnd);
  agg.bsize.push(...stats.brainSizeAtRoundEnd);
  agg.obs.push(stats.obs);
  agg.wrong.push(stats.whoopWrong);
  agg.whoop.push(stats.whoopScore);
  agg.human.push(stats.humanScore);
  agg.rounds.push(stats.rounds);
  if (stats.whoopScore > stats.humanScore) agg.whoopWins++;
  else if (stats.humanScore > stats.whoopScore) agg.humanWins++;
  else agg.ties++;
}
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log(`=== ${label} (${N} games, TARGET_SCORE=${TARGET_SCORE}) ===`);
console.log(`claims attempted/game: median ${med(agg.attempts)} mean ${mean(agg.attempts).toFixed(2)}`);
console.log(`games with ZERO claims: ${((agg.zero / N) * 100).toFixed(1)}%`);
console.log(`scheduled-but-cancelled by dep change: ${agg.cancelled} total (${(agg.cancelled / N).toFixed(2)}/game)`);
console.log(`dropped at fire-time guard: ${agg.guardDropped} (${(agg.guardDropped / N).toFixed(2)}/game)`);
console.log(`skipped: capped by 2-miss rule ${agg.capped}, no pair found ${agg.noPair}`);
console.log(`positions above threshold at round end: median ${med(agg.conf)} mean ${mean(agg.conf).toFixed(2)} (<2 share ${((agg.conf.filter((c) => c < 2).length / Math.max(1, agg.conf.length)) * 100).toFixed(1)}%)`);
console.log(`observations/game median ${med(agg.obs)}; brain entries at round end median ${med(agg.bsize)} mean ${mean(agg.bsize).toFixed(2)}`);
console.log(`WHOOP score: median ${med(agg.whoop)} mean ${mean(agg.whoop).toFixed(2)}; human: median ${med(agg.human)} mean ${mean(agg.human).toFixed(2)}`);
console.log(`rounds/game median ${med(agg.rounds)}`);
console.log(`WHOOP wrong claims/game mean ${mean(agg.wrong).toFixed(2)}; share of games with >=1 wrong ${((agg.wrong.filter((w) => w > 0).length / N) * 100).toFixed(1)}%`);
console.log(`WHOOP wins ${((agg.whoopWins / N) * 100).toFixed(1)}% | human ${((agg.humanWins / N) * 100).toFixed(1)}% | ties ${((agg.ties / N) * 100).toFixed(1)}% | errors ${agg.errors}`);
