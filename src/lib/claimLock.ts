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

/** One attempt never waits longer than this before counting as "unknown". */
export const CLAIM_LOCK_ATTEMPT_TIMEOUT_MS = 4000;

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
  /** This tab's secret session key; the arbiter matches it to the seat. */
  player_key?: string;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), CLAIM_LOCK_ATTEMPT_TIMEOUT_MS); });
    const res = await Promise.race([
      supabase.functions.invoke("claim-lock", { body: input }),
      timeout,
    ]);
    clearTimeout(timer);
    if (res === "timeout") {
      console.warn("[claim-lock] attempt timed out — outcome unknown");
      return unknown(new Error("timeout"));
    }
    const { data, error } = res;
    if (error) {
      console.warn("[claim-lock] invoke failed — outcome unknown", error);
      return unknown(error);
    }
    if (!data || typeof data !== "object") {
      console.warn("[claim-lock] malformed response — outcome unknown", data);
      return unknown(new Error("malformed_response"));
    }
    const d = data as { won?: unknown; outcome?: unknown; winner_seat?: unknown; claim_window?: unknown; error?: unknown };
    if (d.error) {
      console.warn("[claim-lock] server error — outcome unknown", d.error);
      return unknown(d.error);
    }
    // The row landed but its announcement did not. Retrying the identical
    // window hits the conflict path, which rebroadcasts and returns "won".
    if (d.outcome === "unknown") {
      console.warn("[claim-lock] grant broadcast failed — outcome unknown, retrying");
      return unknown(new Error("grant_broadcast_failed"));
    }
    // Strict verdicts only: a reply for another window, or one without a
    // valid integer winner seat, is not a verdict.
    if (d.claim_window !== input.claim_window) return unknown(new Error("window_mismatch"));
    const winner_seat = Number.isSafeInteger(d.winner_seat) && (d.winner_seat as number) >= 0 ? (d.winner_seat as number) : null;
    if (winner_seat === null) return unknown(new Error("malformed_response"));
    if (d.won === true && winner_seat !== input.player_seat) return unknown(new Error("inconsistent_response"));
    if (d.won !== true && d.won !== false) return unknown(new Error("malformed_response"));
    // A fresh insert wins. So does finding the existing row already owned by
    // this seat — that is a retry of a call that actually succeeded.
    const won = winner_seat === input.player_seat;
    return {
      outcome: won ? "won" : "lost",
      won,
      winner_seat,
      claim_window: input.claim_window,
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
