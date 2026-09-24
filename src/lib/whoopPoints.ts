// ============================================================================
// Whoop Points — a countable running total. Every Daily result earns up to 5
// points; staying away spends them back.
//
// The authoritative computation lives in SQL (`get_whoop_points`,
// `get_whoop_points_population`, built on `whoop_points_for`). This module
// mirrors the config for the client: the constants below must stay in step with
// `public.whoop_points_config()`.
//
// This is the only score engine: it replaced the old rolling-average Whoop
// Score, which has been removed. Display names live in `src/lib/whoopTiers.ts`.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { getSubscribedEmail } from "@/lib/dailySubscribe";

// ----------------------------------------------------------------- constants --

/** A finished result is worth this much on its own. */
export const POINT_PLAY = 1;
/** One point per first-try round, capped here. */
export const POINT_FIRST_TRY_MAX = 3;
/** Finishing without Peek. */
export const POINT_NO_PEEK = 1;
/** The most one game can ever be worth. */
export const MAX_POINTS_PER_GAME = POINT_PLAY + POINT_FIRST_TRY_MAX + POINT_NO_PEEK;
/** Days away that cost nothing. */
export const GRACE_DAYS = 7;
/** Points lost per day beyond the grace window. */
export const DECAY_PER_DAY = 3;
/** Decay can never take a total below this, and never touches a total at or under it. */
export const DECAY_PROTECTED_POINTS = 25;
/** A player counts as active — and so counted in the population — with a result this recent. */
export const ACTIVE_DAYS = 30;

/** Stable tier keys — display names live in the UI. */
export type PointsTier = "rookie" | "great_eye" | "match_maker" | "xray_vision" | "legend";

/** Inclusive lower bound of each tier, highest first. */
export const POINTS_TIER_FLOORS: ReadonlyArray<{ tier: PointsTier; floor: number }> = [
  { tier: "legend", floor: 300 },
  { tier: "xray_vision", floor: 150 },
  { tier: "match_maker", floor: 75 },
  { tier: "great_eye", floor: 25 },
  { tier: "rookie", floor: 0 },
];

export function pointsTierForTotal(total: number): PointsTier {
  for (const t of POINTS_TIER_FLOORS) if (total >= t.floor) return t.tier;
  return "rookie";
}

/** Floor of the next tier up, or null at `legend`. */
export function nextPointsThreshold(total: number): number | null {
  const higher = [...POINTS_TIER_FLOORS].reverse().find((t) => t.floor > total);
  return higher ? higher.floor : null;
}

// ------------------------------------------------------------------- formula --

export interface PointsGame {
  puzzleNumber: number;
  puzzleDate: string; // YYYY-MM-DD
  peekUsed: boolean;
  totalMisses: number;
  roundsSolved: number;
  /** Per-round event marks. Missing on older rows — then the fallback applies. */
  roundEvents?: string[][] | null;
  /** When the result was saved. The earliest per puzzle is the one counted. */
  createdAt?: string;
}

/**
 * True when `a` was saved before `b`. Without timestamps, input order wins —
 * the first result seen stays counted.
 */
export function isEarlierAttempt(a: PointsGame, b: PointsGame): boolean {
  if (!a.createdAt || !b.createdAt) return false;
  return Date.parse(a.createdAt) < Date.parse(b.createdAt);
}

/** Generic badge shape, so streak badges and others can join later. */
export interface EarnedBadge {
  key: string;
  earnedOn: string; // YYYY-MM-DD
}

export interface PointsBreakdown {
  total: number;
  tier: PointsTier;
  gamesPlayed: number;
  peakTotal: number;
  highestTierEver: PointsTier;
  lastPlayed: string | null;
  daysAway: number | null;
  decayApplied: number;
  todayPoints: number | null;
  totalBeforeToday: number | null;
  badges: EarnedBadge[];
  fallbackRows: number;
}

