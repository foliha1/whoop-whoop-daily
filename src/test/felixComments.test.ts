import { describe, expect, it } from "vitest";
import { felixDailyComment } from "@/components/DailySoloPrompt";

describe("FELIX says variations", () => {
  it("teases a peek that did not save the run", () => {
    expect(felixDailyComment(1, 6, { peekUsed: true, seed: 0 })).toMatch(/peek/i);
  });
  it("mentions a 10+ day streak by number", () => {
    expect(felixDailyComment(3, 0, { streak: 12, seed: 1 })).toContain("12");
  });
  it("stays the same for the same puzzle", () => {
    expect(felixDailyComment(2, 1, { seed: 140 })).toBe(felixDailyComment(2, 1, { seed: 140 }));
  });
  it("varies across puzzles", () => {
    const lines = new Set([0, 1, 2].map((seed) => felixDailyComment(2, 1, { seed })));
    expect(lines.size).toBeGreaterThan(1);
  });
});
