// ============================================================================
// useTableServer — one phone's link to its Together table on the table server
// (PartyKit plan, step 5).
//
// Every phone in a room lobby connects and checks in with its secret seat
// key, so when the host starts a server table nobody has to catch up. The
// host decides whether the table plays here or on the host's phone; this
// hook just keeps the link ready and reports what the server says.
//
// The server is the only source of truth: it owns rolls, flips, claims and
// timers, and sends one public state to everyone. Taps go up as intents.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { setServerOffset, serverNow } from "@/hooks/useServerClock";
import { noteClaimGrant, noteTableFlipAck, noteTableFlipState, noteTableFlipTap } from "@/lib/classicTiming";
import type { ClaimLockResult } from "@/lib/claimLock";
import type { ClaimRejectPayload, IntentAction, RollCommitPayload, TransientEvent } from "@/lib/multiplayer";
import {
  hydrateCards,
  offsetFromPong,
  tableSocketUrl,
  type TableIntent,
  type TableServerMessage,
  type TableSeat,
  type TableState,
} from "@/lib/tableServer";

export type TableLinkStatus = "connecting" | "connected" | "error";

export interface TableServerOptions {
  enabled: boolean;
  roomCode: string | null;
  roomId: string | null;
  /** Public id (room_members.pub_id): the socket's identity. */
  pid: string;
  /** This browser's id and the room's secret seat key: sent only to the server. */
  visitorId: string;
  playerKey: string;
  /** Test hook. */
  socketFactory?: (url: string) => WebSocket;
}

const EVENT_LIFETIME_MS = 1400;
const CLAIM_TIMEOUT_MS = 4000;
const PING_EVERY_MS = 20_000;
const FIRST_PINGS = 5;

/** Map a view tap to a server intent. Seat numbers are never sent: the server knows who you are. */
export function toTableIntent(a: IntentAction): TableIntent | null {
  switch (a.type) {
    case "REQUEST_ROLL":
    case "PLAYER_RESOLVE_MATCH":
    case "CANCEL_CLAIM":
    case "NEW_GAME":
      return { type: a.type };
    case "FLIP_START":
    case "PLAYER_SELECT_CARD":
      return { type: a.type, idx: a.idx };
    default:
      // PLAYER_ENTER_CLAIM goes through claim(); debug actions stay local.
      return null;
  }
}

