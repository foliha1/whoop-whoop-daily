import { describe, it, expect } from "vitest";
import { isLiveCardIdx } from "@/hooks/useGameState";

const s = { grid: [{}, null, {}] } as any;

describe("card index validation", () => {
  it("accepts a filled in-range slot", () => expect(isLiveCardIdx(s, 0)).toBe(true));
  it("rejects an empty slot", () => expect(isLiveCardIdx(s, 1)).toBe(false));
  it("rejects out of range", () => {
    expect(isLiveCardIdx(s, 3)).toBe(false);
    expect(isLiveCardIdx(s, -1)).toBe(false);
  });
  it("rejects fractions, NaN and strings", () => {
    expect(isLiveCardIdx(s, 0.5)).toBe(false);
    expect(isLiveCardIdx(s, NaN)).toBe(false);
    expect(isLiveCardIdx(s, "0")).toBe(false);
  });
});
