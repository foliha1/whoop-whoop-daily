// ============================================================================
// Whoop Whoop Score presentation — the only place a tier's display name lives,
// the only place badge art is mapped, and the only place the results-screen
// change line is formatted.
//
// The engine (`src/lib/whoopPoints.ts`, `get_whoop_points`) owns the numbers,
// the points values and the tier thresholds. Nothing here touches them: this
// module turns those numbers into the words a player reads.
// ============================================================================

import {
  POINTS_TIER_FLOORS,
  pointsTierForTotal,
  type PointsTier,
} from "@/lib/whoopPoints";

/** What the score is called, everywhere it is labelled. */
export const SCORE_LABEL = "Your Whoop Whoop Score";

/** Tier key → the name shown to players. One map, one edit. */
export const TIER_NAMES: Record<PointsTier, string> = {
  rookie: "Rookie",
  great_eye: "Great Eye",
  match_maker: "Match Maker",
  xray_vision: "X-ray Vision",
  legend: "Whoop Whoop Legend",
};

export function tierName(tier: PointsTier | null | undefined): string {
  return tier ? TIER_NAMES[tier] : "";
}

/**
 * Badge key → its art. A badge renders only if it has an entry here: adding a
 * future badge is one file in `public/badges` and one line below. Badge art is
 * fixed brand artwork and does not follow the theme.
 */
export const BADGE_ART: Readonly<Record<string, string>> = {
  great_eye: "/badges/great_eye.svg",
};

export function badgeArt(key: string): string | null {
  return BADGE_ART[key] ?? null;
}

/** The ladder, lowest first — the order it is drawn in on the YOU page. */
export const TIER_LADDER: ReadonlyArray<{ tier: PointsTier; floor: number; name: string }> =
  [...POINTS_TIER_FLOORS]
    .slice()
    .reverse()
    .map((t) => ({ tier: t.tier, floor: t.floor, name: TIER_NAMES[t.tier] }));

/** "25–74" / "300+" — the band a tier covers, for the ladder rows. */
export function tierRange(tier: PointsTier): string {
  const idx = TIER_LADDER.findIndex((t) => t.tier === tier);
  const floor = TIER_LADDER[idx].floor;
  const next = TIER_LADDER[idx + 1];
  return next ? `${floor}\u2013${next.floor - 1}` : `${floor}+`;
}

// ----------------------------------------------------------- change line ---

export type PointsChange = {
  /** Null when today has not been played. */
  delta: number | null;
  /** "+4 today", or null when there is nothing earned today to show. */
  text: string | null;
  /** True when today's points moved the player into a higher tier. */
  tierUp: boolean;
};

/**
 * Today's earning, from the engine's `today_points` and `total_before_today`.
 * A tier-up is a real crossing: the tier the total sits in now is higher than
 * the tier it sat in before today's game.
 */
export function formatPointsChange(
  todayPoints: number | null | undefined,
  totalBeforeToday: number | null | undefined,
  total: number
): PointsChange {
  if (todayPoints === null || todayPoints === undefined) {
    return { delta: null, text: null, tierUp: false };
  }
  const before = totalBeforeToday ?? total - todayPoints;
  const tierUp =
    todayPoints > 0 &&
    TIER_LADDER.findIndex((t) => t.tier === pointsTierForTotal(total)) >
      TIER_LADDER.findIndex((t) => t.tier === pointsTierForTotal(before));
  return {
    delta: todayPoints,
    text: `+${todayPoints} today`,
    tierUp,
  };
}

/** "18% of players are Match Maker". */
export function formatTierShare(share: number, tier: PointsTier): string {
  return `${Math.round(share * 100)}% of players are ${TIER_NAMES[tier]}`;
}

/** "12 points to Match Maker". */
export function formatPointsToNext(points: number, threshold: number): string {
  return `${points} ${points === 1 ? "point" : "points"} to ${tierName(
    pointsTierForTotal(threshold)
  )}`;
}

/** "14 Sep 2026" — the date a badge was earned. */
export function formatBadgeDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
