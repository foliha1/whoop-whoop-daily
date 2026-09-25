// ============================================================================
// Daily puzzle helpers — seed + puzzle number, both derived from the device's
// LOCAL calendar date, so the puzzle rolls over at each player's own midnight
// while everyone on the same calendar date shares the same puzzle.
// ============================================================================

import { DAILY_ROUNDS, type DailyMark } from "@/lib/dailyEngine";

/** Fixed launch day. Puzzle #1 is the local calendar date 2026-08-11. */
export const DAILY_LAUNCH_UTC = Date.UTC(2026, 7, 11); // 2026-08-11


const MS_PER_DAY = 86_400_000;

/**
 * `YYYY-MM-DD` for the given date in the device's local time zone.
 * Single source of truth for every date the daily puzzle keys off.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` (local). */
export function getDailyDateKey(date: Date = new Date()): string {
  return getLocalDateString(date);
}

/** The shared seed for the day, e.g. `whoop-2026-08-04`. */
export function getDailySeed(date: Date = new Date()): string {
  return `whoop-${getLocalDateString(date)}`;
}

/**
 * Days elapsed since launch, starting at 1, counted in whole calendar days.
 * Calendar parts are projected onto UTC midnight before differencing, so DST
 * transitions can never skip or repeat a day.
 *
 * Deliberately unclamped: a pre-launch date returns 0 or a negative number so
 * that no two calendar dates can ever share a puzzle number (a clamp to 1 would
 * collide with launch day on the `(visitor_id, puzzle_number)` constraint).
 * Callers use `isPreLaunch` and never play or persist a non-positive number.
 */
export function getDailyNumber(date: Date = new Date()): number {
  const [y, m, d] = getLocalDateString(date).split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - DAILY_LAUNCH_UTC) / MS_PER_DAY);
  return days + 1;
}

/** Human-readable launch day, used by the pre-launch gate copy. */
export const DAILY_LAUNCH_LABEL = "August 11th";

/** True when the given local date falls before launch day. */
export function isPreLaunch(date: Date = new Date()): boolean {
  return getDailyNumber(date) < 1;
}



// ---------------------------------------------------------------------------
// Beta-testing overrides — the ONE place query-string overrides are resolved.
// Both are gated behind ?debug=1 and have no effect without it.
//
//   ?debug=1&day=N          shift the effective date by N whole days
//   ?debug=1&seed=whatever  replace the seed outright (wins over `day`)
// ---------------------------------------------------------------------------

export type DailyOverride = "none" | "day" | "seed";

export interface DailyContext {
  /** True when ?debug=1 is present. */
  debug: boolean;
  /** Which override is in play. */
  override: DailyOverride;
  /** Whole-day shift applied to the effective date (0 unless override is "day"). */
  dayOffset: number;
  /** The raw seed supplied via ?seed=, else null. */
  rawSeed: string | null;
  /** The seed actually in play. */
  seed: string;
  /** The puzzle number in play — today's unless a day offset shifted it. */
  puzzleNumber: number;
  /** `YYYY-MM-DD` of the effective (possibly shifted) date. */
  dateKey: string;
  /**
   * True when the effective date is before launch day, so the daily must not be
   * played or persisted. Always false under ?debug=1: debug bypasses the gate.
   */
  preLaunch: boolean;
}


/** Shift a local calendar date by whole days, DST-safe. */
function shiftLocalDays(date: Date, days: number): Date {
  const [y, m, d] = getLocalDateString(date).split("-").map(Number);
  return new Date(y, m - 1, d + days, 12);
}

/**
 * Single source of truth for the date, seed and puzzle number in play.
 * Components must read from here rather than parsing the query string.
 */
export function resolveDailyContext(
  search?: string,
  now: Date = new Date()
): DailyContext {
  const raw =
    search ?? (typeof window === "undefined" ? "" : window.location.search);
  const params = new URLSearchParams(raw);
  const debug = params.get("debug") === "1";

  const base: DailyContext = {
    debug,
    override: "none",
    dayOffset: 0,
    rawSeed: null,
    seed: getDailySeed(now),
    puzzleNumber: getDailyNumber(now),
    dateKey: getLocalDateString(now),
    // Debug bypasses the gate entirely so launch day can be tested early.
    preLaunch: !debug && isPreLaunch(now),
  };

  if (!debug) return base;

  // `seed` wins when both are present.
  const seedParam = params.get("seed");
  if (seedParam) {
    return { ...base, override: "seed", rawSeed: seedParam, seed: seedParam };
  }

  const dayParam = params.get("day");
  if (dayParam !== null && /^-?\d+$/.test(dayParam.trim())) {
    const dayOffset = Number(dayParam.trim());
    if (dayOffset !== 0) {
      const shifted = shiftLocalDays(now, dayOffset);
      return {
        ...base,
        override: "day",
        dayOffset,
        seed: getDailySeed(shifted),
        puzzleNumber: getDailyNumber(shifted),
        dateKey: getLocalDateString(shifted),
      };
    }
  }

  return base;
}




// ---------------------------------------------------------------------------
// One attempt per day — completion record in localStorage.
// ---------------------------------------------------------------------------

