// ============================================================================
// Classic results persistence — one row per completed game, written once by the
// host through a security-definer RPC. The table has RLS on and no
// client-writable policy, so this RPC is the only write path.
//
// Never blocks or surfaces anything: the RPC is success-shaped even when the
// server rejects the row as implausible, and every failure here is swallowed.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/appVersion";

export interface ClassicSeatResult {
  seat: number;
  name: string;
  score: number;
  /** Standard competition ranking: ties share a position (1, 1, 3). */
  position: number;
}

/** Standard competition ranking over final scores. */
export function seatResults(
  scores: number[],
  names: string[],
): ClassicSeatResult[] {
  return scores.map((score, seat) => ({
    seat,
    name: (names[seat] ?? `P${seat + 1}`).slice(0, 24),
    score,
    position: 1 + scores.filter((v) => v > score).length,
  }));
}

// ---------------------------------------------------------------------------
// Verified save paths (security pass 2). The server decides identity, times
// and whether the game was real; the client only reports the final board.
// ---------------------------------------------------------------------------

export type ClassicEndReason = "target" | "table_empty" | "stalled";

export const CLASSIC_TARGET_SCORE = 12;

/** How a finished game ended: someone reached 12, the table emptied, or it stalled. */
export function endReasonFor(
  scores: number[],
  messageType: string | undefined,
): ClassicEndReason {
  if (scores.some((v) => v >= CLASSIC_TARGET_SCORE)) return "target";
  return messageType === "warning" ? "table_empty" : "stalled";
}

const seatsForSave = (scores: number[], names: string[]) =>
  scores.map((score, seat) => ({
    seat,
    name: (names[seat] ?? `P${seat + 1}`).slice(0, 24),
    score,
  }));

export interface VerifiedGameReport {
  endReason: ClassicEndReason;
  scores: number[];
  names: string[];
  roundsPlayed: number;
  correctClaims: number;
  wrongClaims: number;
}

export async function saveClassicGame(
  p: VerifiedGameReport & {
    roomId: string;
    gameId: string;
    visitorId: string;
    playerKey: string;
  },
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("save_classic_game", {
      p_room_id: p.roomId,
      p_game_id: p.gameId,
      p_visitor_id: p.visitorId,
      p_player_key: p.playerKey,
      p_end_reason: p.endReason,
      p_seats: seatsForSave(p.scores, p.names) as unknown as never,
      p_rounds_played: p.roundsPlayed,
      p_correct_claims: p.correctClaims,
      p_wrong_claims: p.wrongClaims,
      p_app_version: APP_VERSION,
    });
    if (error) {
      console.warn("[classic-results] save failed", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("[classic-results] threw", e);
    return false;
  }
}

/** Server-issued solo game id. Null when the server refused (rate cap) or failed. */
export async function startSoloGame(visitorId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("start_solo_game", { p_visitor_id: visitorId });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row && typeof row.id === "string" ? row.id : null;
  } catch {
    return null;
  }
}

export async function saveSoloGame(
  p: VerifiedGameReport & { gameId: string },
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("save_solo_game", {
      p_game_id: p.gameId,
      p_end_reason: p.endReason,
      p_seats: seatsForSave(p.scores, p.names) as unknown as never,
      p_rounds_played: p.roundsPlayed,
      p_correct_claims: p.correctClaims,
      p_wrong_claims: p.wrongClaims,
      p_app_version: APP_VERSION,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
