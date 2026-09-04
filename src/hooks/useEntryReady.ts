import { useEffect, useState } from "react";
import { ENTRY_ASSET_TIMEOUT_MS } from "@/lib/animationTiming";

/**
 * Shared entry gate for the ready/entry screens (Daily and Classic).
 *
 * Resolves true when three things are true:
 *  - `document.fonts.ready` has settled, so Friend is in place and text never
 *    paints in the Georgia fallback and then reflows,
 *  - every passed image src has decoded (lockup art, pattern strip),
 *  - the tab is visible, so the entry animation is never spent off-screen.
 *
 * The asset wait is capped at `ENTRY_ASSET_TIMEOUT_MS`: a slow connection must
 * cost a beat of empty cream ground, never a blank page. The visibility
 * condition is deliberately NOT capped — a hidden tab simply waits.
 */
export function useEntryReady(srcs: readonly string[]): boolean {
  const key = srcs.join("|");
  const [assetsReady, setAssetsReady] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  useEffect(() => {
    let live = true;
    const done = () => {
      if (live) setAssetsReady(true);
    };

    const fonts =
      typeof document !== "undefined" && document.fonts
        ? document.fonts.ready.then(() => undefined)
        : Promise.resolve();

    const images = key
      .split("|")
      .filter(Boolean)
      .map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const decode = img.decode?.();
              if (decode) decode.then(() => resolve()).catch(() => resolve());
              else resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          }),
      );

    Promise.all([fonts, ...images]).then(done).catch(done);
    const cap = window.setTimeout(done, ENTRY_ASSET_TIMEOUT_MS);

    return () => {
      live = false;
      window.clearTimeout(cap);
    };
  }, [key]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") setVisible(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return assetsReady && visible;
}