export function useTableServer(opts: TableServerOptions) {
  const { enabled, roomCode, roomId, pid, visitorId, playerKey, socketFactory } = opts;
  const [status, setStatus] = useState<TableLinkStatus>("connecting");
  const [state, setState] = useState<TableState | null>(null);
  const [lobby, setLobby] = useState<{ seats: TableSeat[]; started: boolean; gameId: string | null } | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [rollCommit, setRollCommit] = useState<RollCommitPayload | null>(null);
  const [events, setEvents] = useState<TransientEvent[]>([]);
  const [lastClaimReject, setLastClaimReject] = useState<ClaimRejectPayload | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef<{ gameId: string; seq: number }>({ gameId: "", seq: -1 });
  const seenEventsRef = useRef(new Set<string>());
  const bestRttRef = useRef(Number.POSITIVE_INFINITY);
  const pingIdRef = useRef(0);
  const ackIdRef = useRef(0);
  const pendingClaims = useRef(new Map<string, (r: { accepted: boolean; reason?: string }) => void>());
  const stateRef = useRef<TableState | null>(null);
  stateRef.current = state;

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  useEffect(() => {
    if (!enabled || !roomCode || !roomId || !pid || !visitorId || !playerKey) return;
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const ping = () => {
      const id = ++pingIdRef.current;
      send({ t: "ping", id, sentAt: Date.now() });
    };
    const onVisibility = () => send({ t: "visibility", hidden: document.visibilityState === "hidden" });

    const handle = (msg: TableServerMessage) => {
      switch (msg.t) {
        case "hello":
          send({ t: "join", roomId, visitorId, playerKey });
          onVisibility();
          for (let i = 0; i < FIRST_PINGS; i++) timers.add(setTimeout(ping, i * 150));
          return;
        case "pong": {
          if (typeof msg.sentAt !== "number") return;
          const { offset, rtt } = offsetFromPong(msg.sentAt, Date.now(), msg.serverNow);
          // Keep the cleanest measurement; a slow ping says little about clocks.
          if (rtt <= bestRttRef.current) {
            bestRttRef.current = rtt;
            setServerOffset(offset);
          }
          return;
        }
        case "joined":
          setMySeat(msg.seat);
          return;
        case "lobby":
          setLobby({ seats: msg.seats, started: msg.started, gameId: msg.gameId });
          return;
        case "state": {
          const gid = msg.state.gameId ?? "";
          const last = seqRef.current;
          if (gid === last.gameId && msg.seq <= last.seq) return;
          seqRef.current = { gameId: gid, seq: msg.seq };
          if (gid !== last.gameId) setRollCommit(null);
          const seatEntry = msg.state.seatMap.find((e) => e.pid === pid);
          if (seatEntry) setMySeat(seatEntry.seat);
          noteTableFlipState(msg.state.peekingCard, msg.state.serverNow);
          setState(hydrateCards(msg.state));
          return;
        }
        case "roll_committed":
          setRollCommit(msg.payload);
          return;
        case "event": {
          const ev = msg.payload;
          if (seenEventsRef.current.has(ev.id)) return;
          seenEventsRef.current.add(ev.id);
          setEvents((prev) => [...prev, ev]);
          timers.add(setTimeout(() => setEvents((prev) => prev.filter((e) => e.id !== ev.id)), EVENT_LIFETIME_MS));
          return;
        }
        case "claim_grant":
          noteClaimGrant(msg.seat, msg.granted_at, serverNow());
          return;
        case "claim_reject":
          setLastClaimReject(msg.payload);
          return;
        case "ack": {
          if (msg.id.startsWith("f")) noteTableFlipAck(msg.recvAt, msg.accepted);
          const resolve = pendingClaims.current.get(msg.id);
          if (resolve) {
            pendingClaims.current.delete(msg.id);
            resolve({ accepted: msg.accepted, reason: msg.reason });
          }
          return;
        }
        case "error":
          setLastError(msg.reason);
          return;
      }
    };

    const open = () => {
      if (closed) return;
      setStatus("connecting");
      let ws: WebSocket;
      try {
        const url = tableSocketUrl(roomCode, pid);
        ws = socketFactory ? socketFactory(url) : new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      ws.addEventListener("open", () => {
        attempt = 0;
        setStatus("connected");
      });
      ws.addEventListener("message", (e) => {
        try {
          handle(JSON.parse(String(e.data)) as TableServerMessage);
        } catch {
          /* ignore a bad frame */
        }
      });
      ws.addEventListener("close", () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (closed) return;
        setStatus("error");
        scheduleRetry();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      });
    };

    const scheduleRetry = () => {
      if (closed) return;
      const delay = Math.min(500 * 2 ** attempt, 5000);
      attempt += 1;
      retryTimer = setTimeout(open, delay);
    };

    open();
    pingTimer = setInterval(ping, PING_EVERY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      timers.forEach((t) => clearTimeout(t));
      for (const resolve of pendingClaims.current.values()) resolve({ accepted: false, reason: "closed" });
      pendingClaims.current.clear();
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      setState(null);
      setLobby(null);
      setMySeat(null);
      setRollCommit(null);
      setEvents([]);
      seqRef.current = { gameId: "", seq: -1 };
      bestRttRef.current = Number.POSITIVE_INFINITY;
    };
  }, [enabled, roomCode, roomId, pid, visitorId, playerKey, socketFactory, send]);

  /** A tap on the board. Returns false when the link is down. */
  const sendIntent = useCallback(
    (a: IntentAction) => {
      const action = toTableIntent(a);
      if (!action) return false;
      if (action.type === "FLIP_START") {
        const id = `f${++ackIdRef.current}`;
        noteTableFlipTap(action.idx, serverNow());
        return send({ t: "intent", action, id });
      }
      return send({ t: "intent", action });
    },
    [send],
  );

  /**
   * WHOOP! WHOOP!: the first press to reach the server wins. Shaped like the
   * old referee's answer so the game view's optimistic claim works unchanged.
   */
  const claim = useCallback(
    (claimWindow: number): Promise<ClaimLockResult> => {
      const id = `c${++ackIdRef.current}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingClaims.current.delete(id);
          resolve({ outcome: "unknown", won: false, winner_seat: null, claim_window: claimWindow, error: "timeout" });
        }, CLAIM_TIMEOUT_MS);
        pendingClaims.current.set(id, ({ accepted, reason }) => {
          clearTimeout(timer);
          if (accepted) {
            resolve({ outcome: "won", won: true, winner_seat: null, claim_window: claimWindow });
          } else if (reason === "too_slow" || reason === "no_calls_left" || reason === "paused" || reason === "rolling") {
            resolve({
              outcome: "lost",
              won: false,
              winner_seat: stateRef.current?.claimBy ?? null,
              claim_window: claimWindow,
            });
          } else {
            resolve({ outcome: "unknown", won: false, winner_seat: null, claim_window: claimWindow, error: reason });
          }
        });
        if (!send({ t: "intent", action: { type: "CLAIM" }, id })) {
          clearTimeout(timer);
          pendingClaims.current.delete(id);
          resolve({ outcome: "unknown", won: false, winner_seat: null, claim_window: claimWindow, error: "offline" });
        }
      });
    },
    [send],
  );

  /** Host only: start a server game with the frozen lobby, host first. */
  const start = useCallback(
    (seats: TableSeat[]) => {
      setLastError(null);
      return send({ t: "start", seats: seats.map((e) => ({ pid: e.pid, name: e.display_name })) });
    },
    [send],
  );

  return {
    status,
    state,
    lobby,
    mySeat,
    rollCommit,
    events,
    lastClaimReject,
    lastError,
    started: lobby?.started === true || state !== null,
    sendIntent,
    claim,
    start,
  };
}
