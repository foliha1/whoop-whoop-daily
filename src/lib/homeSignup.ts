// Home email signup eligibility (umbrella ON only): a player who has finished
// at least one Daily on this device and is not subscribed. Brand-new visitors
// and subscribers never see it.

const RESULT_PREFIX = "ww_daily_whoop-";

/** True when any finished Daily result is stored on this device. */
export function hasCompletedAnyDaily(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(RESULT_PREFIX)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { elapsedMs?: unknown } | null;
      if (typeof parsed?.elapsedMs === "number") return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function homeSignupEligible(completedAnyDaily: boolean, subscribed: boolean): boolean {
  return completedAnyDaily && !subscribed;
}
