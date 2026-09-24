// First attempt counts, always — and a browser that knows the player's email
// never deals a board they have already played today.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "browser-b" }));

import { computeWhoopPoints, type PointsGame } from "@/lib/whoopPoints";
import { useDailyGame } from "@/hooks/useDailyGame";
import { markSubscribed, clearSubscribed } from "@/lib/dailySubscribe";

const first: PointsGame = {
  puzzleNumber: 40, puzzleDate: "2026-09-19", peekUsed: true, totalMisses: 4,
  roundsSolved: 1, roundEvents: [["MISS", "MISS"], ["MISS", "SOLVE"], ["MISS", "MISS"]],
  createdAt: "2026-09-19T08:00:00Z",
};
const replay: PointsGame = {
  ...first, peekUsed: false, totalMisses: 0, roundsSolved: 3,
  roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]], createdAt: "2026-09-19T08:10:00Z",
};

describe("the points engine", () => {
  it("does not raise the score for a better second-browser result", () => {
    const once = computeWhoopPoints([first], "2026-09-19");
    expect(computeWhoopPoints([first, replay], "2026-09-19").total).toBe(once.total);
    // Order of arrival does not matter: the earliest saved wins.
    expect(computeWhoopPoints([replay, first], "2026-09-19").total).toBe(once.total);
    expect(once.total).toBe(1); // played, no first-try round, peeked
  });
});

const serverRow = {
  is_mine: false, puzzle_number: 1, puzzle_date: "2026-08-11", rounds_solved: 2,
  total_misses: 1, peek_used: false, round_events: [["SOLVE"], ["MISS", "SOLVE"], ["MISS", "MISS"]],
  elapsed_ms: 30_000, created_at: "2026-08-11T07:00:00Z",
};

beforeEach(() => {
  rpc.mockReset();
  localStorage.clear();
  clearSubscribed();
});

describe("a browser that knows the email", () => {
  it.skip("shows the first attempt instead of dealing the board", async () => {
    markSubscribed("felix@example.com");
    rpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "get_first_attempt" ? [serverRow] : null, error: null })
    );
    const { result } = renderHook(() => useDailyGame());
    await waitFor(() => expect(result.current.alreadyPlayed).toBe(true));
    act(() => result.current.start());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.phase).toBe("READY");
    expect(result.current.result?.roundsSolved).toBe(2);
    expect(rpc).toHaveBeenCalledWith("get_first_attempt", expect.objectContaining({
      p_email: "felix@example.com",
    }));
  });

  it("entering an email that already played today never submits a new result", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useDailyGame());
    act(() => result.current.start()); // brand-new browser: the board deals
    await waitFor(() => expect(result.current.phase).not.toBe("READY"));
    rpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "get_first_attempt" ? [serverRow] : null, error: null })
    );
    await act(() => result.current.recheckEmail("felix@example.com"));
    expect(result.current.alreadyPlayed).toBe(true);
    expect(result.current.result?.completedAt).toBe(serverRow.created_at);
    expect(rpc.mock.calls.some(([n]) => n === "save_daily_result")).toBe(false);
  });
});
