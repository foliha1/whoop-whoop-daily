// A Daily run refused because the browser is linked to an account with no
// session (an expired sign-in) is kept on the device and saved after sign-in.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "browser-a" }));
const acct = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: [] as Array<(e: string | null) => void>,
}));
vi.mock("@/lib/account", async (orig) => {
  const m = await orig<typeof import("@/lib/account")>();
  return {
    ...m,
    getSessionEmail: () => null,
    getSessionUserId: () => acct.userId,
    whenAccountReady: async () => null,
    onAccountChange: (fn: (e: string | null) => void) => {
      acct.listeners.push(fn);
      return () => { acct.listeners = acct.listeners.filter((f) => f !== fn); };
    },
  };
});

import { useDailyGame } from "@/hooks/useDailyGame";
import { saveDailyResult, type DailyResult } from "@/lib/daily";

function keptRun(seed: string, puzzleNumber: number): DailyResult {
  return {
    seed, puzzleNumber, attributes: [], elapsedMs: 40_000, roundsSolved: 3, totalMisses: 1,
    roundEvents: [["SOLVE"], ["MISS", "SOLVE"], ["SOLVE"]], peekUsed: false, peekRound: null,
    failed: false, completedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
  localStorage.clear();
  acct.userId = null;
  acct.listeners = [];
});

async function setupKeptGame() {
  const probe = renderHook(() => useDailyGame());
  const { seed, puzzleNumber } = probe.result.current;
  probe.unmount();
  saveDailyResult(keptRun(seed, puzzleNumber), "anon");
  localStorage.setItem(`ww_daily_pending_save_${puzzleNumber}`, "1");
  return puzzleNumber;
}

describe("a game refused while signed out", () => {
  it("stays on the device and shows the sign-in prompt without retrying", async () => {
    const n = await setupKeptGame();
    const { result } = renderHook(() => useDailyGame());
    expect(result.current.needsSignInToSave).toBe(true);
    expect(result.current.result?.roundsSolved).toBe(3);
    await new Promise((r) => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalledWith("save_daily_result", expect.anything());
    expect(localStorage.getItem(`ww_daily_pending_save_${n}`)).toBe("1");
  });

  it("is saved once the player signs in, then the prompt clears", async () => {
    const n = await setupKeptGame();
    const { result } = renderHook(() => useDailyGame());
    acct.userId = "user-1";
    act(() => acct.listeners.forEach((f) => f("p@example.com")));
    await waitFor(() => expect(result.current.needsSignInToSave).toBe(false));
    expect(rpc).toHaveBeenCalledWith(
      "save_daily_result",
      expect.objectContaining({ p_visitor_id: "browser-a", p_rounds_solved: 3, p_total_misses: 1 })
    );
    expect(localStorage.getItem(`ww_daily_pending_save_${n}`)).toBeNull();
    // The game itself is never lost.
    expect(result.current.result?.roundsSolved).toBe(3);
  });

  it("clears the prompt when the account already has today's first attempt", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await setupKeptGame();
    const { result } = renderHook(() => useDailyGame());
    acct.userId = "user-1";
    act(() => acct.listeners.forEach((f) => f("p@example.com")));
    await waitFor(() => expect(result.current.needsSignInToSave).toBe(false));
    expect(result.current.result).not.toBeNull();
  });
});
