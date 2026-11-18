// ============================================================================
// Home "IRL" entry for subscribers: a fourth way to play that opens /preorder.
//
// Stage is chosen by the player's LOCAL date, frozen at page load:
// - "banner" through 28 Nov 2026 (pre-order launch window): a full-width
//   tile under Solo / Together with the card photo and a pre-order line.
// - "tile" from 29 Nov 2026: a plain third tile beside Solo and Together.
// Banner: only players this device knows are subscribed (Daily reminder or
// updates list). Tile: every player.
// ============================================================================

export type HomeIrlStage = "banner" | "tile";

/** First local day of the tile stage (the day after pre-order launch closes). */
export const IRL_TILE_FROM = { year: 2026, monthIndex: 10, day: 29 } as const;

export function homeIrlStage(now: Date = new Date()): HomeIrlStage {
  const switchAt = new Date(IRL_TILE_FROM.year, IRL_TILE_FROM.monthIndex, IRL_TILE_FROM.day, 0, 0, 0, 0);
  return now.getTime() < switchAt.getTime() ? "banner" : "tile";
}

export function showHomeIrl(stage: HomeIrlStage, subscribed: boolean): boolean {
  return stage === "tile" || subscribed;
}