function dayDiff(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * First-try rounds: a round is first-try when its first recorded event is
 * `SOLVE`. Where `roundEvents` is missing or not an array, fall back to a
 * conservative lower bound from the counters older rows do carry.
 */
export function firstTryRounds(game: PointsGame): number {
  if (Array.isArray(game.roundEvents)) {
    return game.roundEvents.filter((r) => Array.isArray(r) && r[0] === "SOLVE").length;
  }
  if ((game.totalMisses ?? 0) === 0) return Math.max(0, game.roundsSolved ?? 0);
  return Math.max(0, (game.roundsSolved ?? 0) - (game.totalMisses ?? 0));
}

/** Points earned by one finished result. Never more than 5. */
export function gamePoints(game: PointsGame): number {
  return (
    POINT_PLAY +
    Math.min(POINT_FIRST_TRY_MAX, firstTryRounds(game)) +
    (game.peekUsed ? 0 : POINT_NO_PEEK)
  );
}

/** Raw points a gap of `days` would cost, before the protected floor applies. */
export function decayForGap(days: number): number {
  return Math.max(0, days - GRACE_DAYS) * DECAY_PER_DAY;
}

/**
 * Apply a gap's decay to a running total. Decay may only remove points above
 * `DECAY_PROTECTED_POINTS`: a total already at or below it never decays.
 */
export function applyDecay(total: number, days: number): number {
  if (total <= DECAY_PROTECTED_POINTS) return Math.max(0, total);
  return Math.max(DECAY_PROTECTED_POINTS, total - decayForGap(days));
}

/**
 * Pure mirror of the SQL walk. Results are taken in `puzzle_date` order; each
 * game adds its points and each gap past the grace window subtracts, never
 * below the protected floor — so a returning player rebuilds from where decay
 * left them. Deterministic: the same history always gives the same total.
 */
export function computeWhoopPoints(
  games: PointsGame[],
  asOf: string = todayUtc()
): PointsBreakdown {
  // First attempt counts, always: one result per puzzle, the earliest saved.
  // A replay — however much better — never replaces it.
  const byPuzzle = new Map<number, PointsGame>();
  for (const g of games) {
    if (dayDiff(asOf, g.puzzleDate) < 0) continue;
    const seen = byPuzzle.get(g.puzzleNumber);
    if (!seen || isEarlierAttempt(g, seen)) byPuzzle.set(g.puzzleNumber, g);
  }
  const ordered = [...byPuzzle.values()].sort(
    (a, b) => dayDiff(a.puzzleDate, b.puzzleDate) || a.puzzleNumber - b.puzzleNumber
  );

  if (ordered.length === 0) {
    return {
      total: 0,
      tier: "rookie",
      gamesPlayed: 0,
      peakTotal: 0,
      highestTierEver: "rookie",
      lastPlayed: null,
      daysAway: null,
      decayApplied: 0,
      todayPoints: null,
      totalBeforeToday: null,
      badges: [],
      fallbackRows: 0,
    };
  }

  let total = 0;
  let peak = 0;
  let fallbackRows = 0;
  let todayPoints: number | null = null;
  let totalBeforeToday: number | null = null;
  let prev: string | null = null;
  const earned = new Map<string, string>();

  for (const g of ordered) {
    if (prev) total = applyDecay(total, dayDiff(g.puzzleDate, prev));
    if (g.puzzleDate === asOf && todayPoints === null) {
      totalBeforeToday = total;
      todayPoints = 0;
    }
    const pts = gamePoints(g);
    if (!Array.isArray(g.roundEvents)) fallbackRows += 1;
    total = Math.max(0, total + pts);
    if (g.puzzleDate === asOf) todayPoints = (todayPoints ?? 0) + pts;
    if (total > peak) peak = total;
    for (const t of POINTS_TIER_FLOORS) {
      if (total >= t.floor && !earned.has(t.tier)) earned.set(t.tier, g.puzzleDate);
    }
    prev = g.puzzleDate;
  }

  const lastPlayed = ordered[ordered.length - 1].puzzleDate;
  const daysAway = dayDiff(asOf, lastPlayed);
  const afterDecay = applyDecay(total, daysAway);
  const decayApplied = total - afterDecay;
  total = afterDecay;

  const badges: EarnedBadge[] = [...POINTS_TIER_FLOORS]
    .reverse()
    .filter((t) => earned.has(t.tier))
    .map((t) => ({ key: t.tier, earnedOn: earned.get(t.tier)! }));

  return {
    total,
    tier: pointsTierForTotal(total),
    gamesPlayed: ordered.length,
    peakTotal: peak,
    highestTierEver: pointsTierForTotal(peak),
    lastPlayed,
    daysAway,
    decayApplied,
    todayPoints,
    totalBeforeToday,
    badges,
    fallbackRows,
  };
}

// --------------------------------------------------------------------- reads --

export interface WhoopPoints {
  total: number;
  tier: PointsTier;
  todayPoints: number | null;
  totalBeforeToday: number | null;
  pointsToNextTier: number | null;
  nextTierThreshold: number | null;
  peakTotal: number;
  highestTierEver: PointsTier;
  badges: EarnedBadge[];
  daysAway: number | null;
  decayApplied: number;
  gamesPlayed: number;
}

/** The caller's own points. Null on any failure so callers can hide the block. */
export async function fetchWhoopPoints(
  visitorId: string = getVisitorId(),
  email: string | null = getSubscribedEmail()
): Promise<WhoopPoints | null> {
  try {
    const { data, error } = await supabase.rpc("get_whoop_points", {
      p_visitor_id: visitorId,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    const rawBadges = Array.isArray(row.badges) ? row.badges : [];
    return {
      total: Number(row.total ?? 0),
      tier: (row.tier as PointsTier) ?? "rookie",
      todayPoints: num(row.today_points),
      totalBeforeToday: num(row.total_before_today),
      pointsToNextTier: num(row.points_to_next_tier),
      nextTierThreshold: num(row.next_tier_threshold),
      peakTotal: Number(row.peak_total ?? 0),
      highestTierEver: (row.highest_tier_ever as PointsTier) ?? "rookie",
      badges: (rawBadges as Array<{ key?: string; earned_on?: string }>)
        .filter((b) => b && typeof b.key === "string" && typeof b.earned_on === "string")
        .map((b) => ({ key: b.key as string, earnedOn: b.earned_on as string })),
      daysAway: num(row.days_away),
      decayApplied: Number(row.decay_applied ?? 0),
      gamesPlayed: Number(row.games_played ?? 0),
    };
  } catch {
    return null;
  }
}

export interface PointsPopulation {
  activeTotal: number;
  tiers: Array<{ tier: PointsTier; players: number; share: number }>;
}

/** Aggregate tier populations of active players, or null when nobody is active. */
export async function fetchPointsPopulation(): Promise<PointsPopulation | null> {
  try {
    const { data, error } = await supabase.rpc("get_whoop_points_population");
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const total = Number(data[0].active_total ?? 0);
    if (!total) return null;
    return {
      activeTotal: total,
      tiers: data.map((r) => ({
        tier: r.tier as PointsTier,
        players: Number(r.players ?? 0),
        share: Number(r.players ?? 0) / total,
      })),
    };
  } catch {
    return null;
  }
}
