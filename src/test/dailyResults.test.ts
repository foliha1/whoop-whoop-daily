import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/lib/visitor", () => ({
  getVisitorId: () => "visitor-abc",
}));

import { saveDailyResultRemote, fetchDailyResults } from "@/lib/dailyResults";
import type { DailyResult } from "@/lib/daily";

const result: DailyResult = {
  seed: "whoop-2026-08-05",
  puzzleNumber: 5,
  attributes: ["SHAPE", "COLOR", "NUMBER"],
  elapsedMs: 42_400.7,
  roundsSolved: 2,
  totalMisses: 3,
  roundEvents: [["SOLVE"], ["MISS", "MISS"], ["MISS", "SOLVE"]],
  peekUsed: true,
  peekRound: 2,
  failed: false,
  completedAt: "2026-08-05T07:00:00.000Z",
};

beforeEach(() => rpc.mockReset());

describe("saveDailyResultRemote", () => {
  it("writes the run through the save RPC with mapped arguments", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(saveDailyResultRemote(result)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("save_daily_result");
    expect(args).toEqual({
      p_visitor_id: "visitor-abc",
      p_puzzle_number: 5,
      p_puzzle_date: "2026-08-05",
      p_rounds_solved: 2,
      p_total_misses: 3,
      p_peek_used: true,
      p_round_events: [["SOLVE"], ["MISS", "MISS"], ["MISS", "SOLVE"]],
      p_elapsed_ms: 42_401,
    });
  });

  it("reports false when the RPC quietly rejects a duplicate", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(saveDailyResultRemote(result)).resolves.toBe(false);
  });

  it("reports false when the RPC returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(saveDailyResultRemote(result)).resolves.toBe(false);
  });

  it("never throws when the network call blows up", async () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(saveDailyResultRemote(result)).resolves.toBe(false);
  });

});

describe("fetchDailyResults", () => {
  it("returns rows ordered by puzzle number", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          puzzle_number: 1,
          puzzle_date: "2026-08-01",
          rounds_solved: 3,
          total_misses: 0,
          peek_used: false,
          round_events: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
          elapsed_ms: 30000,
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const rows = await fetchDailyResults();
    expect(rpc).toHaveBeenCalledWith("get_daily_results", {
      p_visitor_id: "visitor-abc",
    });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "created_at",
        "elapsed_ms",
        "peek_used",
        "puzzle_date",
        "puzzle_number",
        "round_events",
        "rounds_solved",
        "total_misses",
      ].sort()
    );
    expect(rows[0].puzzle_number).toBe(1);
  });

  it("returns an empty list on error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(fetchDailyResults()).resolves.toEqual([]);
  });
});
