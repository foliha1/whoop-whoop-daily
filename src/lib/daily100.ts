// ============================================================================
// Daily #100 ("100 Days of Daily"), 18 Nov 2026.
//
// - Copy: the Daily is titled "100 Days of Daily" for puzzle #100.
// - Keepsake: a one-day foil badge, earned by having a Daily #100 record on
//   this device (any finished or forfeited run of the 18 Nov puzzle). It is
//   derived client-side from the stored result, so it needs no server change
//   and stays forever once earned.
// - Splash: the DAY / 100 / !!! card flip, once per device on Holo Day.
// ============================================================================

import type { EarnedBadge } from "@/lib/whoopPoints";
import { loadDailyResult } from "@/lib/daily";

export const DAILY_100_NUMBER = 100;
export const DAILY_100_DATE = "2026-11-18";
export const DAILY_100_SEED = `whoop-${DAILY_100_DATE}`;
export const DAILY_100_TITLE = "100 Days of Daily";

export const KEEPSAKE_KEY = "daily-100";
export const KEEPSAKE_NAME = "100 Days of Daily";
export const KEEPSAKE_CRITERIA = "Played Daily #100 on 18 Nov 2026. Only that day.";

/** The Daily's display title: the milestone name on #100, the usual one otherwise. */
export function dailyTitle(puzzleNumber: number, prefix = "Whoop! Whoop!"): string {
  return puzzleNumber === DAILY_100_NUMBER ? DAILY_100_TITLE : `${prefix} Daily #${puzzleNumber}`;
}

/** True once this device holds a Daily #100 result. */
export function hasDaily100Keepsake(): boolean {
  try {
    return loadDailyResult(DAILY_100_SEED) !== null;
  } catch {
    return false;
  }
}

export function isKeepsakeBadge(key: string): boolean {
  return key === KEEPSAKE_KEY;
}

/** Adds the keepsake to a badge list when earned. Newest first, like the tiers. */
export function withKeepsake(badges: EarnedBadge[], earned: boolean = hasDaily100Keepsake()): EarnedBadge[] {
  if (!earned || badges.some((b) => b.key === KEEPSAKE_KEY)) return badges;
  return [{ key: KEEPSAKE_KEY, earnedOn: DAILY_100_DATE }, ...badges];
}

// --- splash -----------------------------------------------------------------

const SPLASH_KEY = "ww-daily-100-splash";

export function splashSeen(): boolean {
  try {
    return window.localStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen(): void {
  try {
    window.localStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* private mode: it may show again next open */
  }
}

/** `?splash=1` replays the splash for testing; it never marks it seen. */
export function isSplashPreview(search?: string): boolean {
  const raw = search ?? (typeof window === "undefined" ? "" : window.location.search);
  return new URLSearchParams(raw).get("splash") === "1";
}
