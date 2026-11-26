import { useReducer, useCallback, useRef, useEffect, useMemo } from "react";
import type { Card } from "@/cardData";
import { createOpponentMemory, OpponentMemory } from "@/lib/opponentMemory";
import { ROTATION_CLAIM_WINDOW_MS, CLAIM_ABANDON_MS } from "@/lib/animationTiming";
import { DeadlineQueue } from "@/lib/hostDeadlines";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import { computeSafetySwap, rngOf } from "@/lib/rolls";
import {
  OPPONENT_TUNING,
  REVEAL_MS,
  computeRule,
  defaultNames,
  getDieCount,
  hasAnyValidPair,
  hasLegalCard,
  initialState,
  reducer,
  rollRandomAttributes,
} from "@/lib/gameEngine";

// The rules live in src/lib/gameEngine.ts (shared with the Together table
// server). Re-exported here so existing imports keep working.
export * from "@/lib/gameEngine";

// ============================================================================
// Hook
// ============================================================================

export interface UseGameStateOptions {
  seatCount?: number;
  botSeats?: number[];
  names?: string[];
  /** Optional reproducible seed (daily puzzle). Omitted = Math.random. */
  seed?: string;
}

export function useGameState(
  gridSize: "3x2" | "3x3" = "3x2",
  opts: UseGameStateOptions = {}
) {
  const slotCount = gridSize === "3x3" ? 9 : 6;
  const seatCount = opts.seatCount ?? 2;
  const botSeats = opts.botSeats ?? [1];
  const names = opts.names ?? defaultNames(seatCount);
  const botSeatSet = useMemo(() => new Set(botSeats), [botSeats.join(",")]);
  const humanSeat = useMemo(() => {
    for (let i = 0; i < seatCount; i++) if (!botSeatSet.has(i)) return i;
    return 0;
  }, [seatCount, botSeatSet]);
  // The scheduling bot seat (single-bot memory scheduler preserves today's
  // behaviour verbatim at N=2, botSeats=[1]). Multi-bot memory is out of scope.
  const schedulerBot = botSeats.length > 0 ? botSeats[0] : -1;

  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => initialState(slotCount, { seatCount, names, seed: opts.seed })
  );

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const tokenRef = useRef(0);
  // Load-bearing timers are absolute deadlines (setTimeout is only a wake-up)
  // so a host returning from the background can drain them in order.
  const deadlinesRef = useRef<DeadlineQueue | null>(null);
  if (deadlinesRef.current === null) deadlinesRef.current = new DeadlineQueue();
  const deadlines = deadlinesRef.current;
  useEffect(() => () => deadlines.clearAll(), [deadlines]);
  const nextToken = () => ++tokenRef.current;

  const memoryRef = useRef<OpponentMemory | null>(null);
  if (botSeats.length > 0 && memoryRef.current === null) {
    memoryRef.current = createOpponentMemory();
  }
  const prevPeekingRef = useRef<number | null>(null);
  const prevGridRef = useRef<(Card | null)[]>(state.grid);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppClaimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oppClaimResolveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Token of the window we already scheduled an expiry for. Because we skip
  // re-scheduling for a token we've already seen, a claim resolving inside the
  // window (which re-enters CLAIM_WINDOW with the SAME token) cannot restart
  // the timer.
  const scheduledClaimWindowRef = useRef<number>(-1);

  // ---- abandoned claim expiry ----------------------------------------------
  // The owner of the reducer (host, or the solo client) bounds how long an open
  // claim may sit unresolved. If the claimant never lands two cards, the claim
  // is dropped and play continues in the same round.
  const claimAbandonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void claimAbandonTimerRef;
    if (state.phase !== "CLAIM_SELECTING") {
      deadlines.cancel("claim_abandon");
      return;
    }
    const seq = state.claimSeq;
    deadlines.after("claim_abandon", "claim_abandon", CLAIM_ABANDON_MS, () =>
      dispatch({ type: "CLAIM_ABANDONED", seq }),
    );
    return () => deadlines.cancel("claim_abandon");
  }, [state.phase, state.claimSeq, deadlines]);



  useEffect(() => {
    void claimWindowTimerRef;
    if (!state.claimWindowOpen) {
      deadlines.cancel("claim_window");
      scheduledClaimWindowRef.current = -1;
      return;
    }
    const token = state.claimWindowToken;
    if (scheduledClaimWindowRef.current === token) return;
    scheduledClaimWindowRef.current = token;
    deadlines.after("claim_window", "claim_window_expire", ROTATION_CLAIM_WINDOW_MS, () =>
      dispatch({ type: "CLAIM_WINDOW_EXPIRE", token }),
    );
  }, [state.claimWindowOpen, state.claimWindowToken, deadlines]);

  // Re-INIT when EITHER the grid size OR the seat count changes. Multiplayer
  // mounts this hook with seatCount=2 (empty frozenSeats) before "Lets do it!"
  // fills the seat map; on that transition we must re-init so the reducer's
  // seat-indexed arrays (scores, skip, wrongBy, disconnected) grow to match.
  const initKeyRef = useRef(`${slotCount}:${seatCount}`);
  useEffect(() => {
    const key = `${slotCount}:${seatCount}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    memoryRef.current?.reset();
    prevPeekingRef.current = null;
    dispatch({ type: "INIT", slotCount, seatCount, names, seed: opts.seed });
  }, [slotCount, seatCount, names, opts.seed]);


  const runRollAnimation = useCallback((predetermined?: string[], anchorAt?: number): Promise<string[]> => {
    return new Promise((resolve) => {
      dispatch({ type: "ROLL_START" });
      const count = getDieCount();
      const finalValues =
        predetermined && predetermined.length === count
          ? predetermined
          : rollRandomAttributes(count, rngOf(stateRef.current));
      const { rule } = computeRule(finalValues);
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = setInterval(() => {
        dispatch({ type: "TUMBLE", values: rollRandomAttributes(count) });
      }, 100);
      void rollTimeoutRef;
      void rollSettleRef;
      // anchorAt: the roll's committed start (local clock), so a host that
      // resumes late lands the roll on its original timeline.
      const landDue = (anchorAt ?? deadlines.now()) + 450;
      deadlines.schedule("roll_land", "roll_land", landDue, () => {
        if (rollIntervalRef.current) {
          clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        dispatch({ type: "ROLL_LAND", values: finalValues, rule });
        // Total ROLLING-phase duration (tumble + hold + land) is
        // ROLL_HERO_MS. The reducer must match the overlay so the server
        // does not unlock flips/claims before the die has visually landed.
        // Anchored to the landing deadline, not to when it actually ran.
        deadlines.schedule("roll_settle", "roll_settle", landDue + ROLL_HERO_MS - 450, () => {
          dispatch({ type: "ROLL_SETTLE" });
          resolve(rule);
        });
      });
    });
  }, [deadlines]);

  const rollDice = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== "AWAITING_ROLL") return;
    if (s.roller !== humanSeat) return;
    if (s.rolling) return;
    await runRollAnimation();
  }, [runRollAnimation, humanSeat]);

  const doRollDice = runRollAnimation;

  // Bot auto-roll
  useEffect(() => {
    if (state.phase !== "AWAITING_ROLL") return;
    if (!botSeatSet.has(state.roller)) return;
    if (state.rolling) return;
    const t = setTimeout(() => {
      runRollAnimation();
    }, OPPONENT_TUNING.thinkDelayMs);
    return () => clearTimeout(t);
  }, [state.phase, state.roller, state.rolling, runRollAnimation, botSeatSet]);

  const peekCard = useCallback((index: number) => {
    const s = stateRef.current;
    if (s.phase !== "FLIPPING") return;
    if (s.flipper !== humanSeat) return;
    if (s.inFlight) return;
    if (s.wrongBy[humanSeat].has(index)) return;
    if (s.grid[index] === null) return;
    const token = nextToken();
    dispatch({ type: "FLIP_START", by: humanSeat, idx: index, token });
    void peekTimerRef;
    deadlines.after(`flip:${token}`, "flip_complete", REVEAL_MS, () =>
      dispatch({ type: "FLIP_COMPLETE", token }),
    );
  }, [humanSeat, deadlines]);

  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (state.inFlight) return;
    // Auto-tick past a flipper that cannot act — disconnected, or locked out
    // of every remaining card by earlier wrong claims — so the round never
    // hard-stops.
    if (!state.disconnected[state.flipper] && hasLegalCard(state, state.flipper))
      return;
    dispatch({ type: "SKIP_TICK" });
  }, [state.phase, state.flipper, state.inFlight, state.disconnected, state.grid, state.wrongBy]);

  // Bot auto-flip
  const inFlightNullMarker = state.inFlight === null;
  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (!botSeatSet.has(state.flipper)) return;
    if (!inFlightNullMarker) return;
    const botSeat = state.flipper;
    if (oppDelayRef.current) clearTimeout(oppDelayRef.current);
    oppDelayRef.current = setTimeout(() => {
      oppDelayRef.current = null;
      const s = stateRef.current;
      if (s.phase !== "FLIPPING" || s.flipper !== botSeat || s.inFlight) return;
      const candidates = s.grid
        .map((c, i) => (c !== null && !s.wrongBy[botSeat].has(i) ? i : -1))
        .filter((i) => i !== -1);
      if (candidates.length === 0) {
        dispatch({ type: "SKIP_TICK" });
        return;
      }
      const unknown = candidates.filter(
        (i) => memoryRef.current?.recall(i) == null
      );
      const pool = unknown.length > 0 ? unknown : candidates;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const token = nextToken();
      dispatch({ type: "FLIP_START", by: botSeat, idx: pick, token });
      if (oppRevealRef.current) clearTimeout(oppRevealRef.current);
      oppRevealRef.current = setTimeout(() => {
        oppRevealRef.current = null;
        dispatch({ type: "FLIP_COMPLETE", token });
      }, REVEAL_MS);
    }, OPPONENT_TUNING.thinkDelayMs);
    return () => {
      if (oppDelayRef.current) {
        clearTimeout(oppDelayRef.current);
        oppDelayRef.current = null;
      }
    };
  }, [state.phase, state.flipper, inFlightNullMarker, botSeatSet]);

  const enterClaimMode = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "CLAIM_SELECTING" || s.phase === "CLAIM_RESOLVING") return;
    if (s.phase === "GAME_OVER") return;
    if (s.rolling) return;
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    if (s.phase === "AWAITING_ROLL") return;
    dispatch({ type: "PLAYER_ENTER_CLAIM", by: humanSeat });
  }, [runRollAnimation, humanSeat]);

  const selectCard = useCallback((index: number) => {
    dispatch({ type: "PLAYER_SELECT_CARD", by: humanSeat, idx: index });
  }, [humanSeat]);

  const resolveMatch = useCallback(() => {
    dispatch({ type: "PLAYER_RESOLVE_MATCH", by: humanSeat });
  }, [humanSeat]);

  const opponentClaim = useCallback((a: number, b: number) => {
    const s = stateRef.current;
    if (s.phase !== "FLIPPING") return;
    if (schedulerBot < 0) return;
    if (a === b) return;
    if (s.grid[a] === null || s.grid[b] === null) return;
    if (s.wrongBy[schedulerBot].has(a) || s.wrongBy[schedulerBot].has(b)) return;
    const token = nextToken();
    dispatch({ type: "CLAIM_START", by: schedulerBot, a, b, token });
    if (oppClaimResolveRef.current) clearTimeout(oppClaimResolveRef.current);
    oppClaimResolveRef.current = setTimeout(() => {
      oppClaimResolveRef.current = null;
      dispatch({ type: "CLAIM_RESOLVE", token });
    }, 1600);
  }, [schedulerBot]);

  const resolveOpponentClaim = useCallback(() => {}, []);

  // v6.5: Last Call removed. Retained as a no-op so the retiring
  // GameWindow.tsx keeps compiling until it is removed.
  const claimLastCall = useCallback((_a: number, _b: number) => {}, []);

  const removeMatchedFromGrid = useCallback(() => {
    dispatch({ type: "REMOVE_MATCHED" });
  }, []);

  // Dead-grid safety valve
  useEffect(() => {
    if (
      state.phase === "GAME_OVER" ||
      state.phase === "CLAIM_SELECTING" ||
      state.phase === "CLAIM_RESOLVING" ||
      state.rolling
    ) {
      return;
    }
    const grid = state.grid;
    const deck = state.deck;
    if (!grid.some((c) => c !== null)) return;
    if (deck.length === 0) return;
    if (hasAnyValidPair(grid)) return;
    const filledIndices = grid
      .map((c, i) => (c !== null ? i : -1))
      .filter((i) => i !== -1);
    if (filledIndices.length < 2 || deck.length < 2) return;
    // Seed-aware: draws from the state rng so a reshuffle stays reproducible.
    const swapped = computeSafetySwap(grid, deck, rngOf(state));
    dispatch({ type: "SAFETY_SWAP", grid: swapped.grid, deck: swapped.deck });
  }, [state.grid, state.deck, state.phase, state.rolling]);

  // Bot memory — only if any bot seat exists
  useEffect(() => {
    if (!memoryRef.current) return;
    const prev = prevGridRef.current;
    for (let i = 0; i < state.grid.length; i++) {
      const pc = prev[i] ?? null;
      const cc = state.grid[i] ?? null;
      if ((pc?.id ?? null) !== (cc?.id ?? null)) {
        memoryRef.current.forget(i);
      }
    }
    prevGridRef.current = state.grid;
  }, [state.grid]);

  useEffect(() => {
    if (!memoryRef.current) return;
    if (schedulerBot < 0) return;
    const prev = prevPeekingRef.current;
    prevPeekingRef.current = state.peekingCard;
    if (prev === null || state.peekingCard !== null) return;
    const card = state.grid[prev];
    memoryRef.current.decayAll();
    if (card) memoryRef.current.observe(prev, card);

    if (state.phase !== "FLIPPING" || state.inFlight) return;
    const excluded = new Set<number>(state.wrongBy[schedulerBot]);
    state.grid.forEach((c, i) => { if (c === null) excluded.add(i); });
    const best = memoryRef.current.bestPair(state.rule, excluded);
    if (!best || best.confidence < OPPONENT_TUNING.confidenceThreshold) return;
    const span = OPPONENT_TUNING.reactionMaxMs - OPPONENT_TUNING.reactionMinMs;
    const t = Math.max(
      0,
      Math.min(
        1,
        (best.confidence - OPPONENT_TUNING.confidenceThreshold) /
          (2 - OPPONENT_TUNING.confidenceThreshold)
      )
    );
    const delay = OPPONENT_TUNING.reactionMaxMs - t * span;
    if (oppClaimTimerRef.current) clearTimeout(oppClaimTimerRef.current);
    oppClaimTimerRef.current = setTimeout(() => {
      oppClaimTimerRef.current = null;
      opponentClaim(best.a, best.b);
    }, delay);
  }, [state.peekingCard, state.grid, state.phase, state.inFlight, state.wrongBy, state.rule, opponentClaim, schedulerBot]);

  useEffect(() => {
    if (oppClaimTimerRef.current) {
      clearTimeout(oppClaimTimerRef.current);
      oppClaimTimerRef.current = null;
    }
  }, [state.roundNum, state.phase]);

  const opponentClaimingValue = useMemo(
    () =>
      state.inFlight?.kind === "claim" && botSeatSet.has(state.inFlight.by)
        ? { indices: [state.inFlight.a, state.inFlight.b] as [number, number] }
        : null,
    [state.inFlight, botSeatSet]
  );

  const wrongCardsUnion = useMemo(() => {
    const u = new Set<number>();
    for (const s of state.wrongBy) s.forEach((i) => u.add(i));
    return u;
  }, [state.wrongBy]);

  return {
    // Multiplayer escape hatches — host uses these to broadcast state and
    // inject validated intents from joiners. Do NOT use in single-player UI.
    state,
    dispatch,

    deck: state.deck,
    grid: state.grid,
    matchRule: state.rule,
    dieValues: state.dieValues,
    scores: state.scores,
    roundNum: state.roundNum,
    players: state.names,
    rollerIndex: state.roller,
    flipperIndex: state.flipper,
    // v6.5: no lockout. Retained for the retiring GameWindow.tsx.
    skipNextFlip: state.disconnected,
    peekingCard: state.peekingCard,
    claimMode: state.phase === "CLAIM_SELECTING",
    selectedCards: state.selectedCards,
    wrongCards: wrongCardsUnion,
    wrongByMe: state.wrongBy[humanSeat] ?? new Set<number>(),
    matchedCards: state.matchedCards,
    gameOver: state.phase === "GAME_OVER",
    message: state.message,
    messageType: state.messageType,
    rolling: state.rolling,
    peekCard,
    enterClaimMode,
    selectCard,
    removeMatchedFromGrid,
    resolveMatch,
    doRollDice,
    opponentClaiming: opponentClaimingValue,
    opponentClaim,
    resolveOpponentClaim,
    rollPhase: state.phase === "AWAITING_ROLL",
    rollDice,
    lastCall: false as boolean,
    allFaceUp: state.allFaceUp,
    drawEmpty: state.drawEmpty,
    roundsSinceClaim: state.roundsSinceClaim,
    claimLastCall,
    deadlines,
  };
}
