import { describe, expect, it } from "vitest";
import { homeIrlStage, showHomeIrl } from "@/lib/homeIrl";

describe("homeIrlStage", () => {
  it("is the banner through 28 Nov 2026 (local)", () => {
    expect(homeIrlStage(new Date(2026, 10, 18, 12))).toBe("banner");
    expect(homeIrlStage(new Date(2026, 10, 28, 23, 59, 59))).toBe("banner");
  });
  it("is the tile from 29 Nov 2026 (local)", () => {
    expect(homeIrlStage(new Date(2026, 10, 29, 0, 0, 0))).toBe("tile");
    expect(homeIrlStage(new Date(2027, 2, 1))).toBe("tile");
  });
});

describe("showHomeIrl", () => {
  it("banner is for subscribers only", () => {
    expect(showHomeIrl("banner", true)).toBe(true);
    expect(showHomeIrl("banner", false)).toBe(false);
  });
  it("tile is for everyone", () => {
    expect(showHomeIrl("tile", true)).toBe(true);
    expect(showHomeIrl("tile", false)).toBe(true);
  });
});
