// Holo Day (Daily #100) skin: the one-day local-time gate and the switch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHoloSkin, holoDayOpen, setHoloSkinEnabled } from "@/lib/holoSkin";

describe("holoDayOpen", () => {
  it("is open all of 18 Nov 2026 local time", () => {
    expect(holoDayOpen(new Date(2026, 10, 18, 0, 0, 0))).toBe(true);
    expect(holoDayOpen(new Date(2026, 10, 18, 23, 59, 59))).toBe(true);
  });

  it("is closed the day before and the day after", () => {
    expect(holoDayOpen(new Date(2026, 10, 17, 23, 59, 59))).toBe(false);
    expect(holoDayOpen(new Date(2026, 10, 19, 0, 0, 0))).toBe(false);
  });

  it("does not come back next year", () => {
    expect(holoDayOpen(new Date(2027, 10, 18, 12))).toBe(false);
  });
});

describe("getHoloSkin", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    setHoloSkinEnabled(true);
  });

  it("is on by default on the day and follows the switch", () => {
    vi.setSystemTime(new Date(2026, 10, 18, 12));
    setHoloSkinEnabled(true);
    expect(getHoloSkin()).toBe(true);
    setHoloSkinEnabled(false);
    expect(getHoloSkin()).toBe(false);
    expect(window.localStorage.getItem("ww-skin-holo")).toBe("off");
  });

  it("is always off outside the day", () => {
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    setHoloSkinEnabled(true);
    expect(getHoloSkin()).toBe(false);
  });
});
