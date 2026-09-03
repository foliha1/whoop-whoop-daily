// ============================================================================
// claim-lock — the WHOOP! arbiter.
//
// Fairness mechanism: a UNIQUE (room_id, claim_window) index on claim_locks.
// First successful INSERT wins. Arrival order at Postgres is the ordering.
// We NEVER trust client-supplied time.
//
// On a successful insert, the function broadcasts `claim_grant` on the room's
// Realtime channel using the service role client. The host listens and
// dispatches PLAYER_ENTER_CLAIM locally. This makes the arbiter the single
// authoritative announcer — a client cannot forge a win.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifySeatOwner } from "../_shared/seatOwnership.ts";

interface Body {
  room_id: string;
  game_id: string;
  claim_window: number;
  player_seat: number;
  visitor_id: string;
}

function bad(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  // Warm-up path. The host fires one `{ warmup: true }` request at game start
  // purely to boot this instance. It is distinguished by that explicit flag —
  // a real claim never sets it — and it returns HERE, before the seat check,
  // before any client is created, and therefore before any insert or
  // broadcast can possibly happen. It cannot win a claim window.
  if ((body as { warmup?: unknown } | null)?.warmup === true) {
    return new Response(JSON.stringify({ warmed: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { room_id, game_id, claim_window, player_seat, visitor_id } = body ?? {};
  if (
    typeof room_id !== "string" ||
    typeof game_id !== "string" ||
    !game_id ||
    typeof claim_window !== "number" ||
    !Number.isFinite(claim_window) ||
    claim_window < 0 ||
    typeof player_seat !== "number" ||
    !Number.isFinite(player_seat) ||
    player_seat < 0 ||
    typeof visitor_id !== "string" ||
    !visitor_id
  ) {
    return bad(400, "invalid_body");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Authorize: the caller must actually occupy `player_seat` in this game.
  // Seats are frozen by the host at game start and persisted to room_seats.
  const seatCheck = await verifySeatOwner(supabase, {
    room_id, game_id, seat: player_seat, visitor_id,
  });
  if (!seatCheck.ok) {
    console.warn("[claim-lock] seat authorization refused", seatCheck.reason, { room_id, game_id, player_seat });
    return bad(403, seatCheck.reason);
  }

  // Attempt to claim the window. UNIQUE (room_id, game_id, claim_window) is
  // the fairness mechanism — first insert wins.
  const { error: insertErr } = await supabase.from("claim_locks").insert({
    room_id,
    game_id,
    claim_window,
    player_seat,
  });

  if (!insertErr) {
    // We won — announce it authoritatively over Realtime via the REST
    // broadcast endpoint. `supabase.channel(...).send(...)` without
    // `.subscribe()` does NOT publish in supabase-js v2, so we POST
    // directly to /realtime/v1/api/broadcast. Topic + event name match
    // what useRoomPresence subscribes to (`room:${roomId}`, event `msg`).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    try {
      const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          messages: [
            {
              topic: `room:${room_id}`,
              event: "msg",
              payload: {
                v: 1,
                type: "claim_grant",
                seq: 0,
                payload: { claim_window, seat: player_seat, visitor_id },
              },
            },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[claim-lock] broadcast POST failed", res.status, text);
        return new Response(
          JSON.stringify({ won: false, winner_seat: null, claim_window }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      console.error("[claim-lock] broadcast POST threw", e);
      return new Response(
        JSON.stringify({ won: false, winner_seat: null, claim_window }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ won: true, winner_seat: player_seat, claim_window }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 23505 = unique_violation → someone else already won this window.
  const code = (insertErr as { code?: string }).code;
  if (code === "23505") {
    const { data: existing, error: selErr } = await supabase
      .from("claim_locks")
      .select("player_seat")
      .eq("room_id", room_id)
      .eq("game_id", game_id)
      .eq("claim_window", claim_window)
      .maybeSingle();
    if (selErr || !existing) {
      return bad(500, "select_after_conflict_failed");
    }
    return new Response(
      JSON.stringify({ won: false, winner_seat: existing.player_seat, claim_window }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.error("[claim-lock] insert failed", insertErr);
  return bad(500, "insert_failed");
});
