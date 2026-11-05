import { describe, expect, it } from "vitest";
import { adminBarPercent, adminDateRange } from "@/lib/adminPresentation";

describe("admin date presets", () => {
  const now = new Date(2026, 10, 5, 17, 32);
  it.each([
    [1, "2026-11-05"],
    [7, "2026-10-30"],
    [14, "2026-10-23"],
    [30, "2026-10-07"],
  ])("uses an inclusive %i-day window", (days, from) => {
    expect(adminDateRange(days, now)).toEqual({ from, to: "2026-11-05" });
  });
  it("crosses a year boundary without mutating the reference date", () => {
    const date = new Date(2027, 0, 2, 12);
    expect(adminDateRange(7, date)).toEqual({ from: "2026-12-27", to: "2027-01-02" });
    expect(date.getDate()).toBe(2);
  });
});

describe("admin bar scaling", () => {
  it("compares counts to a common baseline", () => {
    expect(adminBarPercent(25, 200)).toBe(12.5);
    expect(adminBarPercent(100, 200)).toBe(50);
  });
  it("keeps empty, invalid and larger-than-baseline geometry bounded", () => {
    expect(adminBarPercent(0, 0)).toBe(0);
    expect(adminBarPercent(20, 0)).toBe(0);
    expect(adminBarPercent(300, 200)).toBe(100);
    expect(adminBarPercent(-2, 100)).toBe(0);
    expect(adminBarPercent(NaN, 100)).toBe(0);
  });
});