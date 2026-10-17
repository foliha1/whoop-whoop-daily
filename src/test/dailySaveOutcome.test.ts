import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "v1" }));

import { saveDailyResultOutcome, markDailyOutbox, hasDailyOutbox, clearDailyOutbox } from "@/lib/dailyResults";
import type { DailyResult } from "@/lib/daily";

const run = {
  seed: "whoop-2026-10-17", puzzleNumber: 70, attributes: [], elapsedMs: 1000,
  roundsSolved: 1, totalMisses: 0, roundEvents: [], peekUsed: false, peekRound: null,
  failed: false, completedAt: "",
} as unknown as DailyResult;

beforeEach(() => { rpc.mockReset(); localStorage.clear(); });

describe("Daily save outcome", () => {
  it("a new row is stored", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await saveDailyResultOutcome(run)).toBe("stored");
  });
  it("a server decline (duplicate etc.) is refused, not retried", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await saveDailyResultOutcome(run)).toBe("refused");
  });
  it("an error response is retryable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "503" } });
    expect(await saveDailyResultOutcome(run)).toBe("retryable");
  });
  it("a network failure is retryable", async () => {
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await saveDailyResultOutcome(run)).toBe("retryable");
  });
  it("the outbox survives until cleared", () => {
    markDailyOutbox(70);
    expect(hasDailyOutbox(70)).toBe(true);
    clearDailyOutbox(70);
    expect(hasDailyOutbox(70)).toBe(false);
  });
});
