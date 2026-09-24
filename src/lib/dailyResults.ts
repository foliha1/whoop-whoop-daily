// ============================================================================
// Daily results persistence — one row per visitor per puzzle, written through
// security-definer RPCs. Never blocks the UI: every failure is swallowed.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { getSubscribedEmail } from "@/lib/dailySubscribe";

import { getLocalDateString, type DailyResult } from "@/lib/daily";
import type { DailyMark } from "@/lib/dailyEngine";

export interface StoredDailyResult {
  puzzle_number: number;
  puzzle_date: string;
  rounds_solved: number;
  total_misses: number;
  peek_used: boolean;
  round_events: DailyMark[][];
  elapsed_ms: number;
  created_at: string;
}

/** `whoop-2026-08-05` → `2026-08-05`. Falls back to today (local). */
function puzzleDateFromSeed(seed: string): string {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(seed ?? "");
  if (m) return m[1];
  return getLocalDateString();
}

/**
 * Fire-and-forget write of a finished run. Resolves `true` when a new row was
 * stored, `false` when it was a duplicate or the write failed.
 */
export async function saveDailyResultRemote(
  result: DailyResult,
  visitorId: string = getVisitorId()
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("save_daily_result", {
      p_visitor_id: visitorId,
      p_puzzle_number: result.puzzleNumber,
      p_puzzle_date: puzzleDateFromSeed(result.seed),
      p_rounds_solved: result.roundsSolved,
      p_total_misses: result.totalMisses,
      p_peek_used: result.peekUsed,
      p_round_events: result.roundEvents ?? [],
      p_elapsed_ms: Math.round(result.elapsedMs ?? 0),
      // Lets the server refuse a replay when this email already has the puzzle.
      p_email: getSubscribedEmail(),
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export interface FirstAttempt extends StoredDailyResult {
  /** Saved by this browser (vs. another browser known for the email). */
  is_mine: boolean;
}

/**
 * The player's first attempt at a puzzle — across this browser and every
 * browser known for `email`. Null when none exists or the read fails.
 */
export async function fetchFirstAttempt(
  puzzleNumber: number,
  email: string | null,
  visitorId: string = getVisitorId()
): Promise<FirstAttempt | null> {
  try {
    const { data, error } = await supabase.rpc("get_first_attempt", {
      p_visitor_id: visitorId,
      p_email: email ?? "",
      p_puzzle_number: puzzleNumber,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? (row as unknown as FirstAttempt) : null;
  } catch {
    return null;
  }
}

/**
 * A player's stored results, ordered by puzzle number. Basis for streaks and
 * the recall trend. When `email` is given the server unions in rows saved under
 * other visitor ids for that address, deduplicated by puzzle number, so a
 * switched device reads the whole history.
 */
export async function fetchDailyResults(
  visitorId: string = getVisitorId(),
  email: string | null = null
): Promise<StoredDailyResult[]> {
  try {
    const { data, error } = await supabase.rpc("get_daily_results", {
      p_visitor_id: visitorId,
      ...(email ? { p_email: email } : {}),
    });
    if (error || !Array.isArray(data)) return [];
    return data as unknown as StoredDailyResult[];
  } catch {
    return [];
  }
}

export interface DailyStreak {
  current: number;
  longest: number;
}

/**
 * Streak = consecutive puzzle numbers played (playing counts, solving does not).
 * Computed in SQL over the union of this visitor's rows and any rows linked to
 * `email`, so a cleared browser or a new phone restores the streak on signup.
 * Returns null when the fetch fails so callers can hide the line.
 */
export async function fetchStreak(
  currentPuzzleNumber: number,
  visitorId: string = getVisitorId(),
  email: string | null = getSubscribedEmail()
): Promise<DailyStreak | null> {
  try {
    const { data, error } = await supabase.rpc("get_streak", {
      p_visitor_id: visitorId,
      p_current_puzzle_number: currentPuzzleNumber,
      ...(email ? { p_email: email } : {}),
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      current: Number(row.current_streak ?? 0),
      longest: Number(row.longest_streak ?? 0),
    };
  } catch {
    return null;
  }
}

/** "Streak: 1 day" / "Streak: 4 days". */
export function formatStreakLine(days: number): string {
  return `Streak: ${days} ${days === 1 ? "day" : "days"}`;
}

export interface DailyStats {
  totalPlayed: number;
  cleanRuns: number;
  bestStreak: number;
  avgMisses: number;
}

/**
 * Lifetime totals for a player, aggregated in SQL over the visitor/email union.
 * Returns null on failure (or with nothing played) so the block can be hidden.
 */
export async function fetchDailyStats(
  visitorId: string = getVisitorId(),
  email: string | null = getSubscribedEmail()
): Promise<DailyStats | null> {
  try {
    const { data, error } = await supabase.rpc("get_daily_stats", {
      p_visitor_id: visitorId,
      ...(email ? { p_email: email } : {}),
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const totalPlayed = Number(row.total_played ?? 0);
    if (!Number.isFinite(totalPlayed) || totalPlayed < 1) return null;
    return {
      totalPlayed,
      cleanRuns: Number(row.clean_runs ?? 0),
      bestStreak: Number(row.best_streak ?? 0),
      avgMisses: Number(row.avg_misses ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Percent of that day's players this run beat or matched. Null when the server
 * withholds it (fewer than 20 players on the puzzle) or the fetch fails.
 */
export async function fetchDailyPercentile(
  puzzleNumber: number,
  visitorId: string = getVisitorId(),
  email: string | null = getSubscribedEmail()
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("get_daily_percentile", {
      p_visitor_id: visitorId,
      p_puzzle_number: puzzleNumber,
      ...(email ? { p_email: email } : {}),
    });
    if (error || data === null || data === undefined) return null;
    const pct = Number(data);
    return Number.isFinite(pct) ? pct : null;
  } catch {
    return null;
  }
}

/** "Better than 78% of today's players". */
export function formatPercentileLine(pct: number): string {
  return `Better than ${pct}% of today's players`;
}

/** "1.4 misses" / "1 miss" — average misses, trimmed of trailing zeroes. */
export function formatAvgMisses(avg: number): string {
  const rounded = Math.round(avg * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