export interface DailyResult {
  seed: string;
  puzzleNumber: number;
  /** The three rules the dice landed on, in round order. */
  attributes: ("SHAPE" | "NUMBER" | "COLOR")[];
  /** Total run time in ms. Recorded silently as a future tiebreak. */
  elapsedMs: number;
  /** Rounds solved by a correct call, 0 → 3. */
  roundsSolved: number;
  /** Misses spent across the run. */
  totalMisses: number;
  /** Per-round event lists, index 0 = round 1. */
  roundEvents: DailyMark[][];
  /** Whether the single peek was spent. */
  peekUsed: boolean;
  /** The round the peek was used in, or null. */
  peekRound: number | null;
  /** True when no round was solved. */
  failed: boolean;
  completedAt: string;
  /**
   * Who this record belongs to on this browser: the anonymous player
   * ("anon") or the owning account ("user:<id>"; older records say
   * "account"). Account records are removed
   * on sign-out and deletion so they never show to the next person.
   * Missing on older records, which are treated as the browser's own.
   */
  owner?: DailyResultOwner;
}

export type DailyResultOwner = "anon" | "account" | `user:${string}`;

function isAccountOwner(owner: unknown): owner is DailyResultOwner {
  return owner === "account" || (typeof owner === "string" && /^user:.+/.test(owner));
}

/** True when a stored record belongs to a signed-in account, not this browser. */
export function isAccountOwnedRecord(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return isAccountOwner((JSON.parse(raw) as { owner?: unknown })?.owner);
  } catch {
    return false;
  }
}

export function dailyStorageKey(seed: string): string {
  return `ww_daily_${seed}`;
}

const emptyRounds = (): DailyMark[][] =>
  Array.from({ length: DAILY_ROUNDS }, () => [] as DailyMark[]);

export function loadDailyResult(seed: string): DailyResult | null {
  try {
    const raw = window.localStorage.getItem(dailyStorageKey(seed));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DailyResult> & {
      attribute?: DailyResult["attributes"][number];
      missesUsed?: number;
      wrongCalls?: number;
    };
    if (typeof parsed?.elapsedMs !== "number") return null;
    // Legacy single-round records stored one `attribute` instead of three.
    const attributes = Array.isArray(parsed.attributes)
      ? parsed.attributes
      : parsed.attribute
        ? [parsed.attribute]
        : [];
    const totalMisses =
      typeof parsed.totalMisses === "number"
        ? parsed.totalMisses
        : (parsed.missesUsed ?? parsed.wrongCalls ?? 0);
    const roundEvents = Array.isArray(parsed.roundEvents)
      ? parsed.roundEvents
      : emptyRounds();
    return {
      seed: parsed.seed ?? seed,
      puzzleNumber: parsed.puzzleNumber ?? 1,
      attributes,
      elapsedMs: parsed.elapsedMs,
      roundsSolved: typeof parsed.roundsSolved === "number" ? parsed.roundsSolved : 0,
      totalMisses,
      roundEvents,
      peekUsed: parsed.peekUsed === true,
      peekRound: typeof parsed.peekRound === "number" ? parsed.peekRound : null,
      failed: parsed.failed === true,
      completedAt: parsed.completedAt ?? new Date().toISOString(),
      owner: isAccountOwner(parsed.owner) ? parsed.owner : "anon",
    };
  } catch {
    return null;
  }
}

export function saveDailyResult(result: DailyResult, owner: DailyResultOwner): void {
  try {
    window.localStorage.setItem(
      dailyStorageKey(result.seed),
      JSON.stringify({ ...result, owner })
    );
  } catch {
    /* storage unavailable — the attempt just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Shareable result — marks and counts only. Never a card, position or rule.
// ---------------------------------------------------------------------------

export const DAILY_SHARE_URL = "https://whoop-whoop.com";

/**
 * The caption that travels WITH the share image, where the picture already
 * carries the score. Deliberately an invitation, not a scoreboard:
 *   Hey! Look at my Whoop! Whoop! Daily #1.
 *   Have you done it yet?
 *   whoop-whoop.com
 */
export function formatDailyShareCaption(puzzleNumber: number): string {
  return [
    `Hey! Look at my Whoop! Whoop! Daily #${puzzleNumber}.`,
    "Have you done it yet?",
    "whoop-whoop.com",
  ].join("\n");
}

/**
 * The share text:
 *   WHOOP! WHOOP! #14
 *   R1 🔵 · R2 👀🔴🔵 · R3 🔴🔵
 *   3 of 3 · 3 misses
 *
 *   https://whoop-whoop.com
 */
/** Streaks only make the share block at 3+ days — below that it's clutter. */
const SHARE_STREAK_MIN = 3;

export function formatDailyShare(
  result: DailyResult,
  streak?: number | null,
  /** Percent of today's players beaten. Omitted/null keeps the segment out. */
  percentile?: number | null
): string {
  const rounds = (result.roundEvents ?? []).map((events, i) => {
    const peek = result.peekUsed && result.peekRound === i + 1 ? "👀" : "";
    const marks = events.map((m) => (m === "SOLVE" ? "🔵" : "🔴")).join("");
    return `R${i + 1} ${peek}${marks}`;
  });

  const solved = result.roundsSolved ?? 0;
  const misses = result.totalMisses ?? 0;
  const streakTag =
    typeof streak === "number" && streak >= SHARE_STREAK_MIN
      ? ` · ${streak} day streak`
      : "";
  const percentileTag =
    typeof percentile === "number" && Number.isFinite(percentile)
      ? ` · Better than ${percentile}% today`
      : "";
  const missTag =
    misses === 0 ? "Clean" : `${misses} ${misses === 1 ? "miss" : "misses"}`;
  const line3 =
    (solved === 0
      ? "Whooped! Better luck tomorrow."
      : `${solved} of ${DAILY_ROUNDS} · ${missTag}`) +
    streakTag +
    percentileTag;

  return [
    `WHOOP! WHOOP! #${result.puzzleNumber}`,
    rounds.join(" · "),
    line3,
    "",
    DAILY_SHARE_URL,
  ].join("\n");
}

