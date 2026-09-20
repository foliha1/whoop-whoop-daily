// ============================================================================
// useDailyShareImage — render the share PNG once per theme, on the results
// screen, so it can be shown as a preview AND handed straight to the share
// sheet.
//
// Rendering is fire-and-forget: the screen never waits on it, and any failure
// resolves to `null` so the caller hides the preview and falls back to the
// on-demand render inside the share handler.
//
// URL lifetime rules (the reason the preview used to go blank):
//   * A cached object URL is revoked in exactly two situations — the component
//     unmounts, or a newer render replaces the same cache entry.
//   * Late-arriving data (the streak) never revokes what is on screen. The
//     previous image stays visible until the replacement render resolves, then
//     the swap happens in one commit.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyResult } from "@/lib/daily";
import { renderDailyShareImage, type ShareImageTheme } from "@/lib/dailyShareImage";

export type DailyShareImage = {
  /** The exact artifact that gets shared, once it exists. */
  blob: Blob | null;
  /** Object URL for the blob, for the preview <img>. */
  url: string | null;
  status: "pending" | "ready" | "failed";
  /** Which theme the blob above was drawn in. */
  theme: ShareImageTheme;
  /** Render (or serve from cache) the other theme. Safe to call repeatedly. */
  setTheme: (theme: ShareImageTheme) => void;
};

type Entry = { blob: Blob; url: string };

/**
 * Streaks only reach the card at 3+ days, so anything below that draws the
 * identical image. Bucketing keeps a 0 -> 1 -> 2 streak arrival from forcing a
 * pointless re-render.
 */
const streakBucket = (streak: number | null) =>
  typeof streak === "number" && streak >= 3 ? String(streak) : "0";

export function useDailyShareImage(
  result: DailyResult | null,
  streak: number | null,
  enabled = true,
  initialTheme: ShareImageTheme = "light"
): DailyShareImage {
  const [theme, setThemeState] = useState<ShareImageTheme>(initialTheme);
  const [state, setState] = useState<Omit<DailyShareImage, "theme" | "setTheme">>({
    blob: null,
    url: null,
    status: "pending",
  });

  const cache = useRef<Map<string, Entry>>(new Map());
  const liveRef = useRef(true);

  // Unmount only: nothing else is allowed to revoke a displayed URL. Under
  // StrictMode this runs between the double-invoked mounts, so the state is
  // reset too and the effect below redraws into fresh URLs.
  useEffect(() => {
    liveRef.current = true;
    const map = cache.current;
    return () => {
      liveRef.current = false;
      map.forEach((e) => URL.revokeObjectURL(e.url));
      map.clear();
      setState({ blob: null, url: null, status: "pending" });
    };
  }, []);

  const cacheKey = result
    ? `${result.puzzleNumber}:${streakBucket(streak)}:${theme}`
    : null;

  useEffect(() => {
    if (!enabled || !result || !cacheKey) return;
    const hit = cache.current.get(cacheKey);
    if (hit) {
      setState({ blob: hit.blob, url: hit.url, status: "ready" });
      return;
    }
    // Keep whatever is already on screen while the new render runs — only show
    // the placeholder when there is nothing to show yet.
    setState((prev) => (prev.url ? prev : { blob: null, url: null, status: "pending" }));

    renderDailyShareImage(result, streak, theme).then(
      (blob) => {
        if (!liveRef.current) return;
        const url = URL.createObjectURL(blob);
        // Replacing an entry for the same key is the only in-life revoke.
        const stale = cache.current.get(cacheKey);
        cache.current.set(cacheKey, { blob, url });
        setState({ blob, url, status: "ready" });
        if (stale) URL.revokeObjectURL(stale.url);
      },
      () => {
        if (!liveRef.current) return;
        setState((prev) =>
          prev.url ? prev : { blob: null, url: null, status: "failed" }
        );
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled]);

  const setTheme = useCallback((next: ShareImageTheme) => setThemeState(next), []);

  return { ...state, theme, setTheme };
}
