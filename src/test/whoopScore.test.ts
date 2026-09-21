import { describe, expect, it } from "vitest";
import {
  CONSISTENCY_DAYS,
  PERCENTILE_MIN_PLAYERS,
  RANK_MIN_GAMES,
  SCORE_MIN_GAMES,
  SCORE_WINDOW_GAMES,
  computeWhoopScore,
  nextTierThreshold,
  tierForScore,
  type ScoredGame,
} from "@/lib/whoopScore";

/** Puzzle 1 is 2026-08-11; consecutive puzzle numbers are consecutive days. */
const dateFor = (puzzle: number): string =>
  new Date(Date.UTC(2026, 7, 10 + puzzle)).toISOString().slice(0, 10);

const run = (
  puzzle: number,
  opts: { peek?: boolean; misses?: number; date?: string } = {}
): ScoredGame => ({
  puzzleNumber: puzzle,
  puzzleDate: opts.date ?? dateFor(puzzle),
  peekUsed: opts.peek ?? false,
  totalMisses: opts.misses ?? 0,
});

describe("thresholds", () => {
  it("keeps the tunable constants in one place", () => {
    expect([SCORE_MIN_GAMES, RANK_MIN_GAMES, PERCENTILE_MIN_PLAYERS]).toEqual([5, 10, 20]);
    expect([SCORE_WINDOW_GAMES, CONSISTENCY_DAYS]).toEqual([30, 30]);
  });
});

describe("tiers", () => {
  it("maps the fixed boundaries to stable keys", () => {
    expect([0, 39, 40, 54, 55, 69, 70, 84, 85, 100].map(tierForScore)).toEqual([
      "rookie", "rookie", "tier_2", "tier_2", "tier_3", "tier_3",
      "tier_4", "tier_4", "legend", "legend",
    ]);
  });

  it("has no next tier at legend", () => {
    expect(nextTierThreshold(58)).toBe(70);
    expect(nextTierThreshold(85)).toBeNull();
  });
});

describe("the formula", () => {
  it("scores a perfect 30-day player 100", () => {
    const games = Array.from({ length: 30 }, (_, i) => run(i + 1));
    const r = computeWhoopScore(games, dateFor(30));
    expect(r.score).toBe(100);
    expect(r.tier).toBe("legend");
    expect(r.gamesCounted).toBe(30);
    expect([r.noPeekRate, r.zeroMistakeRate, r.consistencyRate]).toEqual([1, 1, 1]);
  });

  it("scores a daily player who always peeks and always misses on consistency alone", () => {
    const games = Array.from({ length: 30 }, (_, i) => run(i + 1, { peek: true, misses: 2 }));
    const r = computeWhoopScore(games);
    expect(r.noPeekRate).toBe(0);
    expect(r.zeroMistakeRate).toBe(0);
    expect(r.consistencyRate).toBe(1);
    expect(r.score).toBe(20);
    expect(r.tier).toBe("rookie");
  });

  it("returns no score below the minimum, only the games still needed", () => {
    const r = computeWhoopScore([run(1), run(2), run(3)]);
    expect(r.score).toBeNull();
    expect(r.tier).toBeNull();
    expect(r.gamesCounted).toBe(3);
    expect(r.gamesNeeded).toBe(2);
  });

  it("counts days showed up, not games, for a burst player", () => {
    // 20 clean games, but spread far apart: only 5 of them land in the
    // 30 days ending on the last one.
    const games: ScoredGame[] = [];
    for (let i = 0; i < 20; i += 1) {
      games.push(run(i + 1, { date: dateFor(1 + i * 20) }));
    }
    const r = computeWhoopScore(games);
    expect(r.noPeekRate).toBe(1);
    expect(r.zeroMistakeRate).toBe(1);
    expect(r.consistencyRate).toBeCloseTo(2 / 30, 5);
    expect(r.score).toBe(81);
    expect(r.tier).toBe("tier_4");
  });

  it("only counts the most recent 30 results", () => {
    const old = Array.from({ length: 10 }, (_, i) => run(i + 1, { peek: true, misses: 3 }));
    const recent = Array.from({ length: 30 }, (_, i) => run(i + 11));
    const r = computeWhoopScore([...old, ...recent]);
    expect(r.gamesCounted).toBe(30);
    expect(r.noPeekRate).toBe(1);
  });

  it("mixes the three components with 40/40/20 weights", () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      run(i + 1, { peek: i < 5, misses: i % 2 === 0 ? 0 : 1 })
    );
    const r = computeWhoopScore(games);
    expect(r.noPeekRate).toBe(0.5);
    expect(r.zeroMistakeRate).toBe(0.5);
    expect(r.consistencyRate).toBeCloseTo(10 / 30, 5);
    expect(r.score).toBe(47);
  });
});
