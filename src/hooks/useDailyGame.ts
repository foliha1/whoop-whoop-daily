// ============================================================================
// useDailyGame — drives the daily puzzle's phase sequence and clock.
//
// The daily runs on its own tiny machine (src/lib/dailyEngine.ts), NOT on the
// full game engine: no draw pile, no refills, no re-rolls, no bot. This hook
// owns timing (start gate, study countdown, three rolls, peek window, clock
// ticks) and the one-attempt-per-day persistence.
// ============================================================================

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  canPeek as canPeekNow,
  currentRoll,
  dailyReducer,
  initDailyState,
  liveElapsedMs,
  PEEK_MS,
  STUDY_MS,
  type DailyPhase,
  type DailyRoll,
  type DailyState,
} from "@/lib/dailyEngine";
import { DAILY_ROLL_HERO_MS } from "@/components/DailyRoundIntro";
import { pickTumbleSeed } from "@/lib/rolls";
import {
  resolveDailyContext,
  loadDailyResult,
  saveDailyResult,
  type DailyResult,
  type DailyOverride,
} from "@/lib/daily";
import { saveDailyResultRemote } from "@/lib/dailyResults";
import {
  DAILY_MATCH_SETTLE_MS,
  WRONG_ANIM_MS as WRONG_TREATMENT_MS,
} from "@/lib/animationTiming";


const DEAL_MS = 700;      // deal-in settles before the reveal
const FLIP_MS = 500;      // card flip duration (matches GameCard)
// The Daily's wrong pair is already on screen when it shakes, so its window is
// the treatment alone — not multiplayer's reveal + hold + treatment total.
const WRONG_ANIM_MS = WRONG_TREATMENT_MS;
const MATCH_ANIM_MS = DAILY_MATCH_SETTLE_MS;
const WHOOPED_PAUSE_MS = 1200; // beat after a Whooped round before the next roll


export interface UseDailyGameResult {
  state: DailyState;
  phase: DailyPhase;
  /** Seconds remaining in the study window, rounded up (10 → 1). */
  studyRemaining: number;
  /** Live run time in ms. Tracked silently, never scored. */
  elapsedMs: number;
  roll: DailyRoll;
  tumbleSeed: number;
  seed: string;
  puzzleNumber: number;
  result: DailyResult | null;
  /** True once the finished run has been persisted. Gates the streak read. */
  resultSaved: boolean;
  alreadyPlayed: boolean;
  /** True when ?debug=1 disables the one-attempt-per-day lock. */
  debugBypass: boolean;
  /** True before launch day: the daily is gated, unplayable and never persisted. */
  preLaunch: boolean;
  /** Which debug override (if any) produced the seed/date in play. */
  debugOverride: DailyOverride;
  /** `YYYY-MM-DD` of the effective (possibly shifted) date. */
  dateKey: string;
  /** True when the single peek can be taken right now. */
  canPeek: boolean;

  start: () => void;
  select: (idx: number) => void;
  peek: () => void;
}

