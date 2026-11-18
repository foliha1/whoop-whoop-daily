export const UPDATES_SUBSCRIBED_KEY = "ww_updates_subscribed";

/** Device-local recognition for general updates subscribers without an account. */
export function hasUpdatesSubscription(): boolean {
  try { return localStorage.getItem(UPDATES_SUBSCRIBED_KEY) === "1"; } catch { return false; }
}

export function markUpdatesSubscription(): void {
  try { localStorage.setItem(UPDATES_SUBSCRIBED_KEY, "1"); } catch { /* storage unavailable */ }
}
