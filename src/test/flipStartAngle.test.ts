import { describe, it, expect } from "vitest";
import { flipStartAngle } from "@/lib/flipStartAngle";
import { CARD_FLIP_MS } from "@/lib/animationTiming";

describe("flipStartAngle", () => {
  it("starts fully face down at 0ms", () => expect(flipStartAngle(0)).toBeCloseTo(180));
  it("is mid-way part through", () => {
    const a = flipStartAngle(CARD_FLIP_MS / 2)!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(180);
  });
  it("no flip once the flip has finished", () => {
    expect(flipStartAngle(CARD_FLIP_MS)).toBeNull();
    expect(flipStartAngle(CARD_FLIP_MS + 200)).toBeNull();
  });
});
