// ============================================================================
// useDailyProfile — results-only Daily reads. Lifetime stats belong to the
// dedicated Your Stats page and are deliberately not fetched here.
//
// The percentile is computed in SQL after the result has been persisted and
// resolves to null on failure so the caller hides the element.
// ============================================================================

import { useEffect, useState } from "react";
import { fetchDailyPercentile } from "@/lib/dailyResults";

/**
 * @param puzzleNumber today's puzzle number
 * @param ready        gate — only fetch once the run is saved
 * @param refreshKey   bump to re-read (e.g. after an email signup)
 */
export function useDailyProfile(
  puzzleNumber: number,
  ready = true,
  refreshKey = 0
): { percentile: number | null } {
  const [percentile, setPercentile] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void fetchDailyPercentile(puzzleNumber).then((p) => {
      if (live) setPercentile(p);
    });
    return () => {
      live = false;
    };
  }, [puzzleNumber, ready, refreshKey]);

  return { percentile };
}
