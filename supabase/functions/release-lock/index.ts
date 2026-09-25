// ============================================================================
// release-lock — host-invoked cleanup for orphaned claim locks.
//
// When the arbiter grants a WHOOP but the host reducer refuses the resulting
// PLAYER_ENTER_CLAIM* (e.g. AWAITING_ROLL claim by a non-roller), the
// claim_locks row must be deleted so the same (room_id, game_id, claim_window)
// key can be re-claimed. Without this, the window is permanently occupied
// and every later claim in it returns won:false.
//
// Also broadcasts a `claim_reject` so the pressing player exits their
// LOCKING… state instead of hanging on an invisible win.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifySeatOwner } from "../_shared/seatOwnership.ts";

interface Body {
  room_id: string;
  game_id: string;
  claim_window: number;
  seat: number;
  visitor_id: string;
  reason?: string;
}

function bad(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  let body: Body;
  try { body = await req.json(); } catch { return bad(400, "invalid_json"); }
  const { room_id, game_id, claim_window, seat, visitor_id, reason } = body ?? {};
  if (
    typeof room_id !== "string" || !room_id ||
    typeof game_id !== "string" || !game_id ||
    typeof claim_window !== "number" || !Number.isFinite(claim_window) || claim_window < 0 ||
    typeof seat !== "number" || !Number.isFinite(seat) || seat < 0 ||
    typeof visitor_id !== "string" || !visitor_id
  ) {
    return bad(400, "invalid_body");
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Only the host of this room may release a lock — releasing is a cleanup
  // action for grants the host reducer refused, never a player action.
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("host_visitor_id")
    .eq("id", room_id)
    .maybeSingle();
  if (roomErr) {
    console.error("[release-lock] room lookup failed", roomErr);
    return bad(500, "room_lookup_failed");
  }
  if (!room) return bad(403, "unknown_room");

  if (room.host_visitor_id !== visitor_id) {
    // Non-host callers may only release a lock they themselves hold.
    const seatCheck = await verifySeatOwner(supabase, { room_id, game_id, seat, visitor_id });
    if (!seatCheck.ok) {
      console.warn("[release-lock] refused", seatCheck.reason, { room_id, game_id, seat });
      return bad(403, seatCheck.reason);
    }
    const { data: lock } = await supabase
      .from("claim_locks")
      .select("player_seat")
      .eq("room_id", room_id)
      .eq("game_id", game_id)
      .eq("claim_window", claim_window)
      .maybeSingle();
    if (lock && lock.player_seat !== seat) return bad(403, "lock_not_owned");
  }

  const { error: delErr } = await supabase
    .from("claim_locks")
    .delete()
    .eq("room_id", room_id)
    .eq("game_id", game_id)
    .eq("claim_window", claim_window);

  if (delErr) {
    console.error("[release-lock] delete failed", delErr);
    return bad(500, "delete_failed");
  }

  // Notify the pressing player so they exit LOCKING…. Reuse claim_reject
  // envelope shape; use STALE_WINDOW as the reason bucket for "grant refused
  // by host reducer" since the effect is identical from the client's POV.
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: `room:${room_id}`,
          event: "msg",
          payload: {
            v: 1,
            type: "claim_reject",
            seq: 0,
            payload: {
              grant_claim_window: claim_window,
              host_claim_window: claim_window,
              seat,
              // No browser id on the shared channel; clients match by seat.
              reason: reason ?? "STALE_WINDOW",
            },
          },
        }],
      }),
    });
  } catch (e) {
    console.error("[release-lock] broadcast POST threw", e);
    // Don't fail the release — the row is deleted, that's the critical bit.
  }

  return new Response(JSON.stringify({ released: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
