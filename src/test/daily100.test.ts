// Daily #100: title copy, the keepsake badge, and the splash guard.

import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_100_SEED, KEEPSAKE_KEY, dailyTitle, hasDaily100Keepsake,
  isSplashPreview, markSplashSeen, splashSeen, withKeepsake,
} from "@/lib/daily100";
import { dailyStorageKey } from "@/lib/daily";

describe("dailyTitle", () => {
  it("names #100 '100 Days of Daily' and leaves other days alone", () => {
    expect(dailyTitle(100)).toBe("100 Days of Daily");
    expect(dailyTitle(99)).toBe("Whoop! Whoop! Daily #99");
    expect(dailyTitle(101, "WHOOP! WHOOP!")).toBe("WHOOP! WHOOP! Daily #101");
  });
});

describe("keepsake badge", () => {
  beforeEach(() => window.localStorage.clear());

  it("is not earned without a Daily #100 result", () => {
    expect(hasDaily100Keepsake()).toBe(false);
    expect(withKeepsake([])).toEqual([]);
  });

  it("is earned once a Daily #100 result is stored, dated 18 Nov, listed first", () => {
    window.localStorage.setItem(
      dailyStorageKey(DAILY_100_SEED),
      JSON.stringify({ seed: DAILY_100_SEED, puzzleNumber: 100, elapsedMs: 1000 }),
    );
    expect(hasDaily100Keepsake()).toBe(true);
    const badges = withKeepsake([{ key: "rookie", earnedOn: "2026-09-01" }]);
    expect(badges[0]).toEqual({ key: KEEPSAKE_KEY, earnedOn: "2026-11-18" });
    expect(badges).toHaveLength(2);
  });

  it("is never added twice", () => {
    const once = withKeepsake([], true);
    expect(withKeepsake(once, true)).toHaveLength(1);
  });
});

describe("splash guard", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers it was seen", () => {
    expect(splashSeen()).toBe(false);
    markSplashSeen();
    expect(splashSeen()).toBe(true);
  });

  it("previews only with ?splash=1", () => {
    expect(isSplashPreview("?splash=1")).toBe(true);
    expect(isSplashPreview("?skin=holo")).toBe(false);
  });
});
