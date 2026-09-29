// ============================================================================
// Leaving the Daily mid-run (umbrella ON). The run ends and becomes today's
// one first attempt: rounds already played keep their marks, and every round
// not finished counts as unsolved.
//
// "Unsolved" is recorded exactly as the game already records a Whooped round:
// two misses. The server's result check requires that shape, so nothing about
// scoring, points, tiers or the check itself changes. The streak is kept
// because a saved first attempt counts as a played day.
// ============================================================================

import { DAILY_ROUNDS, MISSES_PER_ROUND, type DailyMark, type DailyState } from "@/lib/dailyEngine";
import type { DailyResult } from "@/lib/daily";

/** The server's per-mark tap floor (daily_result_reject_reason). */
const MS_PER_EVENT_FLOOR = 250;

/** True once a run has started (Tap to Start pressed) and has not finished. */
export function runInProgress(state: DailyState): boolean {
  return state.phase !== "READY" && state.phase !== "DONE";
}

export function buildForfeitResult(
  state: DailyState,
  seed: string,
  puzzleNumber: number,
  now: number = Date.now(),
): DailyResult {
  const roundEvents: DailyMark[][] = Array.from({ length: DAILY_ROUNDS }, (_, i) => {
    const marks = [...(state.roundEvents[i] ?? [])];
    if (marks.includes("SOLVE")) return marks;
    while (marks.length < MISSES_PER_ROUND) marks.push("MISS");
    return marks.slice(0, MISSES_PER_ROUND);
  });
  const roundsSolved = roundEvents.filter((r) => r.includes("SOLVE")).length;
  const totalMisses = roundEvents.reduce((n, r) => n + r.filter((m) => m === "MISS").length, 0);
  const events = roundEvents.reduce((n, r) => n + r.length, 0);
  const running = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
  const elapsedMs = Math.max(state.accumulatedMs + running, events * MS_PER_EVENT_FLOOR);
  return {
    seed,
    puzzleNumber,
    attributes: state.rolls.map((r) => r.attribute),
    elapsedMs,
    roundsSolved,
    totalMisses,
    roundEvents,
    peekUsed: state.peekUsed,
    peekRound: state.peekRound,
    failed: roundsSolved === 0,
    completedAt: new Date(now).toISOString(),
  };
}
