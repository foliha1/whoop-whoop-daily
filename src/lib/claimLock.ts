// ============================================================================
// claimLock — client wrapper for the claim-lock edge function (the arbiter).
//
// Every player (host included) MUST go through this on WHOOP. First insert
// at the server wins; losers see { outcome: "lost" }. There is no client-side
// tie-breaker — arrival order at Postgres is the ordering.
//
// Outcomes are tri-state, and the important distinction is that a transport
// failure is NEVER a loss:
//   won     — the arbiter says this seat owns the window (fresh insert, or an
//             existing row that belongs to this very seat).
//   lost    — the arbiter explicitly named ANOTHER seat as the winner. Only
//             this may ever be shown to a player as being beaten to it.
//   unknown — the call failed, timed out, or came back malformed. We cannot
//             know whether the insert landed, so the client concludes nothing:
//             it keeps its claim open and follows the host's state.
//
// Because the UNIQUE (room_id, game_id, claim_window) index makes the insert
// idempotent per window, retrying the identical window and seat is safe and is
// how "unknown" is resolved into "won" or "lost" whenever the network recovers.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import {
  CLAIM_LOCK_RETRIES,
  CLAIM_LOCK_RETRY_DELAY_MS,
} from "@/lib/animationTiming";

export type ClaimOutcome = "won" | "lost" | "unknown";

export interface ClaimLockResult {
  outcome: ClaimOutcome;
  won: boolean; // convenience; true iff outcome === "won"
  winner_seat: number | null;
  claim_window: number;
  error?: unknown;
}

type Input = {
  room_id: string;
  game_id: string;
  claim_window: number;
  player_seat: number;
  visitor_id: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One attempt. Returns "unknown" for anything that isn't a clear verdict. */
async function attempt(input: Input): Promise<ClaimLockResult> {
  const unknown = (error: unknown): ClaimLockResult => ({
    outcome: "unknown",
    won: false,
    winner_seat: null,
    claim_window: input.claim_window,
    error,
  });
  try {
    const { data, error } = await supabase.functions.invoke("claim-lock", {
      body: input,
    });
    if (error) {
      console.warn("[claim-lock] invoke failed — outcome unknown", error);
      return unknown(error);
    }
    if (!data || typeof data !== "object") {
      console.warn("[claim-lock] malformed response — outcome unknown", data);
      return unknown(new Error("malformed_response"));
    }
    const d = data as { won?: boolean; winner_seat?: number; claim_window?: number; error?: string };
    if (d.error) {
      console.warn("[claim-lock] server error — outcome unknown", d.error);
      return unknown(d.error);
    }
    const winner_seat = typeof d.winner_seat === "number" ? d.winner_seat : null;
    // A fresh insert wins. So does finding the existing row already owned by
    // this seat — that is a retry of a call that actually succeeded.
    const won = !!d.won || winner_seat === input.player_seat;
    return {
      outcome: won ? "won" : "lost",
      won,
      winner_seat,
      claim_window: typeof d.claim_window === "number" ? d.claim_window : input.claim_window,
    };
  } catch (e) {
    console.warn("[claim-lock] threw — outcome unknown", e);
    return unknown(e);
  }
}

export async function callClaimLock(input: Input): Promise<ClaimLockResult> {
  let last = await attempt(input);
  for (let i = 0; i < CLAIM_LOCK_RETRIES && last.outcome === "unknown"; i++) {
    await sleep(CLAIM_LOCK_RETRY_DELAY_MS);
    last = await attempt(input);
  }
  return last;
}


// ---------------------------------------------------------------------------
// Warm-up. Edge functions idle out, so the FIRST claim of a game pays a cold
// boot (~1.5s on top of a ~600ms warm round trip) — exactly the moment a new
// player presses WHOOP! WHOOP! for the first time. The host fires this once
// per game at start to boot the instance early.
//
// It is a distinct request shape: `{ warmup: true }` with NO claim fields.
// The server matches that flag before the seat check and returns immediately,
// so it can never insert a claim_locks row, broadcast, or win a window.
//
// Fire-and-forget: never awaited by game start, never surfaced to players,
// never retried.
// ---------------------------------------------------------------------------
export function warmClaimLock(): void {
  void supabase.functions
    .invoke("claim-lock", { body: { warmup: true } })
    .then(({ error }) => {
      if (error) console.warn("[claim-lock] warm-up failed (ignored)", error);
    })
    .catch((e) => console.warn("[claim-lock] warm-up threw (ignored)", e));
}
