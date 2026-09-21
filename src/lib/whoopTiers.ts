// ============================================================================
// Whoop Score presentation — the only place a tier's display name lives, and
// the only place the results-screen change line is formatted.
//
// The engine (`src/lib/whoopScore.ts`, `get_whoop_score`) owns the numbers,
// the weights and the tier boundaries. Nothing here touches them: this module
// turns those numbers into the words a player reads, so a name can be changed
// with one edit.
// ============================================================================

import { TIER_FLOORS, tierForScore, type WhoopTier } from "@/lib/whoopScore";

/** Tier key → the name shown to players. One map, one edit. */
export const TIER_NAMES: Record<WhoopTier, string> = {
  rookie: "Rookie",
  tier_2: "Sharp Eye",
  tier_3: "Card Shark",
  tier_4: "Master Matcher",
  legend: "Whoop Legend",
};

export function tierName(tier: WhoopTier | null | undefined): string {
  return tier ? TIER_NAMES[tier] : "";
}

/** The ladder, lowest first — the order it is drawn in on the YOU page. */
export const TIER_LADDER: ReadonlyArray<{ tier: WhoopTier; floor: number; name: string }> =
  [...TIER_FLOORS]
    .slice()
    .reverse()
    .map((t) => ({ tier: t.tier, floor: t.floor, name: TIER_NAMES[t.tier] }));

/** "0–39" / "85–100" — the band a tier covers, for the ladder rows. */
export function tierRange(tier: WhoopTier): string {
  const idx = TIER_LADDER.findIndex((t) => t.tier === tier);
  const floor = TIER_LADDER[idx].floor;
  const next = TIER_LADDER[idx + 1];
  return `${floor}–${next ? next.floor - 1 : 100}`;
}

// ----------------------------------------------------------- change line ---

export type ScoreChange = {
  /** Null when there is nothing to compare against. */
  delta: number | null;
  /** "+3 → 58", "−2 → 56", or just "58" when nothing moved. */
  text: string;
  /** True when today's game crossed into a higher tier, or unlocked the first score. */
  tierUp: boolean;
};

/**
 * The results-screen hero line. A drop is shown honestly with a true minus
 * sign; an unchanged score is shown with no marker at all rather than "+0".
 */
export function formatScoreChange(
  previous: number | null | undefined,
  current: number | null | undefined
): ScoreChange | null {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) {
    return { delta: null, text: `${current}`, tierUp: true };
  }
  const delta = current - previous;
  if (delta === 0) return { delta: 0, text: `${current}`, tierUp: false };
  const sign = delta > 0 ? "+" : "\u2212";
  return {
    delta,
    text: `${sign}${Math.abs(delta)} \u2192 ${current}`,
    tierUp: delta > 0 && tierForScore(current) !== tierForScore(previous),
  };
}

/** "Top 12% of active players" — only ever called with a real band. */
export function formatPercentileBand(band: number): string {
  return `Top ${band}% of active players`;
}

/** "18% of players are Card Shark". */
export function formatTierShare(share: number, tier: WhoopTier): string {
  return `${Math.round(share * 100)}% of players are ${TIER_NAMES[tier]}`;
}

/** "2 more games unlock your Whoop Score" — the below-minimum line. */
export function formatGamesNeeded(games: number): string {
  return `${games} more ${games === 1 ? "game" : "games"} unlock${
    games === 1 ? "s" : ""
  } your Whoop Score`;
}

/** "83%" from a 0–1 rate. */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${Math.round(rate * 100)}%`;
}
