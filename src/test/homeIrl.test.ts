import { describe, expect, it } from "vitest";
import { homeIrlStage, showHomeIrl } from "@/lib/homeIrl";

describe("homeIrlStage", () => {
  it("uses the compact tile immediately, including during the old banner window", () => {
    expect(homeIrlStage(new Date(2026, 10, 18, 12))).toBe("tile");
    expect(homeIrlStage(new Date(2026, 10, 28, 23, 59, 59))).toBe("tile");
    expect(homeIrlStage(new Date(2026, 10, 29, 0, 0, 0))).toBe("tile");
  });
});

describe("showHomeIrl", () => {
  it("tile is for everyone", () => {
    expect(showHomeIrl("tile", true)).toBe(true);
    expect(showHomeIrl("tile", false)).toBe(true);
  });
});
