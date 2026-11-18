import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const track = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { subscribeToUpdates } from "@/lib/updatesSubscribe";
import { hasUpdatesSubscription } from "@/lib/updatesSubscriptionStatus";

beforeEach(() => {
  invoke.mockReset().mockResolvedValue({ data: { ok: true, syncedToAc: true }, error: null });
  track.mockReset();
  localStorage.clear();
  window.__lovableEvents = { track } as typeof window.__lovableEvents;
});

describe("WW: Updates signup", () => {
  it("sends a normalized address to the updates list with pre-order attribution", async () => {
    await expect(subscribeToUpdates(" Player@Example.COM ", "preorder")).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("ac-subscribe", {
      body: { email: "player@example.com", list: "updates", source: "preorder" },
    });
    expect(track).toHaveBeenCalledWith("project.updates_list_added", { via: "preorder" });
    expect(hasUpdatesSubscription()).toBe(true);
  });

  it("rejects invalid addresses without calling the email service", async () => {
    await expect(subscribeToUpdates("not-an-email", "preorder")).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed when the list addition is rejected or unavailable", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false }, error: null });
    await expect(subscribeToUpdates("player@example.com", "preorder")).resolves.toBe(false);
    invoke.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    await expect(subscribeToUpdates("player@example.com", "preorder")).resolves.toBe(false);
    expect(track).not.toHaveBeenCalled();
    expect(hasUpdatesSubscription()).toBe(false);
  });
});
