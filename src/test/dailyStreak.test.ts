import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/lib/visitor", () => ({
  getVisitorId: () => "visitor-abc",
}));

import { fetchStreak, formatStreakLine } from "@/lib/dailyResults";
import { formatDailyShare } from "@/lib/daily";
import type { DailyResult } from "@/lib/daily";

const result: DailyResult = {
  seed: "whoop-2026-08-05",
  puzzleNumber: 5,
  attributes: ["SHAPE", "COLOR", "NUMBER"],
  elapsedMs: 40_000,
  roundsSolved: 3,
  totalMisses: 0,
  roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
  peekUsed: false,
  peekRound: null,
  failed: false,
  completedAt: "2026-08-05T07:00:00.000Z",
};

beforeEach(() => rpc.mockReset());

describe("fetchStreak", () => {
  it("returns the counts for consecutive days", async () => {
    rpc.mockResolvedValue({
      data: [{ current_streak: 4, longest_streak: 6 }],
      error: null,
    });

    await expect(fetchStreak(5)).resolves.toEqual({ current: 4, longest: 6 });
    expect(rpc).toHaveBeenCalledWith("get_streak", {
      p_visitor_id: "visitor-abc",
      p_current_puzzle_number: 5,
    });
  });

  it("reports a broken streak as zero current with the longest kept", async () => {
    rpc.mockResolvedValue({
      data: [{ current_streak: 0, longest_streak: 9 }],
      error: null,
    });
    await expect(fetchStreak(20)).resolves.toEqual({ current: 0, longest: 9 });
  });

  it("returns zeroes for a visitor with no rows", async () => {
    rpc.mockResolvedValue({
      data: [{ current_streak: 0, longest_streak: 0 }],
      error: null,
    });
    await expect(fetchStreak(1)).resolves.toEqual({ current: 0, longest: 0 });
  });

  it("returns null on error so the caller can hide the line", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchStreak(5)).resolves.toBeNull();
  });

  it("never throws when the network call blows up", async () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(fetchStreak(5)).resolves.toBeNull();
  });
});

describe("formatStreakLine", () => {
  it("uses the singular on day one", () => {
    expect(formatStreakLine(1)).toBe("Streak: 1 day");
  });

  it("uses the plural beyond day one", () => {
    expect(formatStreakLine(4)).toBe("Streak: 4 days");
  });
});

describe("share block streak threshold", () => {
  const scoreLine = (text: string) => text.split("\n")[2];

  it("omits the streak below three days", () => {
    expect(scoreLine(formatDailyShare(result, 2))).toBe("3 of 3 · Clean");
  });

  it("appends the streak at exactly three days", () => {
    expect(scoreLine(formatDailyShare(result, 3))).toBe("3 of 3 · Clean · 3 day streak");
  });

  it("appends the streak above three days", () => {
    expect(scoreLine(formatDailyShare(result, 5))).toBe("3 of 3 · Clean · 5 day streak");
  });

  it("omits the streak when it is unknown", () => {
    expect(scoreLine(formatDailyShare(result, null))).toBe("3 of 3 · Clean");
    expect(scoreLine(formatDailyShare(result))).toBe("3 of 3 · Clean");
  });
});
