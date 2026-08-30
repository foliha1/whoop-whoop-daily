// ============================================================================
// useSoloGame — drives a local 2-seat game against Felix O.
//
// Wraps useGameState with `botSeats: []` so the built-in bot scheduler stays
// dormant, then drives seat 1 (Felix) externally via the pure felixOBrain
// module. Exposes the same shape MultiplayerGameView needs: a PublicState,
// an onIntent handler, and a transient event stream.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useGameState,
  SETTLE_MATCH_MS,
  SETTLE_WRONG_MS,
} from "@/hooks/useGameState";

import { pickRoll, pickTumbleSeed, rngOf } from "@/lib/rolls";
import { toPublicState, type PublicState } from "@/lib/publicState";
import type {
  IntentAction,
  TransientEvent,
  TransientEventKind,
  RollCommitPayload,
  RollAttribute,
} from "@/lib/multiplayer";
import {
  createBrain,
  observe,
  forget,
  decay,
  findClaim,
  pickFlipTarget,
  pickReactionDelay,
  type Brain,
} from "@/lib/felixOBrain";
const OPPONENT_NAME = "Felix O.";

const FELIX_SEAT = 1;
const HUMAN_SEAT = 0;
const REVEAL_MS = 2000;
const EVENT_LIFETIME_MS = 1400;
const FELIX_ROLL_DELAY_MS = 1200;
const FELIX_FLIP_DELAY_MS = 1400;
const ROLL_ATTRS: readonly RollAttribute[] = ["SHAPE", "NUMBER", "COLOR"] as const;

const SEAT_MAP = [
  { seat: 0, visitor_id: "solo-you", display_name: "You" },
  { seat: 1, visitor_id: "solo-felix", display_name: OPPONENT_NAME },
];

export interface UseSoloGameResult {
  publicState: PublicState;
  onIntent: (a: IntentAction) => void;
  events: TransientEvent[];
  mySeat: 0;
  roomId: string;
  visitorId: string;
  gameId: string;
  rollCommit: RollCommitPayload | null;
}

