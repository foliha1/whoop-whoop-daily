/**
 * Lovable editor previews and preview builds are test traffic, not players.
 * Usage tracking skips them so admin reports only count the public game.
 * The published lovable.app address (whoop-whoop.lovable.app) is public and
 * still counts; local development and tests are unaffected.
 */
export function isPreviewHost(hostname: string = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  const h = hostname.toLowerCase();
  if (h === "whoop-whoop.lovable.app") return false;
  return h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h === "lovable.dev" || h.endsWith(".lovable.dev");
}
