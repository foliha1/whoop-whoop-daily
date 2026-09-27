// ============================================================================
// seatOwnership — server-side check that a visitor really occupies a seat.
//
// Seat maps are frozen by the host at game start and persisted to
// public.room_seats via the register_room_seats RPC (host-only). The claim
// arbiter joins against that record so a client cannot claim, or release,
// a seat that is not theirs.
// ============================================================================

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Security pass 2: the seat's secret session key is required. A missing, empty
// or wrong key is refused with 403 (enabled after pass 2 was published).
export const REQUIRE_PLAYER_KEY = true;

export type SeatCheck = { ok: true } | { ok: false; reason: string };

export async function verifySeatOwner(
  supabase: SupabaseClient,
  input: { room_id: string; game_id: string; seat: number; visitor_id: string; player_key?: unknown },
): Promise<SeatCheck> {
  const keyGiven = typeof input.player_key === "string" && input.player_key.length > 0;
  if (!keyGiven && (REQUIRE_PLAYER_KEY || input.player_key !== undefined)) {
    return { ok: false, reason: "missing_seat_key" };
  }
  const { data, error } = await supabase
    .from("room_seats")
    .select("visitor_id, player_key")
    .eq("room_id", input.room_id)
    .eq("game_id", input.game_id)
    .eq("seat", input.seat)
    .maybeSingle();

  if (error) {
    console.error("[seatOwnership] lookup failed", error);
    return { ok: false, reason: "seat_lookup_failed" };
  }
  if (!data) return { ok: false, reason: "seat_not_registered" };
  if (data.visitor_id !== input.visitor_id) return { ok: false, reason: "seat_not_owned" };
  if (keyGiven && data.player_key !== input.player_key) return { ok: false, reason: "bad_seat_key" };
  return { ok: true };
}