export function useSoloGame(gridSize: "3x2" | "3x3" = "3x3"): UseSoloGameResult {
  const g = useGameState(gridSize, {
    seatCount: 2,
    botSeats: [],
    names: ["You", OPPONENT_NAME],
  });
  const { state, dispatch, doRollDice } = g;

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- settle scheduler (mirrors the host) ----
  useEffect(() => {
    if (state.phase !== "SETTLING" || state.settleKind === null) return;
    const ms = state.settleKind === "MATCH" ? SETTLE_MATCH_MS : SETTLE_WRONG_MS;
    const token = state.settleToken;
    const t = setTimeout(() => dispatch({ type: "SETTLE_COMPLETE", token }), ms);
    return () => clearTimeout(t);
  }, [state.phase, state.settleKind, state.settleToken, dispatch]);


  const brainRef = useRef<Brain>(createBrain());
  const tokenRef = useRef(1);
  const nextToken = () => ++tokenRef.current;

  // Solo mirrors the host's roll-commit protocol so MultiplayerGameView's
  // hero-roll overlay and MatchDie render the same way they do in
  // multiplayer. `startAt` is a local wall-clock timestamp; useServerClock's
  // offset is zero in solo, so serverNow() matches Date.now().
  const [rollCommit, setRollCommit] = useState<RollCommitPayload | null>(null);
  const commitAndRoll = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "AWAITING_ROLL" || s.rolling) return;
    const { attribute, faceIndex } = pickRoll(ROLL_ATTRS, rngOf(s));
    const tumbleSeed = pickTumbleSeed();
    const startAt = Date.now() + 150;
    setRollCommit({
      roundId: `solo:${s.roundNum}`,
      attribute,
      faceIndex,
      tumbleSeed,
      startAt,
    });
    const delay = Math.max(0, startAt - Date.now());
    setTimeout(() => {
      void doRollDice([attribute]);
    }, delay);
  }, [doRollDice]);

  // ---- observation: peek → cleared transitions on any seat's flip ----
  // Decay fires per flip observed (not per round), so forgetting scales with
  // information flow rather than table size.
  const prevPeekRef = useRef<number | null>(state.peekingCard);
  useEffect(() => {
    const prev = prevPeekRef.current;
    prevPeekRef.current = state.peekingCard;
    if (prev !== null && state.peekingCard === null) {
      const card = state.grid[prev];
      if (card) {
        brainRef.current = decay(brainRef.current);
        brainRef.current = observe(brainRef.current, prev, card);
      }
    }
  }, [state.peekingCard, state.grid]);

  // Forget positions whose card changed (round refill / removal).
  const prevGridRef = useRef(state.grid);
  useEffect(() => {
    const prev = prevGridRef.current;
    for (let i = 0; i < state.grid.length; i++) {
      const p = prev[i]?.id ?? null;
      const c = state.grid[i]?.id ?? null;
      if (p !== c) brainRef.current = forget(brainRef.current, i);
    }
    prevGridRef.current = state.grid;
  }, [state.grid]);

  // ---- transient events + quips ----
  const [events, setEvents] = useState<TransientEvent[]>([]);
  const eventSeqRef = useRef(0);
  const emit = useCallback((kind: TransientEventKind, seat: number) => {
    eventSeqRef.current += 1;
    const ev: TransientEvent = {
      id: `solo:${eventSeqRef.current}:${kind}:${seat}`,
      kind,
      seat,
      at: Date.now(),
    };
    setEvents((prev) => [...prev, ev]);
    setTimeout(
      () => setEvents((prev) => prev.filter((e) => e.id !== ev.id)),
      EVENT_LIFETIME_MS,
    );
  }, []);

  const prevScoresRef = useRef(state.scores);
  const prevWrongRef = useRef(state.wrongBy.map((s) => s.size));
  useEffect(() => {
    const ps = prevScoresRef.current;
    const pw = prevWrongRef.current;
    const nw = state.wrongBy.map((s) => s.size);
    for (let i = 0; i < state.scores.length; i++) {
      if ((ps[i] ?? 0) < (state.scores[i] ?? 0)) {
        emit("GREAT_MATCH", i);
      }
      if ((pw[i] ?? 0) < (nw[i] ?? 0)) {
        emit("NOPE", i);
      }
    }
    prevScoresRef.current = state.scores.slice();
    prevWrongRef.current = nw;
  }, [state.scores, state.wrongBy, emit]);

  // ---- Felix's auto-roll ----
  useEffect(() => {
    if (state.phase !== "AWAITING_ROLL") return;
    if (state.roller !== FELIX_SEAT) return;
    if (state.rolling) return;
    const t = setTimeout(() => {
      commitAndRoll();
    }, FELIX_ROLL_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.phase, state.roller, state.rolling, commitAndRoll]);

  // ---- Felix's auto-flip ----
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (state.flipper !== FELIX_SEAT) return;
    if (state.inFlight) return;
    if (state.disconnected[FELIX_SEAT]) return;
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = setTimeout(() => {
      flipTimerRef.current = null;
      const s = stateRef.current;
      if (s.phase !== "FLIPPING" || s.flipper !== FELIX_SEAT || s.inFlight) return;
      const candidates = s.grid
        .map((c, i) => (c !== null && !s.wrongBy[FELIX_SEAT].has(i) ? i : -1))
        .filter((i) => i !== -1);
      const pick = pickFlipTarget(brainRef.current, candidates);
      if (pick === null) {
        dispatch({ type: "SKIP_TICK" });
        return;
      }
      const token = nextToken();
      dispatch({ type: "FLIP_START", by: FELIX_SEAT, idx: pick, token });
      setTimeout(() => dispatch({ type: "FLIP_COMPLETE", token }), REVEAL_MS);
    }, FELIX_FLIP_DELAY_MS);
    return () => {
      if (flipTimerRef.current) {
        clearTimeout(flipTimerRef.current);
        flipTimerRef.current = null;
      }
    };
  }, [
    state.phase,
    state.flipper,
    state.inFlight,
    state.disconnected,
    dispatch,
  ]);

  // ---- Felix's claim attempts ----
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.phase !== "FLIPPING") return;
    if (state.inFlight) return;
    if (state.claimBy !== null) return;
    if (state.disconnected[FELIX_SEAT]) return;
    const excluded = new Set<number>(state.wrongBy[FELIX_SEAT]);
    state.grid.forEach((c, i) => {
      if (c === null) excluded.add(i);
    });
    const best = findClaim(brainRef.current, state.rule, excluded);
    if (!best) return;
    if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    const delay = pickReactionDelay();
    claimTimerRef.current = setTimeout(() => {
      claimTimerRef.current = null;
      const s = stateRef.current;
      if (
        s.phase !== "FLIPPING" ||
        s.inFlight ||
        s.claimBy !== null ||
        s.grid[best.a] === null ||
        s.grid[best.b] === null ||
        s.wrongBy[FELIX_SEAT].has(best.a) ||
        s.wrongBy[FELIX_SEAT].has(best.b)
      ) {
        return;
      }
      const token = nextToken();
      dispatch({ type: "CLAIM_START", by: FELIX_SEAT, a: best.a, b: best.b, token });
      setTimeout(() => dispatch({ type: "CLAIM_RESOLVE", token }), 1600);
    }, delay);
    return () => {
      if (claimTimerRef.current) {
        clearTimeout(claimTimerRef.current);
        claimTimerRef.current = null;
      }
    };
  }, [
    state.peekingCard,
    state.phase,
    state.inFlight,
    state.claimBy,
    
    state.disconnected,
    state.wrongBy,
    state.rule,
    state.grid,
    dispatch,
  ]);

  // Cancel any pending Felix work on phase/round change.
  useEffect(() => {
    if (claimTimerRef.current) {
      clearTimeout(claimTimerRef.current);
      claimTimerRef.current = null;
    }
  }, [state.roundNum, state.phase]);

  // ---- intent handler for the player (seat 0) ----
  const onIntent = useCallback(
    (action: IntentAction) => {
      switch (action.type) {
        case "REQUEST_ROLL":
          commitAndRoll();
          return;
        case "CANCEL_CLAIM":
          dispatch({ type: "CANCEL_CLAIM", by: HUMAN_SEAT });
          return;
        case "PLAYER_ENTER_CLAIM":
          dispatch({ type: "PLAYER_ENTER_CLAIM", by: HUMAN_SEAT });
          return;
        case "PLAYER_SELECT_CARD":
          dispatch({ type: "PLAYER_SELECT_CARD", by: HUMAN_SEAT, idx: action.idx });
          return;
        case "PLAYER_RESOLVE_MATCH":
          dispatch({ type: "PLAYER_RESOLVE_MATCH", by: HUMAN_SEAT });
          return;
        case "FLIP_START":
          dispatch({
            type: "FLIP_START",
            by: HUMAN_SEAT,
            idx: action.idx,
            token: action.token,
          });
          setTimeout(
            () => dispatch({ type: "FLIP_COMPLETE", token: action.token }),
            REVEAL_MS,
          );
          return;
        case "NEW_GAME": {
          // Rematch: same seats, same grid size, scores back to zero.
          const cur = stateRef.current;
          brainRef.current = createBrain();
          dispatch({
            type: "INIT",
            slotCount: cur.slotCount,
            seatCount: cur.seatCount,
            names: cur.names,
          });
          return;
        }
        case "DEBUG_DRAIN_DECK":
          dispatch({ type: "DEBUG_DRAIN_DECK" });
          return;
        case "DEBUG_FORCE_END_GAME":
          dispatch({ type: "DEBUG_FORCE_END_GAME" });
          return;
      }
    },
    [dispatch, doRollDice, commitAndRoll],
  );

  const publicState = useMemo<PublicState>(
    () => toPublicState(state, SEAT_MAP, 0, "solo-game", [], []),
    [state],
  );

  return {
    publicState,
    onIntent,
    events,
    mySeat: 0,
    roomId: "solo",
    visitorId: "solo-you",
    gameId: "solo-game",
    rollCommit,
  };
}
