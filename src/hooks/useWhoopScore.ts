// ============================================================================
// useWhoopScore — the player's own score, and the aggregate tier distribution.
//
// The `ready` gate exists for one reason: on the results screen the score must
// be read only AFTER today's run has been written. Reading it earlier returns
// yesterday's score and the change line would be wrong.
//
// Both reads resolve to null on any failure, so every caller hides its block
// rather than showing a zero.
// ============================================================================

import { useEffect, useState } from "react";
import {
  fetchTierDistribution,
  fetchWhoopScore,
  type TierDistribution,
  type WhoopScore,
} from "@/lib/whoopScore";

/**
 * The score plus an explicit `loading` flag. A resolved `null` score means the
 * read failed — callers must not confuse that with "not enough games yet",
 * which is a loaded score whose `score` field is null.
 */
export function useWhoopScoreState(
  ready = true,
  refreshKey = 0
): { score: WhoopScore | null; loading: boolean } {
  const [score, setScore] = useState<WhoopScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    setLoading(true);
    void fetchWhoopScore().then((s) => {
      if (!live) return;
      setScore(s);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [ready, refreshKey]);

  return { score, loading };
}

export function useWhoopScore(ready = true, refreshKey = 0): WhoopScore | null {
  return useWhoopScoreState(ready, refreshKey).score;
}

export function useTierDistribution(ready = true): TierDistribution | null {
  const [dist, setDist] = useState<TierDistribution | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void fetchTierDistribution().then((d) => {
      if (live) setDist(d);
    });
    return () => {
      live = false;
    };
  }, [ready]);

  return dist;
}

export default useWhoopScore;
