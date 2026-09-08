// ============================================================================
// useMultiplayerGame — wraps useGameState for the host (who runs the reducer
// and broadcasts) or receives PublicState for the joiner (who only renders).
//
// KNOWN LIMITATION: a backgrounded host tab throttles setInterval/setTimeout.
// Dice roll animations and bot-style timers can stall until the tab is
// refocused. Not solved here — reconnect handling is prompt 11.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  useGameState,
  SETTLE_MATCH_MS,
  SETTLE_WRONG_MS,
  MAX_WRONG_CLAIMS_PER_ROUND,
  type Action,
} from "@/hooks/useGameState";

import { pickRoll, pickTumbleSeed, rngOf } from "@/lib/rolls";
import { toPublicState, type PublicState } from "@/lib/publicState";
import {
  ISOLATION_SPREAD_MS,
  PROTOCOL_VERSION,
  type ClaimGrantEnvelope,
  type ClaimRejectEnvelope,
  type ClaimRejectPayload,
  type Envelope,
  type EventEnvelope,
  type IntentAction,
  type IntentEnvelope,
  type IntentPayload,
  type RollAttribute,
  type RollCommitPayload,
  type RollCommittedEnvelope,
  type RollRejectEnvelope,
  type StateEnvelope,
  type TransientEvent,
  type TransientEventKind,
} from "@/lib/multiplayer";
import { serverNow } from "@/hooks/useServerClock";
import { warmClaimLock } from "@/lib/claimLock";

export interface SeatMapEntry {
  seat: number;
  visitor_id: string;
  display_name: string;
}

// Trailing throttle window for host broadcasts. Coalesces bursts (e.g. TUMBLE
// ticks during dice animation) into at most one message per interval, while
// always sending the LAST state of any burst so clients never desync.
const BROADCAST_THROTTLE_MS = 70;

// ---------- HOST ----------

export type BroadcastSubscribe = (listener: (msg: { payload: unknown }) => void) => () => void;