export function useDailyGame(): UseDailyGameResult {
  // Single source of truth for the date, seed and puzzle number in play.
  // Testing-only: ?debug=1 ignores (and never writes) the daily lock.
  const ctx = useMemo(() => resolveDailyContext(), []);
  const { seed, puzzleNumber, dateKey } = ctx;
  const debugBypass = ctx.debug;
  const stored = useMemo(
    () => (debugBypass ? null : loadDailyResult(seed)),
    [seed, debugBypass]
  );

  const [state, dispatch] = useReducer(
    dailyReducer,
    seed,
    (s: string) => initDailyState(s)
  );
  const [tumbleSeed] = useState(() => pickTumbleSeed());
  const [result, setResult] = useState<DailyResult | null>(stored);
  // True once the finished run has been persisted (locally + remotely, or
  // skipped in debug). Gates the streak read so today counts.
  const [resultSaved, setResultSaved] = useState(stored !== null);
  const alreadyPlayed = stored !== null;

  // ---- phase sequence: (start gate) deal → study → hide → roll → play ----
  useEffect(() => {
    if (state.phase !== "DEAL") return;
    const t = setTimeout(() => dispatch({ type: "REVEAL" }), DEAL_MS);
    return () => clearTimeout(t);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "STUDY") return;
    const t = setTimeout(() => dispatch({ type: "HIDE" }), STUDY_MS);
    return () => clearTimeout(t);
  }, [state.phase]);

  // HIDE is entered both after the study window and after each round ends.
  // A solved round holds for the whole match sequence (reveal → hold → ghost)
  // so the next round intro only opens once the pair has left the board.
  useEffect(() => {
    if (state.phase !== "HIDE") return;
    const delay =
      state.roundIndex === 1
        ? FLIP_MS
        : state.matchedPair.length > 0
        ? MATCH_ANIM_MS
        : WHOOPED_PAUSE_MS / 2;
    const t = setTimeout(() => dispatch({ type: "ROLL_START" }), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.roundIndex]);


  useEffect(() => {
    if (state.phase !== "ROLL") return;
    const t = setTimeout(
      () => dispatch({ type: "PLAY_START", at: Date.now() }),
      DAILY_ROLL_HERO_MS
    );
    return () => clearTimeout(t);
  }, [state.phase]);

  // ---- Whooped round: show the answer, then advance ----
  useEffect(() => {
    if (state.phase !== "WHOOPED") return;
    const t = setTimeout(
      () => dispatch({ type: "ROUND_END", at: Date.now() }),
      WHOOPED_PAUSE_MS
    );
    return () => clearTimeout(t);
  }, [state.phase, state.roundIndex]);

  // ---- peek window ----
  useEffect(() => {
    if (!state.peeking) return;
    const t = setTimeout(() => dispatch({ type: "PEEK_END" }), PEEK_MS);
    return () => clearTimeout(t);
  }, [state.peeking]);

  // ---- study countdown ----
  const [studyRemaining, setStudyRemaining] = useState(
    Math.ceil(STUDY_MS / 1000)
  );
  useEffect(() => {
    if (state.phase !== "STUDY") return;
    const start = Date.now();
    setStudyRemaining(Math.ceil(STUDY_MS / 1000));
    const id = setInterval(() => {
      const left = Math.max(0, STUDY_MS - (Date.now() - start));
      setStudyRemaining(Math.ceil(left / 1000));
    }, 100);
    return () => clearInterval(id);
  }, [state.phase]);

  // ---- running clock (paused whenever startedAt is null, e.g. during rolls) ----
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== "PLAY") return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.phase]);

  const elapsedMs = liveElapsedMs(state, now);

  // ---- animation cleanup ----
  useEffect(() => {
    if (state.wrongPair.length === 0) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_WRONG" }), WRONG_ANIM_MS);
    return () => clearTimeout(t);
  }, [state.wrongToken, state.wrongPair.length]);

  useEffect(() => {
    if (state.matchedPair.length === 0) return;
    // Cleared just after the round advances so the HIDE timer above never
    // re-reads an emptied pair mid-sequence.
    const t = setTimeout(() => dispatch({ type: "CLEAR_MATCH" }), MATCH_ANIM_MS + 50);
    return () => clearTimeout(t);
  }, [state.matchedPair.length, state.roundIndex]);


  // ---- auto-resolve once two cards are picked ----
  const resolveRef = useRef(0);
  useEffect(() => {
    if (state.phase !== "PLAY" || state.selected.length !== 2) return;
    const token = ++resolveRef.current;
    const t = setTimeout(() => {
      if (resolveRef.current === token) {
        dispatch({ type: "RESOLVE", at: Date.now() });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [state.phase, state.selected.length]);

  // ---- persist the run, once ----
  useEffect(() => {
    if (result !== null) return;
    if (state.phase !== "DONE" || state.elapsedMs === null) return;
    const finished: DailyResult = {
      seed,
      puzzleNumber,
      attributes: state.rolls.map((r) => r.attribute),
      elapsedMs: state.elapsedMs,
      roundsSolved: state.roundsSolved,
      totalMisses: state.totalMisses,
      roundEvents: state.roundEvents,
      peekUsed: state.peekUsed,
      peekRound: state.peekRound,
      failed: state.failed,
      completedAt: new Date().toISOString(),
    };
    if (ctx.preLaunch) {
      // Gated: nothing is written locally or remotely before launch day.
      setResult(finished);
      return;
    }
    if (!debugBypass) {
      saveDailyResult(finished);
      // Fire-and-forget: the result screen never waits on the network. The
      // streak read is gated on this settling so it counts today's run.
      void saveDailyResultRemote(finished).then(() => setResultSaved(true));
    } else {
      setResultSaved(true);
    }
    setResult(finished);

  }, [
    state.phase,
    state.elapsedMs,
    state.rolls,
    state.roundsSolved,
    state.totalMisses,
    state.roundEvents,
    state.peekUsed,
    state.peekRound,
    state.failed,
    result,
    seed,
    puzzleNumber,
    debugBypass,
    ctx.preLaunch,
  ]);

  // The gate is enforced here too, so no path can start a pre-launch run.
  const start = useCallback(() => {
    if (ctx.preLaunch) return;
    dispatch({ type: "START" });
  }, [ctx.preLaunch]);
  const select = useCallback((idx: number) => dispatch({ type: "SELECT", idx }), []);
  const peek = useCallback(() => dispatch({ type: "PEEK" }), []);

  return {
    state,
    phase: state.phase,
    studyRemaining,
    elapsedMs,
    roll: currentRoll(state),
    tumbleSeed,
    seed,
    puzzleNumber,
    result,
    resultSaved,
    alreadyPlayed,
    debugBypass,
    preLaunch: ctx.preLaunch,
    debugOverride: ctx.override,
    dateKey,
    canPeek: canPeekNow(state),

    start,
    select,
    peek,
  };
}
