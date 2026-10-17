import { useEffect, useRef } from "react";
import { rememberMatch } from "@/lib/playerStats";
import type { PublicState } from "@/lib/publicState";

// Every participant records their own final signed snapshot, not just the host.
export function useTogetherStatsRecorder(s: PublicState, seat: number | null, enabled: boolean) {
  const written = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || seat === null || s.phase !== "GAME_OVER" || !s.gameId || written.current === s.gameId) return;
    const score = s.scores[seat];
    if (score === undefined) return;
    written.current = s.gameId;
    rememberMatch({ id: s.gameId, mode: "together", won: score === Math.max(...s.scores), correct: null, wrong: null, victoryMs: null });
  }, [enabled, seat, s.phase, s.gameId, s.scores]);
}