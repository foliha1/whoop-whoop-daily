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
import { serverPublicKeyB64, signServerEnvelope } from "../_shared/classicSign.ts";
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
  // Public half of the server signing key (never the private half).
  if ((body as { pubkey?: unknown } | null)?.pubkey === true) {
    return new Response(JSON.stringify({ pubkey: serverPublicKeyB64() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
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

  const json = (obj: unknown) =>
    new Response(JSON.stringify(obj), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!insertErr) {
    // The row is ours. A broadcast failure must NOT turn this into a loss:
    // the lock stays, we report "unknown", and the client's retry lands on
    // the conflict path below, which rebroadcasts and heals the host.
    const sent = await broadcastGrant(supabase, room_id, game_id, claim_window, player_seat);
    if (!sent) {
      return json({ won: null, outcome: "unknown", winner_seat: player_seat, claim_window });
    }
    return json({ won: true, winner_seat: player_seat, claim_window });
  }

  // 23505 = unique_violation → this window already has a winner.
  const code = (insertErr as { code?: string }).code;
  if (code === "23505") {
    // Scoped to the SAME room, game and window — can never pick up a winner
    // from another game.
    const { data: existing, error: selErr } = await supabase
      .from("claim_locks")
      .select("player_seat, created_at")
      .eq("room_id", room_id)
      .eq("game_id", game_id)
      .eq("claim_window", claim_window)
      .maybeSingle();
    if (selErr || !existing) {
      return bad(500, "select_after_conflict_failed");
    }
    // Rebroadcast the existing winner's grant so a grant lost in transit is
    // healed by any retry or later caller. The host dedupes repeats and
    // ignores grants for windows that are no longer open.
    await broadcastGrant(supabase, room_id, game_id, claim_window, existing.player_seat, Date.parse(existing.created_at));
    return json({ won: false, winner_seat: existing.player_seat, claim_window });
  }

  console.error("[claim-lock] insert failed", insertErr);
  return bad(500, "insert_failed");
});

// Announce a grant on the room channel via the REST broadcast endpoint.
// `supabase.channel(...).send(...)` without `.subscribe()` does NOT publish in
// supabase-js v2. Never broadcasts a browser id: the seat's session key only
// (games registered by the older build have no key and send the seat alone).
async function broadcastGrant(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  room_id: string,
  game_id: string,
  claim_window: number,
  seat: number,
  // Server time the window was won — the original win for a rebroadcast.
  grantedAt: number = Date.now(),
): Promise<boolean> {
  const { data: seatRow } = await supabase
    .from("room_seats")
    .select("pub_id")
    .eq("room_id", room_id)
    .eq("game_id", game_id)
    .eq("seat", seat)
    .maybeSingle();
  const grantPayload: Record<string, unknown> = { claim_window, seat, game_id, granted_at: Number.isFinite(grantedAt) ? grantedAt : Date.now() };
  // Public id only; the seat's secret session key never goes on the channel.
  if (seatRow?.pub_id) grantPayload.pid = seatRow.pub_id;
  // v2 (signed) for current clients; v1 (unsigned, no ids) keeps already-open
  // tabs of the previous build working until they reload. Remove v1 in pass 3.
  const signed = signServerEnvelope(room_id, { v: 2, type: "claim_grant", seq: 0, payload: grantPayload });
  const legacy = { v: 1, type: "claim_grant", seq: 0, payload: { claim_window, seat, game_id, granted_at: grantPayload.granted_at } };
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
          { topic: `room:${room_id}`, event: "msg", payload: legacy },
          ...(signed ? [{ topic: `room:${room_id}`, event: "msg", payload: signed }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[claim-lock] broadcast POST failed", res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[claim-lock] broadcast POST threw", e);
    return false;
  }
}
