/** Shared with ClassicDemo's SEEN_KEY ("ww_classic_demo_seen"). */
const SEEN_KEY = "ww_classic_demo_seen";

export function hasSeenClassicDemo(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never trap the player behind the gate
  }
}