export function useMultiplayerHost(opts: {
  channel: RealtimeChannel | null;
  onBroadcast: BroadcastSubscribe;
  seatMap: SeatMapEntry[];
  hostVisitorId: string;
  enabled: boolean;
  gameId: string;
  roomId: string;
  disconnectedSeats: number[];
  awaySeats?: number[];
  gridSize?: "3x2" | "3x3";
  // A STRICTER disconnect set — visitors we've heard nothing from for a
  // much longer window than the per-turn skip threshold. Used ONLY for the
  // irreversible END_GAME_TABLE_EMPTY trigger. Defaults to the regular
  // disconnectedSeats if the caller doesn't supply it, so older wiring is
  // safe — but new code should always pass it.
  endGameDisconnectedSeats?: number[];
  // Host-side socket health from useRoomPresence. When the host's own
  // subscription is not "connected", the end-game guard MUST NOT fire — the
  // silence is our socket, not the table emptying.
  presenceStatus?: "connecting" | "connected" | "error";
  // Spread across watched last-seen heartbeat timestamps. A tight cluster
  // (below ISOLATION_SPREAD_MS) indicates simultaneous silence → host
  // self-isolation, not staggered departures.
  lastSeenSpreadMs?: number | null;
}) {
  const {
    channel, onBroadcast, seatMap, hostVisitorId, enabled, gameId, roomId,
    disconnectedSeats, awaySeats = [], gridSize = "3x3", endGameDisconnectedSeats,
    presenceStatus, lastSeenSpreadMs = null,
  } = opts;
  const effectiveEndGameDisconnected = endGameDisconnectedSeats ?? disconnectedSeats;
  const seatCount = Math.max(2, seatMap.length);
  const names = useMemo(() => (seatMap.length ? seatMap.map((e) => e.display_name) : ["Host", "Joiner"]), [seatMap]);
  const g = useGameState(gridSize, { seatCount, botSeats: [], names });

  // ---- settle scheduler ----
  // When the reducer enters SETTLING, hold the board for the length of the
  // feedback animation, then fire SETTLE_COMPLETE with the same token.
  // Scheduled with setTimeout exactly like FLIP_COMPLETE, and shares its
  // known limitation: a backgrounded tab throttles the timer.
  const gDispatch = g.dispatch;
  const settlePhase = g.state.phase;
  const settleKind = g.state.settleKind;
  const settleToken = g.state.settleToken;
  useEffect(() => {
    if (settlePhase !== "SETTLING" || settleKind === null) return;
    const ms = settleKind === "MATCH" ? SETTLE_MATCH_MS : SETTLE_WRONG_MS;
    const t = setTimeout(
      () => gDispatch({ type: "SETTLE_COMPLETE", token: settleToken }),
      ms,
    );
    return () => clearTimeout(t);
  }, [settlePhase, settleKind, settleToken, gDispatch]);



  const seqRef = useRef(0);
  const seatMapRef = useRef(seatMap);
  seatMapRef.current = seatMap;

  // ---- claim window tracking ----
  // Increments every time the claim state REOPENS: after a claim resolves
  // (claimBy transitions non-null → null) OR after a round ends (roundNum
  // increments). The claim-lock edge function's UNIQUE (room_id, claim_window)
  // constraint keys on this value.
  const claimWindowRef = useRef(0);
  const prevClaimByRef = useRef<number | null>(null);
  const prevRoundRef = useRef<number>(g.state.roundNum);
  if (g.state.roundNum !== prevRoundRef.current) {
    prevRoundRef.current = g.state.roundNum;
    claimWindowRef.current += 1;
  }
  if (prevClaimByRef.current !== null && g.state.claimBy === null) {
    claimWindowRef.current += 1;
  }
  prevClaimByRef.current = g.state.claimBy;

  // ---- trailing throttle for state broadcasts ----
  const latestStateRef = useRef(g.state);
  latestStateRef.current = g.state;
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAtRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  channelRef.current = channel;
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  // Reset claim window + grant dedupe whenever the game id changes so a new
  // game in the same room starts at claim_window 0 with an unused (room,game)
  // scope, and stale grants from prior games are ignored.
  const prevGameIdRef = useRef(gameId);
  if (prevGameIdRef.current !== gameId) {
    prevGameIdRef.current = gameId;
    claimWindowRef.current = 0;
  }

  // Boot the arbiter before anyone can press WHOOP! WHOOP!. One fire-and-
  // forget call per game, host only (this hook is host-only; solo never
  // reaches the arbiter). Game start never waits on it and a failure is
  // invisible to players — it only costs the first claimant a cold boot.
  useEffect(() => {
    if (!enabled) return;
    warmClaimLock();
  }, [enabled, gameId]);

  const awayRef = useRef<number[]>(awaySeats);
  awayRef.current = awaySeats;

  const doSend = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    seqRef.current += 1;
    const env: StateEnvelope = {
      v: PROTOCOL_VERSION,
      type: "state",
      seq: seqRef.current,
      payload: toPublicState(
        latestStateRef.current,
        seatMapRef.current,
        claimWindowRef.current,
        gameIdRef.current,
        disconnectedRef.current,
        awayRef.current,
      ),
    };
    lastSentAtRef.current = Date.now();
    ch.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
  }, []);

  // Track disconnected seats via a ref (used in doSend). SET_DISCONNECTED
  // uses REPLACE semantics on the reducer — the payload is the complete
  // current set, so reconnection is handled for free (a seat missing from
  // the array becomes connected again).
  const disconnectedRef = useRef<number[]>(disconnectedSeats);
  disconnectedRef.current = disconnectedSeats;
  const prevDisconnectedKey = useRef<string>("");
  useEffect(() => {
    if (!enabled) return;
    const key = disconnectedSeats.slice().sort((a, b) => a - b).join(",");
    if (key === prevDisconnectedKey.current) return;
    prevDisconnectedKey.current = key;
    g.dispatch({ type: "SET_DISCONNECTED", seats: disconnectedSeats });
  }, [enabled, disconnectedSeats, g.dispatch]);

  // Host end-game policy: fewer than 2 seats confirmed dead-quiet for the
  // long window → end the game. IRREVERSIBLE, so the signal is deliberately
  // stricter than SET_DISCONNECTED / turn-skip:
  //   - counts a seat ONLY if endGameDisconnectedSeats includes it (no
  //     heartbeat for the long window, hidden-agnostic — a hidden client
  //     that is still pinging is NOT counted);
  //   - never counts an AWAY seat (proof-of-life is still arriving).
  // A lone remaining player staring at a live board is worse than a clean
  // ending, but a false positive is worse still — hence the guard.
  const endedForEmptyRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const total = seatMap.length;
    if (total < 2) return;
    // Refuse to fire when the host's own socket is unhealthy. Silence from
    // every seat at once is our connection, not the table.
    if (presenceStatus !== undefined && presenceStatus !== "connected") return;
    // Refuse to fire when watched last-seen timestamps cluster tightly —
    // simultaneous silence is host self-isolation, not staggered departures.
    if (lastSeenSpreadMs !== null && lastSeenSpreadMs < ISOLATION_SPREAD_MS) return;
    const away = new Set(awaySeats);
    const deadQuiet = effectiveEndGameDisconnected.filter((s) => !away.has(s));
    const connected = total - deadQuiet.length;
    if (connected < 2 && !endedForEmptyRef.current && g.state.phase !== "GAME_OVER") {
      endedForEmptyRef.current = true;
      g.dispatch({ type: "END_GAME_TABLE_EMPTY" });
    }
  }, [enabled, seatMap.length, effectiveEndGameDisconnected, awaySeats, g.state.phase, g.dispatch, presenceStatus, lastSeenSpreadMs]);

  useEffect(() => {
    if (!enabled || !channel) return;
    const now = Date.now();
    const elapsed = now - lastSentAtRef.current;
    if (elapsed >= BROADCAST_THROTTLE_MS) {
      // Leading edge is fine as long as we STILL schedule a trailing send
      // if any later state change lands inside the window. The pattern
      // below guarantees the final state of a burst is always emitted:
      // we always (re)arm a trailing timer, and cancel it after doSend.
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      doSend();
      return;
    }
    // Inside the throttle window — arm/refresh a trailing send so the LAST
    // state of the burst always ships.
    if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      doSend();
    }, BROADCAST_THROTTLE_MS - elapsed);
    return () => {
      // No teardown on state change; only clear on unmount below.
    };
  }, [enabled, channel, g.state, doSend, awaySeats, disconnectedSeats]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  // ---- server-authoritative roll commit ----
  // The host decides the die outcome and BROADCASTS it before any client
  // (including itself) animates. The reducer's `rolling` flag is the ROLLING
  // phase gate: while true, flip/claim/select intents are explicitly rejected
  // rather than silently no-oped by reducer guards.
  // Latest committed roll — mirrored locally so the host UI drives the same
  // hero animation joiners get from the wire. Cleared per-game so a stale
  // commit from a previous game never re-triggers.
  const [rollCommit, setRollCommit] = useState<RollCommitPayload | null>(null);
  useEffect(() => { setRollCommit(null); }, [gameId]);

  const rollAttrs: readonly RollAttribute[] = ["SHAPE", "NUMBER", "COLOR"] as const;
  const commitAndRoll = useCallback(() => {
    const s = latestStateRef.current;
    if (s.phase !== "AWAITING_ROLL" || s.rolling) return;
    const { attribute, faceIndex } = pickRoll(rollAttrs, rngOf(s));
    const tumbleSeed = pickTumbleSeed();
    // startAt is a SERVER-clock timestamp so every client can time the
    // animation against serverNow(), not against message arrival latency.
    const startAt = serverNow() + 150;
    const payload: RollCommitPayload = {
      roundId: `${gameIdRef.current}:${s.roundNum}`,
      attribute,
      faceIndex,
      tumbleSeed,
      startAt,
    };
    console.log("[roll:committed]", payload);
    seqRef.current += 1;
    const env: RollCommittedEnvelope = {
      v: PROTOCOL_VERSION,
      type: "roll_committed",
      seq: seqRef.current,
      payload,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
    // Host doesn't receive its own broadcast — set locally so the host UI's
    // overlay triggers on the same commit joiners animate from the wire.
    setRollCommit(payload);
    // Drive the reducer animation off local wall clock; serverNow() offset
    // is applied when scheduling so the ROLL_SETTLE lands at startAt + 1100.
    const delay = Math.max(0, startAt - serverNow());
    setTimeout(() => {
      // Reducer transitions to FLIPPING on settle, matching startAt+1100ms.
      void g.doRollDice([attribute]);
    }, delay);
  }, [g.doRollDice]);

  // Explicit rejection for actions arriving during the ROLLING window.
  const rejectDuringRoll = useCallback((seat: number, actionType: string) => {
    const s = latestStateRef.current;
    const payload = {
      roundId: `${gameIdRef.current}:${s.roundNum}`,
      seat,
      action: actionType,
      reason: "ROLLING" as const,
    };
    console.warn("[roll:reject]", payload);
    seqRef.current += 1;
    const env: RollRejectEnvelope = {
      v: PROTOCOL_VERSION,
      type: "roll_reject",
      seq: seqRef.current,
      payload,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
  }, []);

  // Receive intents and inject as reducer actions.
  useEffect(() => {
    if (!enabled || !channel) return;
    const handler = (msg: { payload: unknown }) => {
      const env = msg.payload as Envelope;
      if (!env || env.v !== PROTOCOL_VERSION) return;
      if (env.type === "intent") {
        const intent: IntentPayload = env.payload;
        const seatEntry = seatMapRef.current.find((e) => e.seat === intent.seat);
        if (!seatEntry) return;
        if (seatEntry.visitor_id !== intent.visitor_id) return;
        if (seatEntry.visitor_id === hostVisitorId) return;
        // ROLLING gate: reject board-affecting intents while a roll is
        // resolving. Reducer would drop these anyway; we surface the reason
        // so callers see an explicit rejection.
        const rolling = latestStateRef.current.rolling;
        const boardAction =
          intent.action.type === "FLIP_START" ||
          intent.action.type === "PLAYER_SELECT_CARD" ||
          intent.action.type === "PLAYER_RESOLVE_MATCH";
        if (rolling && boardAction) {
          rejectDuringRoll(intent.seat, intent.action.type);
          return;
        }
        handleHostIntent(g.dispatch, commitAndRoll, intent.seat, intent.action);
      }
    };
    return onBroadcast(handler);
  }, [enabled, channel, onBroadcast, g.dispatch, commitAndRoll, rejectDuringRoll, hostVisitorId]);

  // Listen for authoritative claim grants from the arbiter edge function.
  // The host is the ONLY dispatcher of PLAYER_ENTER_CLAIM — even the host's
  // own WHOOP goes through the arbiter, then arrives here as a grant.
  //
  // claim_window guard: honoring a grant for a window ≠ current would apply
  // a claim to a window that already resolved (round advanced or another
  // claim resolved), corrupting state. So mismatches are ALWAYS rejected —
  // but loudly: logged with both windows + seat + phase, and broadcast as
  // `claim_reject` so the pressing player sees the CONNECTION ISSUE banner
  // instead of a silently stuck "won-but-nothing-happens" state.
  const grantedRef = useRef<Set<string>>(new Set());
  const [lastClaimReject, setLastClaimReject] = useState<ClaimRejectPayload | null>(null);
  useEffect(() => { setLastClaimReject(null); }, [gameId]);

  // Broadcast a rejection AND surface it locally. Every refusal path must go
  // through this — a joiner that never hears about a refused grant hangs until
  // its abandon timer and mislabels the hang as a connection failure.
  const emitClaimReject = useCallback((payload: ClaimRejectPayload) => {
    seqRef.current += 1;
    const env: ClaimRejectEnvelope = {
      v: PROTOCOL_VERSION,
      type: "claim_reject",
      seq: seqRef.current,
      payload,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
    // Host doesn't receive its own broadcasts.
    setLastClaimReject(payload);
  }, []);

  // Delete the arbiter row for a window we are NOT honouring. Invariant: a
  // claim that does not resolve must never leave a claim_locks row behind, or
  // that window is consumed forever and nobody can claim in it again.
  const releaseClaimLock = useCallback(
    (claim_window: number, seat: number, visitor_id: string, reason: string) => {
      if (!roomId) return;
      void (async () => {
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.functions.invoke("release-lock", {
            body: {
              room_id: roomId,
              game_id: gameIdRef.current,
              claim_window,
              seat,
              visitor_id,
              reason,
            },
          });
        } catch (e) {
          console.error("[release-lock] invoke failed", e);
        }
      })();
    },
    [roomId],
  );

  // ---- deferred grants ----
  // A grant can legitimately arrive while the board is momentarily NOT in a
  // claimable phase — most often because the claimant's OWN flip resolved
  // between their press and the grant's arrival (SETTLING, or a roll about to
  // start). Refusing those was the bug: the claim is valid, it just landed a
  // few hundred milliseconds early. So we HOLD it for a bounded time and apply
  // it the moment the phase becomes claimable again, as long as the claim
  // window has not moved on.
  const DEFER_MS = 2600;
  const deferredRef = useRef<
    | { claim_window: number; seat: number; visitor_id: string; key: string; timer: ReturnType<typeof setTimeout> }
    | null
  >(null);
  const clearDeferred = useCallback(() => {
    if (deferredRef.current) clearTimeout(deferredRef.current.timer);
    deferredRef.current = null;
  }, []);
  useEffect(() => clearDeferred, [clearDeferred]);
  useEffect(() => { clearDeferred(); }, [gameId, clearDeferred]);

  // Refuse a grant for good: mark it consumed, release its row, tell the seat.
  const refuseGrant = useCallback(
    (
      grant: { claim_window: number; seat: number; visitor_id: string },
      key: string,
      hostWindow: number,
      reason: ClaimRejectPayload["reason"],
    ) => {
      grantedRef.current.add(key);
      emitClaimReject({
        grant_claim_window: grant.claim_window,
        host_claim_window: hostWindow,
        seat: grant.seat,
        visitor_id: grant.visitor_id,
        reason,
      });
      releaseClaimLock(grant.claim_window, grant.seat, grant.visitor_id, reason);
    },
    [emitClaimReject, releaseClaimLock],
  );

  const claimablePhase = (phase: string) => phase === "FLIPPING" || phase === "CLAIM_WINDOW";

  // Try to settle whatever is deferred against the CURRENT state.
  const pumpDeferred = useCallback(
    (expired: boolean) => {
      const d = deferredRef.current;
      if (!d) return;
      const s = latestStateRef.current;
      const hostWindow = claimWindowRef.current;
      if (d.claim_window !== hostWindow) {
        clearDeferred();
        refuseGrant(d, d.key, hostWindow, d.claim_window < hostWindow ? "STALE_WINDOW" : "FUTURE_WINDOW");
        return;
      }
      if ((s.missesThisRound[d.seat] ?? 0) >= MAX_WRONG_CLAIMS_PER_ROUND) {
        clearDeferred();
        refuseGrant(d, d.key, hostWindow, "NO_CALLS_LEFT");
        return;
      }
      if (claimablePhase(s.phase) && s.claimBy === null && !s.rolling) {
        clearDeferred();
        grantedRef.current.add(d.key);
        g.dispatch({ type: "PLAYER_ENTER_CLAIM", by: d.seat });
        return;
      }
      if (expired) {
        console.warn("[claim_grant:deferred-expired]", { ...d, phase: s.phase, claimBy: s.claimBy });
        clearDeferred();
        refuseGrant(d, d.key, hostWindow, "STALE_WINDOW");
      }
    },
    [clearDeferred, refuseGrant, g.dispatch],
  );

  // Any state change may make a deferred grant applicable.
  useEffect(() => {
    if (deferredRef.current) pumpDeferred(false);
  }, [g.state.phase, g.state.claimBy, g.state.rolling, pumpDeferred]);

  useEffect(() => {
    if (!enabled || !channel) return;
    const handler = (msg: { payload: unknown }) => {
      const env = msg.payload as Envelope;
      if (!env || env.v !== PROTOCOL_VERSION || env.type !== "claim_grant") return;
      const grant = (env as ClaimGrantEnvelope).payload;
      const hostWindow = claimWindowRef.current;
      const dedupeKey = `${grant.claim_window}:${grant.seat}`;
      if (grantedRef.current.has(dedupeKey)) return;
      if (deferredRef.current?.key === dedupeKey) return;

      if (grant.claim_window !== hostWindow) {
        const reason: ClaimRejectPayload["reason"] =
          grant.claim_window < hostWindow ? "STALE_WINDOW" : "FUTURE_WINDOW";
        console.warn("[claim_grant:drop]", {
          reason,
          grant_claim_window: grant.claim_window,
          host_claim_window: hostWindow,
          seat: grant.seat,
          visitor_id: grant.visitor_id,
          phase: latestStateRef.current.phase,
          claimBy: latestStateRef.current.claimBy,
        });
        refuseGrant(grant, dedupeKey, hostWindow, reason);
        return;
      }

      const s = latestStateRef.current;
      // v7.2: a seat that has spent both of its wrong calls this round cannot
      // claim through ANY path. Refuse and release the arbiter row so the
      // window is not consumed for everyone else.
      if ((s.missesThisRound[grant.seat] ?? 0) >= MAX_WRONG_CLAIMS_PER_ROUND) {
        console.warn("[claim_grant:no-calls-left]", { seat: grant.seat, round: s.roundNum });
        refuseGrant(grant, dedupeKey, hostWindow, "NO_CALLS_LEFT");
        return;
      }
      if (claimablePhase(s.phase) && s.claimBy === null && !s.rolling) {
        grantedRef.current.add(dedupeKey);
        // PLAYER_ENTER_CLAIM cancels any flip in flight for us: it clears
        // inFlight and peekingCard, leaves flipsThisTurn untouched, and the
        // orphaned FLIP_COMPLETE timer no-ops on its token guard.
        g.dispatch({ type: "PLAYER_ENTER_CLAIM", by: grant.seat });
        return;
      }

      // Valid window, momentarily unclaimable board — hold it.
      console.warn("[claim_grant:deferred]", {
        claim_window: grant.claim_window,
        seat: grant.seat,
        phase: s.phase,
        claimBy: s.claimBy,
        rolling: s.rolling,
      });
      clearDeferred();
      deferredRef.current = {
        claim_window: grant.claim_window,
        seat: grant.seat,
        visitor_id: grant.visitor_id,
        key: dedupeKey,
        timer: setTimeout(() => pumpDeferred(true), DEFER_MS),
      };
    };
    return onBroadcast(handler);
  }, [enabled, channel, onBroadcast, g.dispatch, commitAndRoll, refuseGrant, clearDeferred, pumpDeferred]);

  // ---- transient event emission ----
  // The host observes reducer transitions and emits transient events on the
  // wire. GREAT_MATCH fires on the tick a successful claim resolves;
  // NOPE fires on the tick a wrong claim resolves. Events carry a unique id
  // so receivers can dedupe (an event applied twice must not animate twice).
  const eventSeqRef = useRef(0);
  const prevScoresRef = useRef<number[]>(g.state.scores);
  const prevWrongCountRef = useRef<number[]>(g.state.wrongBy.map((s) => s.size));
  useEffect(() => {
    if (!enabled || !channel) return;
    const prevScores = prevScoresRef.current;
    const prevWrong = prevWrongCountRef.current;
    const nextWrong = g.state.wrongBy.map((s) => s.size);
    const send = (kind: TransientEventKind, seat: number) => {
      eventSeqRef.current += 1;
      const ev: TransientEvent = {
        id: `${gameIdRef.current}:${eventSeqRef.current}:${kind}:${seat}`,
        kind, seat, at: Date.now(),
      };
      const env: EventEnvelope = { v: PROTOCOL_VERSION, type: "event", seq: eventSeqRef.current, payload: ev };
      channel.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
    };
    for (let i = 0; i < g.state.scores.length; i++) {
      if ((prevScores[i] ?? 0) < (g.state.scores[i] ?? 0)) send("GREAT_MATCH", i);
      if ((prevWrong[i] ?? 0) < (nextWrong[i] ?? 0)) send("NOPE", i);
    }
    prevScoresRef.current = g.state.scores.slice();
    prevWrongCountRef.current = nextWrong;
  }, [enabled, channel, g.state.scores, g.state.wrongBy]);

  return { ...g, rollCommit, commitAndRoll, lastClaimReject };
}

// Intent → local reducer dispatch. Reducer's phase/seat guards are the final
// authority; illegal intents (wrong turn, wrong phase, etc.) return the
// unchanged state and are a no-op — not a crash.
//
// NOTE: PLAYER_ENTER_CLAIM* is NOT handled here anymore — WHOOP goes through
// the claim-lock arbiter, which triggers PLAYER_ENTER_CLAIM via a server-side
// broadcast handled by the grant listener above.
function handleHostIntent(
  dispatch: (a: Action) => void,
  commitAndRoll: () => void,
  seat: number,
  action: IntentAction,
) {
  switch (action.type) {
    case "REQUEST_ROLL":
      commitAndRoll();
      return;
    case "PLAYER_ENTER_CLAIM":
      // Ignored — the arbiter is the only path into claim mode.
      return;
    case "CANCEL_CLAIM":
      dispatch({ type: "CANCEL_CLAIM", by: seat });
      return;
    case "PLAYER_SELECT_CARD":
      dispatch({ type: "PLAYER_SELECT_CARD", by: seat, idx: action.idx });
      return;
    case "PLAYER_RESOLVE_MATCH":
      dispatch({ type: "PLAYER_RESOLVE_MATCH", by: seat });
      return;
    case "FLIP_START":
      dispatch({ type: "FLIP_START", by: seat, idx: action.idx, token: action.token });
      setTimeout(() => dispatch({ type: "FLIP_COMPLETE", token: action.token }), 2000);
      return;
    case "NEW_GAME":
      // Rematch is host-only; joiner requests are ignored.
      return;
    case "DEBUG_DRAIN_DECK":
    case "DEBUG_FORCE_END_GAME":
      // Debug controls are host-local only. A joiner-sent debug intent is
      // ignored so a remote seat can never mutate the host's deck or grid.
      return;
  }
}

// Shared: subscribes to transient events on the channel, deduped by id.
// Older events fall out after LIFETIME_MS so a stuck event never persists.
const EVENT_LIFETIME_MS = 1400;
function useTransientEvents(
  channel: RealtimeChannel | null,
  onBroadcast: BroadcastSubscribe,
  enabled: boolean,
): TransientEvent[] {
  const [events, setEvents] = useState<TransientEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled || !channel) return;
    const handler = (msg: { payload: unknown }) => {
      const env = msg.payload as Envelope;
      if (!env || env.v !== PROTOCOL_VERSION || env.type !== "event") return;
      const ev = (env as EventEnvelope).payload;
      if (seenRef.current.has(ev.id)) return;
      seenRef.current.add(ev.id);
      setEvents((prev) => [...prev, ev]);
      setTimeout(() => {
        setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      }, EVENT_LIFETIME_MS);
    };
    return onBroadcast(handler);
  }, [channel, onBroadcast, enabled]);
  return events;
}

