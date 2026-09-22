import type { PointsTier } from "@/lib/whoopPoints";
import { badgeArt } from "@/lib/whoopTiers";

const loadedBadges = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * Load and decode fixed badge artwork for DOM or Canvas 2D use. Unmapped tiers
 * and failed assets resolve to null, so callers never draw a broken image.
 */
export function loadBadgeImage(tier: PointsTier): Promise<HTMLImageElement | null> {
  const src = badgeArt(tier);
  if (src === null || typeof Image === "undefined") return Promise.resolve(null);

  const cached = loadedBadges.get(src);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    image.onload = () => {
      if (typeof image.decode !== "function") {
        finish(image);
        return;
      }
      image.decode().then(() => finish(image)).catch(() => finish(image));
    };
    image.onerror = () => {
      loadedBadges.delete(src);
      finish(null);
    };
    image.src = src;

    if (image.complete && image.naturalWidth > 0) {
      if (typeof image.decode !== "function") finish(image);
      else image.decode().then(() => finish(image)).catch(() => finish(image));
    }
  });

  loadedBadges.set(src, pending);
  return pending;
}

/** Test isolation for the in-memory preload cache. */
export function clearBadgeImageCache(): void {
  loadedBadges.clear();
}