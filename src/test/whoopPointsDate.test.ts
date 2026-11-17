import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "points-date-test" }));
vi.mock("@/lib/dailySubscribe", () => ({ getSubscribedEmail: () => null }));

import { fetchWhoopPoints } from "@/lib/whoopPoints";

afterEach(() => { vi.restoreAllMocks(); rpc.mockReset(); });

describe("point-total date alignment", () => {
  it("includes the Madrid November 18 result worth 4 points in both totals", async () => {
    // The same instant is still November 17 UTC, but November 18 in Madrid.
    const madridNow = new Date("2026-11-17T23:54:00Z");
    vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
    vi.spyOn(Date.prototype, "getMonth").mockReturnValue(10);
    vi.spyOn(Date.prototype, "getDate").mockReturnValue(18);
    expect(madridNow.toISOString().slice(0, 10)).toBe("2026-11-17");
    rpc.mockImplementation(async (_name, args) => ({
      data: [{ total: args.p_puzzle_date === "2026-11-18" ? 82 : 78 }], error: null,
    }));

    const stats = await fetchWhoopPoints();
    const results = await fetchWhoopPoints(undefined, undefined, "2026-11-18");
    expect(stats?.total).toBe(82);
    expect(results?.total).toBe(82);
    expect(rpc).toHaveBeenNthCalledWith(1, "get_whoop_points", {
      p_visitor_id: "points-date-test", p_puzzle_date: "2026-11-18",
    });
  });

  it("preserves an explicit played date when the device has rolled over", async () => {
    rpc.mockResolvedValue({ data: [{ total: 78 }], error: null });
    await fetchWhoopPoints("points-date-test", null, "2026-11-17");
    expect(rpc).toHaveBeenCalledWith("get_whoop_points", {
      p_visitor_id: "points-date-test", p_puzzle_date: "2026-11-17",
    });
  });
});