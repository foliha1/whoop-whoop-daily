import { describe, expect, it } from "vitest";
import {
  ACTIVE_DAYS,
  DECAY_PER_DAY,
  GRACE_DAYS,
  MAX_POINTS_PER_GAME,
  computeWhoopPoints,
  decayForGap,
  gamePoints,
  nextPointsThreshold,
  pointsTierForTotal,
  type PointsGame,
} from "@/lib/whoopPoints";

const day = (offset: number): string =>
  new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

const perfect = (i: number): PointsGame => ({
  puzzleNumber: i + 1,
  puzzleDate: day(i),
  peekUsed: false,
  totalMisses: 0,
  roundsSolved: 3,
  roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
});

describe("config", () => {
  it("keeps the tunable values in one place", () => {
    expect([MAX_POINTS_PER_GAME, GRACE_DAYS, DECAY_PER_DAY, ACTIVE_DAYS]).toEqual([5, 7, 3, 30]);
  });

  it("maps totals to stable tier keys", () => {
    expect([0, 24, 25, 74, 75, 149, 150, 299, 300, 1000].map(pointsTierForTotal)).toEqual([
      "rookie", "rookie", "great_eye", "great_eye", "match_maker", "match_maker",
      "xray_vision", "xray_vision", "legend", "legend",
    ]);
    expect(nextPointsThreshold(30)).toBe(75);
    expect(nextPointsThreshold(300)).toBeNull();
  });
});

describe("points per game", () => {
  it("scores a flawless game 5 and a peeked all-miss game 1", () => {
    expect(gamePoints(perfect(0))).toBe(5);
    expect(
      gamePoints({
        puzzleNumber: 1,
        puzzleDate: day(0),
        peekUsed: true,
        totalMisses: 3,
        roundsSolved: 0,
        roundEvents: [["MISS"], ["MISS"], ["MISS"]],
      })
    ).toBe(1);
  });

  it("only counts rounds whose first event was a solve", () => {
    expect(
      gamePoints({
        puzzleNumber: 1,
        puzzleDate: day(0),
        peekUsed: false,
        totalMisses: 1,
        roundsSolved: 3,
        roundEvents: [["SOLVE"], ["MISS", "SOLVE"], ["SOLVE"]],
      })
    ).toBe(4);
  });

  it("falls back to the counters when round_events is missing", () => {
    const clean: PointsGame = {
      puzzleNumber: 1, puzzleDate: day(0), peekUsed: false, totalMisses: 0, roundsSolved: 3,
    };
    const messy: PointsGame = { ...clean, puzzleNumber: 2, totalMisses: 2 };
    expect(gamePoints(clean)).toBe(5);
    expect(gamePoints(messy)).toBe(3); // 1 + max(0, 3 - 2) + 1
    const r = computeWhoopPoints([clean, messy], day(1));
    expect(r.fallbackRows).toBe(2);
  });
});

describe("the running total", () => {
  it("takes a perfect daily player to legend after 60 days", () => {
    const games = Array.from({ length: 60 }, (_, i) => perfect(i));
    const r = computeWhoopPoints(games, day(59));
    expect(r.total).toBe(300);
    expect(r.tier).toBe("legend");
    expect(r.gamesPlayed).toBe(60);
    expect(r.todayPoints).toBe(5);
    expect(r.totalBeforeToday).toBe(295);
    expect(r.badges.map((b) => b.key)).toEqual([
      "rookie", "great_eye", "match_maker", "xray_vision", "legend",
    ]);
  });

  it("charges exactly 9 points for ten days away", () => {
    expect(decayForGap(10)).toBe(9);
    expect(decayForGap(7)).toBe(0);
    const games = Array.from({ length: 20 }, (_, i) => perfect(i)); // 100 points
    const r = computeWhoopPoints(games, day(19 + 10));
    expect(r.daysAway).toBe(10);
    expect(r.decayApplied).toBe(9);
    expect(r.total).toBe(91);
    expect(r.todayPoints).toBeNull();
  });

  it("floors a long-lapsed player at zero without going negative", () => {
    const games = Array.from({ length: 10 }, (_, i) => perfect(i)); // 50 points
    const r = computeWhoopPoints(games, day(9 + 200));
    expect(r.total).toBe(0);
    expect(r.tier).toBe("rookie");
    expect(r.peakTotal).toBe(50);
    expect(r.highestTierEver).toBe("great_eye");
  });

  it("rebuilds from where decay left a returning player", () => {
    // 10 perfect days (50), away 200 days (floored to 0), then 3 perfect days.
    const games = [
      ...Array.from({ length: 10 }, (_, i) => perfect(i)),
      perfect(209), perfect(210), perfect(211),
    ];
    const r = computeWhoopPoints(games, day(211));
    expect(r.total).toBe(15);
    expect(r.todayPoints).toBe(5);
    expect(r.totalBeforeToday).toBe(10);
  });

  it("keeps the match_maker badge after dropping back to great_eye", () => {
    // 16 perfect days = 80 points (match_maker), then away 12 days: -15 → 65.
    const games = Array.from({ length: 16 }, (_, i) => perfect(i));
    const r = computeWhoopPoints(games, day(15 + 12));
    expect(r.peakTotal).toBe(80);
    expect(r.total).toBe(65);
    expect(r.tier).toBe("great_eye");
    expect(r.highestTierEver).toBe("match_maker");
    expect(r.badges.map((b) => b.key)).toEqual(["rookie", "great_eye", "match_maker"]);
    expect(r.badges.find((b) => b.key === "match_maker")?.earnedOn).toBe(day(14)); // 75 at game 15
  });

  it("is deterministic regardless of input order", () => {
    const games = Array.from({ length: 12 }, (_, i) => perfect(i));
    const a = computeWhoopPoints(games, day(20));
    const b = computeWhoopPoints([...games].reverse(), day(20));
    expect(a).toEqual(b);
  });
});
