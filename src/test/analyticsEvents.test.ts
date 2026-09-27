import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const rpc = vi.fn((_fn: string, _args: Record<string, unknown>) =>
  Promise.resolve({ data: 1, error: null }),
);
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
    from: (t: string) => from(t),
  },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-test" }));

import { trackEvent } from "@/lib/analytics";

describe("trackEvent", () => {
  beforeEach(() => {
    rpc.mockClear();
    from.mockClear();
  });

  it("writes through log_analytics_events with a one-event batch", () => {
    trackEvent("room_joined", { roomCode: "ABC123", metadata: { seat: 1 } });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("log_analytics_events");
    expect(args).toEqual({
      p_visitor_id: "visitor-test",
      p_events: [{ event_type: "room_joined", room_code: "ABC123", metadata: { seat: 1 } }],
    });
  });

  it("never inserts into the table directly", () => {
    trackEvent("classic_demo_opened");
    expect(from).not.toHaveBeenCalled();
    const src = readFileSync("src/lib/analytics.ts", "utf8");
    expect(src).not.toMatch(/from\(\s*["']analytics_events/);
  });

  it("never throws when the call fails", () => {
    rpc.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => trackEvent("game_started")).not.toThrow();
  });

  it("no app file inserts into analytics_events directly", () => {
    const { execSync } = require("node:child_process");
    const out = execSync(
      "grep -rlE \"from\\([\\\"']analytics_events\" src --include=*.ts --include=*.tsx || true",
    ).toString().trim();
    expect(out).toBe("");
  });
});
