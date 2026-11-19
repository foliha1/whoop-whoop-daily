// ============================================================================
// Streak badges.
//
// - Milestones: 3, 7, 14, 30, 50, 100, 200, 365 days of the Daily in a row.
//   Playing counts; solving does not (same rule as the streak tile).
// - Earned from the player's LONGEST streak ever, so a broken streak never
//   takes a badge away, and players who already had long streaks at launch get
//   theirs straight away.
// - Source is the server history from get_daily_results, which is scoped to the
//   caller's identity (signed-in account, or this browser's own anonymous rows).
//   Badges are therefore worked out from saved data and follow signed-in
//   players across devices. Nothing is stored on the device.
// - earnedOn is the puzzle date of the day the run first reached the milestone.
// ============================================================================

import type { EarnedBadge } from "@/lib/whoopPoints";

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

const PREFIX = "streak-";

export function streakBadgeKey(days: StreakMilestone): string {
  return `${PREFIX}${days}`;
}

/** The milestone for a streak badge key, or null for any other badge. */
export function streakDays(key: string): StreakMilestone | null {
  if (!key.startsWith(PREFIX)) return null;
  const n = Number(key.slice(PREFIX.length));
  return (STREAK_MILESTONES as readonly number[]).includes(n) ? (n as StreakMilestone) : null;
}

export function isStreakBadge(key: string): boolean {
  return streakDays(key) !== null;
}

export function streakBadgeName(days: StreakMilestone): string {
  return `${days}-Day Streak`;
}

export function streakBadgeCriteria(days: StreakMilestone): string {
  return `Play the Daily ${days} days in a row.`;
}

export interface StreakHistoryRow {
  puzzle_number: number;
  puzzle_date: string; // YYYY-MM-DD
}

/**
 * Every streak badge the history has earned, lowest milestone first. Rows may
 * arrive unsorted or repeated; each puzzle number counts once.
 */
export function streakBadgesFrom(rows: ReadonlyArray<StreakHistoryRow>): EarnedBadge[] {
  const byNumber = new Map<number, string>();
  for (const row of rows) {
    const n = Number(row?.puzzle_number);
    const date = typeof row?.puzzle_date === "string" ? row.puzzle_date.slice(0, 10) : "";
    if (!Number.isInteger(n) || !date) continue;
    if (!byNumber.has(n)) byNumber.set(n, date);
  }
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);

  const earned = new Map<StreakMilestone, string>();
  let run = 0;
  let prev: number | null = null;
  for (const n of numbers) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    prev = n;
    for (const days of STREAK_MILESTONES) {
      if (run >= days && !earned.has(days)) earned.set(days, byNumber.get(n) as string);
    }
  }

  return STREAK_MILESTONES.filter((days) => earned.has(days)).map((days) => ({
    key: streakBadgeKey(days),
    earnedOn: earned.get(days) as string,
  }));
}

/** Adds streak badges after the others, skipping any already present. */
export function withStreakBadges(badges: EarnedBadge[], streak: EarnedBadge[]): EarnedBadge[] {
  const have = new Set(badges.map((b) => b.key));
  return [...badges, ...streak.filter((b) => !have.has(b.key))];
}