// ---------- JOINER ----------

export function useMultiplayerJoiner(opts: {
  channel: RealtimeChannel | null;
  onBroadcast: BroadcastSubscribe;
  mySeat: number | null;
  visitorId: string;
  enabled: boolean;
}) {
  const { channel, onBroadcast, mySeat: mySeatProp, visitorId, enabled } = opts;
  const [publicState, setPublicState] = useState<PublicState | null>(null);
  const [rollCommit, setRollCommit] = useState<RollCommitPayload | null>(null);
  const [lastClaimReject, setLastClaimReject] = useState<ClaimRejectPayload | null>(null);
  const lastSeqRef = useRef(0);
  const seqRef = useRef(0);
  const events = useTransientEvents(channel, onBroadcast, enabled);

  useEffect(() => {
    if (!enabled || !channel) return;
    const handler = (msg: { payload: unknown }) => {
      const env = msg.payload as Envelope;
      if (!env || env.v !== PROTOCOL_VERSION) return;
      if (env.type === "state") {
        if (env.seq <= lastSeqRef.current) return;
        lastSeqRef.current = env.seq;
        setPublicState(env.payload);
      } else if (env.type === "roll_committed") {
        // Latest commit wins — game only ever has one pending roll.
        setRollCommit(env.payload);
      } else if (env.type === "claim_reject") {
        // Host dropped a claim grant due to a claim_window mismatch.
        // Surface locally; MultiplayerGameView filters by seat===mySeat.
        setLastClaimReject((env as ClaimRejectEnvelope).payload);
      }
    };
    return onBroadcast(handler);
  }, [enabled, channel, onBroadcast]);

  // Resolve seat from prop first, then fall back to publicState's seatMap.
  // Guests initially mount with mySeatProp=null; the seat is discovered from
  // the first state broadcast that includes their visitor_id.
  const mySeat =
    mySeatProp ??
    publicState?.seatMap.find((e) => e.visitor_id === visitorId)?.seat ??
    null;

  const sendIntent = useCallback(
    (action: IntentAction) => {
      if (!channel || mySeat === null) return;
      seqRef.current += 1;
      const env: IntentEnvelope = {
        v: PROTOCOL_VERSION,
        type: "intent",
        seq: seqRef.current,
        payload: { seat: mySeat, visitor_id: visitorId, action },
      };
      channel.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
    },
    [channel, mySeat, visitorId],
  );

  // Called when the host announces a new game: clears the finished game's
  // payload so the joiner never renders stale results in a fresh game.
  const reset = useCallback(() => {
    setPublicState(null);
    setRollCommit(null);
    setLastClaimReject(null);
  }, []);

  return { publicState, sendIntent, events, mySeat, rollCommit, lastClaimReject, reset };

}


export { useTransientEvents };
