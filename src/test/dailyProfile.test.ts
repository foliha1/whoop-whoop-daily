import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-new" }));
const acct = vi.hoisted(() => ({ email: null as string | null }));
vi.mock("@/lib/account", async (orig) => {
  const m = await orig<typeof import("@/lib/account")>();
  return { ...m, getSessionEmail: () => acct.email, whenAccountReady: async () => acct.email };
});


import {
  fetchDailyPercentile,
  fetchDailyStats,
  fetchStreak,
  formatAvgMisses,
  formatPercentileLine,
} from "@/lib/dailyResults";
import { formatDailyShare, type DailyResult } from "@/lib/daily";

const result: DailyResult = {
  seed: "whoop-2026-08-08",
  puzzleNumber: 8,
  attributes: ["SHAPE", "COLOR", "NUMBER"],
  elapsedMs: 40_000,
  roundsSolved: 3,
  totalMisses: 0,
  roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
  peekUsed: false,
  peekRound: null,
  failed: false,
  completedAt: "2026-08-08T07:00:00.000Z",
};

beforeEach(() => {
  rpc.mockReset();
  localStorage.clear();
  acct.email = null;
});

describe("streak union across visitor ids sharing an email", () => {
  it("omits the email argument when this browser never subscribed", async () => {
    rpc.mockResolvedValue({
      data: [{ current_streak: 1, longest_streak: 1 }],
      error: null,
    });
    await fetchStreak(8);
    expect(rpc).toHaveBeenCalledWith("get_streak", {
      p_visitor_id: "visitor-new",
      p_current_puzzle_number: 8,
    });
  });

  it("a signed-in fresh visitor id restores the streak without sending an email", async () => {
    // Device 1 played puzzles 5-7; device 2 is a new visitor id, signed in.
    acct.email = "player@example.com";
    rpc.mockResolvedValue({
      data: [{ current_streak: 4, longest_streak: 4 }],
      error: null,
    });

    await expect(fetchStreak(8)).resolves.toEqual({ current: 4, longest: 4 });
    expect(rpc).toHaveBeenCalledWith("get_streak", {
      p_visitor_id: "visitor-new",
      p_current_puzzle_number: 8,
    });
  });

  it("still hides the line when the union read fails", async () => {
    acct.email = "player@example.com";
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchStreak(8)).resolves.toBeNull();
  });
});

describe("fetchDailyStats", () => {
  it("maps the aggregated row", async () => {
    rpc.mockResolvedValue({
      data: [
        { total_played: 12, clean_runs: 3, best_streak: 6, avg_misses: 1.42 },
      ],
      error: null,
    });

    // Explicit null email: this browser never subscribed.
    await expect(fetchDailyStats("visitor-new", null)).resolves.toEqual({
      totalPlayed: 12,
      cleanRuns: 3,
      bestStreak: 6,
      avgMisses: 1.42,
    });
    expect(rpc).toHaveBeenCalledWith("get_daily_stats", {
      p_visitor_id: "visitor-new",
    });
  });

  it("a signed-in player's stats span devices without sending an email", async () => {
    acct.email = "player@example.com";
    rpc.mockResolvedValue({
      data: [{ total_played: 4, clean_runs: 0, best_streak: 2, avg_misses: 0 }],
      error: null,
    });
    await expect(fetchDailyStats()).resolves.toMatchObject({ totalPlayed: 4 });
    expect(rpc).toHaveBeenCalledWith("get_daily_stats", {
      p_visitor_id: "visitor-new",
    });
  });

  it("returns null with nothing played, on error, and on a throw", async () => {
    rpc.mockResolvedValue({
      data: [{ total_played: 0, clean_runs: 0, best_streak: 0, avg_misses: 0 }],
      error: null,
    });
    await expect(fetchDailyStats()).resolves.toBeNull();

    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchDailyStats()).resolves.toBeNull();

    rpc.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(fetchDailyStats()).resolves.toBeNull();
  });
});

describe("percentile", () => {
  it("returns the server's percentage", async () => {
    rpc.mockResolvedValue({ data: 78, error: null });
    await expect(fetchDailyPercentile(8, "visitor-new", null)).resolves.toBe(78);
    expect(rpc).toHaveBeenCalledWith("get_daily_percentile", {
      p_visitor_id: "visitor-new",
      p_puzzle_number: 8,
    });
  });

  it("is null below the 20-player threshold (the server withholds it)", async () => {
    // Three players that day: the RPC returns null rather than "beat 66%".
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchDailyPercentile(8)).resolves.toBeNull();
  });

  it("is null on error or a throw", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchDailyPercentile(8)).resolves.toBeNull();
    rpc.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(fetchDailyPercentile(8)).resolves.toBeNull();
  });

  it("appends to the share text only when present", () => {
    const line = (t: string) => t.split("\n")[2];
    expect(line(formatDailyShare(result, 4, 78))).toBe(
      "3 of 3 · Clean · 4 day streak · Better than 78% today"
    );
    expect(line(formatDailyShare(result, 4, null))).toBe(
      "3 of 3 · Clean · 4 day streak"
    );
    expect(line(formatDailyShare(result, 4))).toBe("3 of 3 · Clean · 4 day streak");
  });
});

describe("formatters", () => {
  it("trims the average to one decimal", () => {
    expect(formatAvgMisses(0)).toBe("0");
    expect(formatAvgMisses(2)).toBe("2");
    expect(formatAvgMisses(1.44)).toBe("1.4");
    expect(formatAvgMisses(1.46)).toBe("1.5");
  });

  it("reads as a comparison, not a score", () => {
    expect(formatPercentileLine(78)).toBe("Better than 78% of today's players");
  });
});
