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

export function useWhoopScore(ready = true, refreshKey = 0): WhoopScore | null {
  const [score, setScore] = useState<WhoopScore | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void fetchWhoopScore().then((s) => {
      if (live) setScore(s);
    });
    return () => {
      live = false;
    };
  }, [ready, refreshKey]);

  return score;
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
