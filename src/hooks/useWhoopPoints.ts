// ============================================================================
// useWhoopPoints — the player's own running points total, and the aggregate
// tier population.
//
// The `ready` gate exists for one reason: on the results screen the total must
// be read only AFTER today's run has been written. Reading it earlier misses
// today's points and the "+4 today" line would be wrong.
//
// Both reads resolve to null on any failure, so every caller hides its block
// rather than showing a zero.
// ============================================================================

import { useEffect, useState } from "react";
import {
  fetchPointsPopulation,
  fetchWhoopPoints,
  type PointsPopulation,
  type WhoopPoints,
} from "@/lib/whoopPoints";

/**
 * The total plus an explicit `loading` flag. A resolved `null` means the read
 * failed — callers must not render a zero in its place.
 */
export function useWhoopPointsState(
  ready = true,
  refreshKey = 0
): { points: WhoopPoints | null; loading: boolean } {
  const [points, setPoints] = useState<WhoopPoints | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    setLoading(true);
    void fetchWhoopPoints().then((p) => {
      if (!live) return;
      setPoints(p);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [ready, refreshKey]);

  return { points, loading };
}

export function useWhoopPoints(ready = true, refreshKey = 0): WhoopPoints | null {
  return useWhoopPointsState(ready, refreshKey).points;
}

export function usePointsPopulation(ready = true): PointsPopulation | null {
  return usePointsPopulationState(ready).population;
}

export function usePointsPopulationState(ready = true): { population: PointsPopulation | null; loading: boolean } {
  const [pop, setPop] = useState<PointsPopulation | null>(null);
  const [loading, setLoading] = useState(ready);

  useEffect(() => {
    if (!ready) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    void fetchPointsPopulation().then((p) => {
      if (live) { setPop(p); setLoading(false); }
    });
    return () => {
      live = false;
    };
  }, [ready]);

  return { population: pop, loading };
}

export default useWhoopPoints;
