import { describe, it, expect } from "vitest";
import { studyLevelBonus } from "@/lib/studyLevels";
import { computeWhoopPoints, formatPoints, gamePoints } from "@/lib/whoopPoints";
import { formatPointsChange } from "@/lib/whoopTiers";

const solve = (n: number) => [0, 1, 2].map((i) => (i < n ? ["SOLVE"] : ["MISS", "MISS"]));

describe("study level score bonus", () => {
  it("Blink earns +0.5 per solved round", () => {
    expect([1, 2, 3].map((n) => studyLevelBonus("blink", n))).toEqual([0.5, 1, 1.5]);
  });
  it("Glance skips the first solved round", () => {
    expect([1, 2, 3].map((n) => studyLevelBonus("glance", n))).toEqual([0, 0.5, 1]);
  });
  it("Look, Study and missing levels earn nothing", () => {
    expect(studyLevelBonus("look", 3)).toBe(0);
    expect(studyLevelBonus("study", 3)).toBe(0);
    expect(studyLevelBonus(undefined, 3)).toBe(0);
  });
  it("counts rounds solved after a miss", () => {
    const g = { puzzleNumber: 1, puzzleDate: "2026-11-23", peekUsed: true, totalMisses: 1, roundsSolved: 1, roundEvents: [["MISS", "SOLVE"], ["MISS", "MISS"], ["MISS", "MISS"]], studyLevel: "blink" };
    expect(gamePoints(g)).toBe(1.5);
  });
  it("past Look results score exactly as before", () => {
    const g = { puzzleNumber: 1, puzzleDate: "2026-11-23", peekUsed: false, totalMisses: 0, roundsSolved: 3, roundEvents: solve(3) };
    expect(gamePoints(g)).toBe(5);
  });
  it("totals hold halves and show one decimal only when needed", () => {
    const g = { puzzleNumber: 1, puzzleDate: "2026-11-23", peekUsed: false, totalMisses: 0, roundsSolved: 3, roundEvents: solve(3), studyLevel: "glance" };
    expect(computeWhoopPoints([g], "2026-11-23").total).toBe(6);
    expect(formatPoints(87.5)).toBe("87.5");
    expect(formatPoints(87)).toBe("87");
    expect(formatPointsChange(4.5, 83, 87.5).text).toBe("+4.5 today");
  });
});
