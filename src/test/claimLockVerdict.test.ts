import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { callClaimLock } from "@/lib/claimLock";

const input = { room_id: "r", game_id: "g", claim_window: 3, player_seat: 1, visitor_id: "v" };
beforeEach(() => invoke.mockReset());

describe("claim verdicts are strict", () => {
  it("a fresh win for this seat is won", async () => {
    invoke.mockResolvedValue({ data: { won: true, winner_seat: 1, claim_window: 3 }, error: null });
    expect((await callClaimLock(input)).outcome).toBe("won");
  });
  it("another seat named as winner is lost", async () => {
    invoke.mockResolvedValue({ data: { won: false, winner_seat: 2, claim_window: 3 }, error: null });
    expect((await callClaimLock(input)).outcome).toBe("lost");
  });
  it("a reply missing the winner seat is never a loss", async () => {
    invoke.mockResolvedValue({ data: { won: false, claim_window: 3 }, error: null });
    expect((await callClaimLock(input)).outcome).toBe("unknown");
  });
  it("a reply for a different window is never a loss", async () => {
    invoke.mockResolvedValue({ data: { won: false, winner_seat: 2, claim_window: 4 }, error: null });
    expect((await callClaimLock(input)).outcome).toBe("unknown");
  });
});
