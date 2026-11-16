import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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

  it.each(["localhost", "127.0.0.1", "id-preview--a1be2228-be40-4dcc-be73-f902253a9f30.lovable.app", "preview--whoop-whoop.lovable.app"])(
    "excludes pre-order views and clicks on %s", (hostname) => {
      vi.stubEnv("DEV", false);
      vi.stubGlobal("window", { location: { hostname } });
      trackEvent("preorder_view");
      trackEvent("preorder_click", { metadata: { quantity: 2 } });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each(["whoop-whoop.com", "www.whoop-whoop.com", "whoop-whoop.lovable.app"])(
    "counts public pre-order views and clicks on %s", (hostname) => {
      vi.stubEnv("DEV", false);
      vi.stubGlobal("window", { location: { hostname } });
      trackEvent("preorder_view");
      trackEvent("preorder_click", { metadata: { quantity: 2 } });
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(rpc.mock.calls[1][1].p_events).toEqual([
        { event_type: "preorder_click", room_code: null, metadata: { quantity: 2 } },
      ]);
    },
  );

  it("excludes development pre-order events even with a public hostname", () => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", { location: { hostname: "whoop-whoop.com" } });
    trackEvent("preorder_view");
    trackEvent("preorder_click");
    expect(rpc).not.toHaveBeenCalled();
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
    const out = execSync(
      "grep -rlE \"from\\([\\\"']analytics_events\" src --include=*.ts --include=*.tsx || true",
    ).toString().trim();
    expect(out).toBe("");
  });
});
