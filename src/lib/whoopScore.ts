// ============================================================================
// Whoop Score — a single 0–100 summary of recent Daily performance.
//
// The authoritative computation lives in SQL (`get_whoop_score`,
// `get_whoop_tier_distribution`, built on `whoop_score_table`). This module is
// the one place the thresholds, tier boundaries and the formula itself are
// mirrored for the client: the tuning constants below must stay in step with
// `public.whoop_score_config()`.
//
// Classic results never feed this. Only Daily results do — everyone plays the
// same puzzle each day, and that fairness is what makes the percentile mean
// anything.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { getSubscribedEmail } from "@/lib/dailySubscribe";

// ----------------------------------------------------------------- constants --

/** Most recent N Daily results that make up the scoring window. */
export const SCORE_WINDOW_GAMES = 30;
/** Calendar days the consistency component looks back over. */
export const CONSISTENCY_DAYS = 30;
/** A player counts as active — and so rankable — with a result this recent. */
export const ACTIVE_DAYS = 30;
/** Below this many games in the window there is no score at all. */
export const SCORE_MIN_GAMES = 5;
/** Below this many games the player has a score but is not ranked. */
export const RANK_MIN_GAMES = 10;
/** Fewer eligible players than this and the percentile is withheld. */
export const PERCENTILE_MIN_PLAYERS = 20;

export const WEIGHT_NO_PEEK = 0.4;
export const WEIGHT_ZERO_MISTAKE = 0.4;
export const WEIGHT_CONSISTENCY = 0.2;

/** Stable tier keys — display names are decided in the UI, not here. */
export type WhoopTier = "rookie" | "tier_2" | "tier_3" | "tier_4" | "legend";

/** Inclusive lower bound of each tier, highest first. */
export const TIER_FLOORS: ReadonlyArray<{ tier: WhoopTier; floor: number }> = [
  { tier: "legend", floor: 85 },
  { tier: "tier_4", floor: 70 },
  { tier: "tier_3", floor: 55 },
  { tier: "tier_2", floor: 40 },
  { tier: "rookie", floor: 0 },
];

export function tierForScore(score: number): WhoopTier {
  for (const t of TIER_FLOORS) if (score >= t.floor) return t.tier;
  return "rookie";
}

/** Floor of the next tier up, or null at `legend`. */
export function nextTierThreshold(score: number): number | null {
  const higher = [...TIER_FLOORS].reverse().find((t) => t.floor > score);
  return higher ? higher.floor : null;
}

// ------------------------------------------------------------------- formula --

export interface ScoredGame {
  puzzleNumber: number;
  puzzleDate: string; // YYYY-MM-DD
  peekUsed: boolean;
  totalMisses: number;
}

export interface WhoopScoreBreakdown {
  score: number | null;
  tier: WhoopTier | null;
  gamesCounted: number;
  noPeekRate: number;
  zeroMistakeRate: number;
  consistencyRate: number;
  gamesNeeded: number | null;
}

function dayDiff(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Today in UTC as YYYY-MM-DD — the default consistency anchor. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure mirror of the SQL scoring formula, used for tests and for any client
 * that already holds a player's rows.
 *
 * Window = the most recent `SCORE_WINDOW_GAMES` results by puzzle number.
 * Consistency counts distinct days played in the `CONSISTENCY_DAYS` ending on
 * `asOf` (today by default) — days showed up, not games played. Anchoring on
 * today, not on the player's last result, is what makes consistency decay when
 * someone stops playing.
 */
export function computeWhoopScore(
  games: ScoredGame[],
  asOf: string = todayUtc()
): WhoopScoreBreakdown {
  const byPuzzle = new Map<number, ScoredGame>();
  for (const g of games) {
    const seen = byPuzzle.get(g.puzzleNumber);
    if (
      !seen ||
      (seen.peekUsed && !g.peekUsed) ||
      (seen.peekUsed === g.peekUsed && g.totalMisses < seen.totalMisses)
    ) {
      byPuzzle.set(g.puzzleNumber, g);
    }
  }
  const all = [...byPuzzle.values()].sort((a, b) => b.puzzleNumber - a.puzzleNumber);
  const windowed = all.slice(0, SCORE_WINDOW_GAMES);
  const gamesCounted = windowed.length;

  if (gamesCounted < SCORE_MIN_GAMES) {
    return {
      score: null,
      tier: null,
      gamesCounted,
      noPeekRate: 0,
      zeroMistakeRate: 0,
      consistencyRate: 0,
      gamesNeeded: SCORE_MIN_GAMES - gamesCounted,
    };
  }

  const noPeekRate = windowed.filter((g) => !g.peekUsed).length / gamesCounted;
  const zeroMistakeRate = windowed.filter((g) => g.totalMisses === 0).length / gamesCounted;

  const ref = asOf;
  const days = new Set(
    all
      .filter((g) => {
        const d = dayDiff(ref, g.puzzleDate);
        return d >= 0 && d < CONSISTENCY_DAYS;
      })
      .map((g) => g.puzzleDate)
  );
  const consistencyRate = Math.min(1, days.size / CONSISTENCY_DAYS);

  const score = Math.round(
    100 *
      (WEIGHT_NO_PEEK * noPeekRate +
        WEIGHT_ZERO_MISTAKE * zeroMistakeRate +
        WEIGHT_CONSISTENCY * consistencyRate)
  );

  return {
    score,
    tier: tierForScore(score),
    gamesCounted,
    noPeekRate,
    zeroMistakeRate,
    consistencyRate,
    gamesNeeded: null,
  };
}

// --------------------------------------------------------------------- reads --

export interface WhoopScore {
  score: number | null;
  tier: WhoopTier | null;
  gamesCounted: number;
  noPeekRate: number | null;
  zeroMistakeRate: number | null;
  consistencyRate: number | null;
  previousScore: number | null;
  nextTierThreshold: number | null;
  pointsToNext: number | null;
  percentileBand: number | null;
  gamesNeeded: number | null;
}

/** The caller's own score. Null on any failure so callers can hide the block. */
export async function fetchWhoopScore(
  visitorId: string = getVisitorId(),
  email: string | null = getSubscribedEmail()
): Promise<WhoopScore | null> {
  try {
    const { data, error } = await supabase.rpc("get_whoop_score", {
      p_visitor_id: visitorId,
      ...(email ? { p_email: email } : {}),
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      score: num(row.score),
      tier: (row.tier as WhoopTier | null) ?? null,
      gamesCounted: Number(row.games_counted ?? 0),
      noPeekRate: num(row.no_peek_rate),
      zeroMistakeRate: num(row.zero_mistake_rate),
      consistencyRate: num(row.consistency_rate),
      previousScore: num(row.previous_score),
      nextTierThreshold: num(row.next_tier_threshold),
      pointsToNext: num(row.points_to_next),
      percentileBand: num(row.percentile_band),
      gamesNeeded: num(row.games_needed),
    };
  } catch {
    return null;
  }
}

export interface TierDistribution {
  eligibleTotal: number;
  tiers: Array<{ tier: WhoopTier; players: number; share: number }>;
}

/** Aggregate tier populations, or null when the pool is too small. */
export async function fetchTierDistribution(): Promise<TierDistribution | null> {
  try {
    const { data, error } = await supabase.rpc("get_whoop_tier_distribution");
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const total = Number(data[0].eligible_total ?? 0);
    if (!total) return null;
    return {
      eligibleTotal: total,
      tiers: data.map((r) => ({
        tier: r.tier as WhoopTier,
        players: Number(r.players ?? 0),
        share: Number(r.players ?? 0) / total,
      })),
    };
  } catch {
    return null;
  }
}
