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

export interface ClassicResultPayload {
  gameId: string;
  roomCode: string | null;
  isSolo: boolean;
  startedAt: string;
  endedAt: string;
  playerCount: number;
  seats: ClassicSeatResult[];
  roundsPlayed: number;
  correctClaims: number;
  wrongClaims: number;
  hostVisitorId: string | null;
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

/** Fire-and-forget. Resolves false when nothing was stored. */
export async function saveClassicResultRemote(
  p: ClassicResultPayload,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("save_classic_result", {
      p_game_id: p.gameId,
      p_room_code: p.roomCode,
      p_is_solo: p.isSolo,
      p_started_at: p.startedAt,
      p_ended_at: p.endedAt,
      p_player_count: p.playerCount,
      p_seats: p.seats as unknown as never,
      p_rounds_played: p.roundsPlayed,
      p_correct_claims: p.correctClaims,
      p_wrong_claims: p.wrongClaims,
      p_app_version: APP_VERSION,
      p_host_visitor_id: p.hostVisitorId,
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
