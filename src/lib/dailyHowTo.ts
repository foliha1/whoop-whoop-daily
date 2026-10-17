/** Shared first-run flag; both tutorial presentations preserve the same key. */
const SEEN_KEY = "ww_daily_howto_seen";

export function hasSeenHowTo(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHowToSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Blocked storage must never trap a player in onboarding.
  }
}