// ============================================================================
// useHeartbeat — application-level liveness, independent of Supabase presence.
//
// Rationale: Supabase presence 'leave' events cannot be relied on. A crashed
// or backgrounded client never untracks, and server-side reap of a dead
// socket has been observed to take well over a minute — long enough for the
// flip rotation to hard-lock on the ghost seat.
//
// Every mounted room client broadcasts a heartbeat every HEARTBEAT_INTERVAL_MS
// on the shared channel. Each heartbeat carries a `hidden` flag sourced from
// document.hidden — flipped explicitly on visibilitychange with an immediate
// broadcast so the host does not have to wait for the next interval (which,
// on hidden tabs, browsers throttle to ~1/minute). The host consumes these
// to build TWO sets:
//   - stale  → visitors past HEARTBEAT_STALE_MS with no recent visible ping
//              AND past HEARTBEAT_HIDDEN_STALE_MS if they last reported hidden.
//              This is the GONE set.
//   - away   → visitors currently reporting hidden but still within the
//              hidden-stale window. AWAY, not GONE.
//
// The host merges stale with the presence-based disconnected set; either
// signal is sufficient to mark a seat disconnected. SET_DISCONNECTED uses
// REPLACE semantics on the reducer, so resuming heartbeats automatically
// un-marks a seat — no explicit reconnect action required. AWAY is a UI-only
// signal; it does not feed the reducer, so the flip rotation does not skip
// a merely-backgrounded seat and the "fewer than 2 connected" end-game
// backstop does not fire on transient hides.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AWAY_SKIP_MS,
  HEARTBEAT_END_GAME_STALE_MS,
  HEARTBEAT_HIDDEN_STALE_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_STALE_MS,
  PROTOCOL_VERSION,
  type Envelope,
  type HeartbeatEnvelope,
} from "@/lib/multiplayer";
import { hostWasAway } from "@/lib/classicResponsiveness";
import type { BroadcastSubscribe } from "@/hooks/useMultiplayerGame";

// EVERY client (host and joiner) calls this. Sends heartbeats on a fixed
// cadence for the lifetime of the channel. Cheap: one broadcast every 5s.
// Additionally sends immediately on visibilitychange so hide→show and
// show→hide transitions do not have to wait for the throttled interval on
// hidden tabs.
export function useHeartbeatSender(
  channel: RealtimeChannel | null,
  visitorId: string,
  enabled: boolean,
): void {
  const seqRef = useRef(0);
  useEffect(() => {
    if (!enabled || !channel) return;
    const send = () => {
      seqRef.current += 1;
      const env: HeartbeatEnvelope = {
        v: PROTOCOL_VERSION,
        type: "heartbeat",
        seq: seqRef.current,
        payload: {
          pid: visitorId,
          at: Date.now(),
          hidden: typeof document !== "undefined" ? document.hidden : false,
        },
      };
      channel.send({ type: "broadcast", event: "msg", payload: env }).catch(() => {});
    };
    // Send immediately on wire-up so the host doesn't need to wait a full
    // interval to see us. Then on the fixed cadence.
    send();
    const id = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
    // visibilitychange fires reliably on both hide and show, including on
    // mobile Safari (unlike pagehide/beforeunload for the hide case). Send
    // immediately on either edge — the show-edge send is the critical one:
    // it un-marks an AWAY chip the moment the tab returns without waiting
    // for the throttled interval to catch up.
    const onVis = () => send();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [channel, visitorId, enabled]);
}

export interface HeartbeatMonitorResult {
  staleVisitors: string[];
  awayVisitors: string[];
  // Subset of awayVisitors whose FIRST hidden heartbeat arrived more than
  // AWAY_SKIP_MS ago. These have dwelt in the hidden state long enough that
  // it is safe to feed them into the turn-skip path — a momentary hide→show
  // will not have flipped a turn. awayVisitors (chip label) is unchanged.
  awaySkipVisitors: string[];
  // Visitors whose LAST heartbeat (any state, hidden or visible) arrived more
  // than HEARTBEAT_END_GAME_STALE_MS ago, OR who were never heard from past
  // the same grace window. This is the stricter "table empty" signal — a
  // hidden-but-still-pinging client is NOT in this set. Used ONLY by the
  // irreversible end-game guard, never by SET_DISCONNECTED or turn skipping.
  endGameVisitors: string[];
  // max(lastSeen) − min(lastSeen) across watched non-host visitors. null if
  // any watched visitor has not yet produced a heartbeat (spread is undefined
  // in that case). Consumers gate the irreversible end-game dispatch on a
  // large-enough spread — a tightly-clustered silence is host self-isolation.
  lastSeenSpreadMs: number | null;
}

// HOST-ONLY. Watches inbound heartbeats and derives:
//   - staleVisitors: visitor_ids past their applicable stale threshold
//     (HEARTBEAT_STALE_MS if last seen visible, HEARTBEAT_HIDDEN_STALE_MS if
//     last seen hidden). Feeds SET_DISCONNECTED → GONE.
//   - awayVisitors: visitor_ids that last reported hidden and are within the
//     hidden-stale window. UI-only → AWAY.
//
// Only visitor_ids in `watchedVisitorIds` are tracked — that's the frozen
// seatMap post-start. The host is treated as always-live and never appears
// in either set.
export function useHeartbeatMonitor(opts: {
  channel: RealtimeChannel | null;
  onBroadcast: BroadcastSubscribe;
  enabled: boolean;
  watchedVisitorIds: string[];
  hostVisitorId: string;
}): HeartbeatMonitorResult {
  const { channel, onBroadcast, enabled, watchedVisitorIds, hostVisitorId } = opts;
  const [staleVisitors, setStaleVisitors] = useState<string[]>([]);
  const [awayVisitors, setAwayVisitors] = useState<string[]>([]);
  const [awaySkipVisitors, setAwaySkipVisitors] = useState<string[]>([]);
  const [endGameVisitors, setEndGameVisitors] = useState<string[]>([]);
  const [lastSeenSpreadMs, setLastSeenSpreadMs] = useState<number | null>(null);

  // Last local receive time + last-known hidden flag, per visitor. Also the
  // local time at which the current hidden run BEGAN — used to gate the
  // turn-skip dwell so a momentary hide→show never steals a turn.
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const hiddenRef = useRef<Map<string, boolean>>(new Map());
  const hiddenSinceRef = useRef<Map<string, number>>(new Map());
  const monitorStartRef = useRef<number>(Date.now());
  const watchedRef = useRef<string[]>(watchedVisitorIds);
  watchedRef.current = watchedVisitorIds;
  const hostRef = useRef<string>(hostVisitorId);
  hostRef.current = hostVisitorId;

  // Reset the mount reference when monitoring (re)enables so grace period
  // is measured from THIS enable, not from the component's original mount.
  useEffect(() => {
    if (!enabled) return;
    monitorStartRef.current = Date.now();
    lastSeenRef.current = new Map();
    lastAtRef.current = new Map();
    hiddenRef.current = new Map();
    hiddenSinceRef.current = new Map();
    setStaleVisitors([]);
    setAwayVisitors([]);
    setAwaySkipVisitors([]);
    setEndGameVisitors([]);
    setLastSeenSpreadMs(null);
  }, [enabled]);

  // Ingest heartbeats. Uses LOCAL receive time — sender clocks are untrusted.
  useEffect(() => {
    if (!enabled || !channel) return;
    const handler = (msg: { payload: unknown }) => {
      const env = msg.payload as Envelope;
      if (!env || env.v !== PROTOCOL_VERSION || env.type !== "heartbeat") return;
      const hb = (env as HeartbeatEnvelope).payload;
      if (!hb?.pid) return;
      // Replay guard: a sender's heartbeat time only ever moves forward.
      const at = typeof hb.at === "number" ? hb.at : 0;
      if (at <= (lastAtRef.current.get(hb.pid) ?? -Infinity)) return;
      lastAtRef.current.set(hb.pid, at);
      const now = Date.now();
      lastSeenRef.current.set(hb.pid, now);
      const isHidden = !!hb.hidden;
      hiddenRef.current.set(hb.pid, isHidden);
      // Track when the CURRENT hidden run began. First hidden heartbeat
      // starts the clock; a visible heartbeat clears it. Subsequent hidden
      // heartbeats leave the existing start-time intact.
      if (isHidden) {
        if (!hiddenSinceRef.current.has(hb.pid)) {
          hiddenSinceRef.current.set(hb.pid, now);
        }
      } else {
        hiddenSinceRef.current.delete(hb.pid);
      }
    };
    return onBroadcast(handler);
  }, [enabled, channel, onBroadcast]);

  // Recompute sets on a poll. Cheap — bounded by seat count (≤ 6).
  useEffect(() => {
    if (!enabled) return;
    let lastTick = Date.now();
    // The HOST was the one away (tab slept): every joiner's age is
    // meaningless. Liveness becomes unknown and the normal grace window is
    // measured from the moment the host returned — nobody who stayed at the
    // table is skipped because the host could not hear them.
    const resetLiveness = (now: number) => {
      monitorStartRef.current = now;
      lastSeenRef.current = new Map();
      hiddenRef.current = new Map();
      hiddenSinceRef.current = new Map();
    };
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenAt === null) hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null) {
        hiddenAt = null;
        resetLiveness(Date.now());
        tick();
      }
    };
    const tick = () => {
      const now = Date.now();
      if (hostWasAway(lastTick, now, 2000)) resetLiveness(now);
      lastTick = now;
      const started = monitorStartRef.current;
      const graceExpired = now - started > HEARTBEAT_STALE_MS;
      const endGameGraceExpired = now - started > HEARTBEAT_END_GAME_STALE_MS;
      const stale: string[] = [];
      const away: string[] = [];
      const awaySkip: string[] = [];
      const endGame: string[] = [];
      for (const vid of watchedRef.current) {
        if (vid === hostRef.current) continue; // host is authoritative
        const last = lastSeenRef.current.get(vid);
        const hidden = hiddenRef.current.get(vid) === true;
        if (last == null) {
          if (graceExpired) stale.push(vid);
          if (endGameGraceExpired) endGame.push(vid);
          continue;
        }
        const age = now - last;
        const threshold = hidden ? HEARTBEAT_HIDDEN_STALE_MS : HEARTBEAT_STALE_MS;
        if (age > threshold) {
          stale.push(vid);
        } else if (hidden) {
          away.push(vid);
          const hiddenSince = hiddenSinceRef.current.get(vid);
          if (hiddenSince != null && now - hiddenSince > AWAY_SKIP_MS) {
            awaySkip.push(vid);
          }
        }
        if (age > HEARTBEAT_END_GAME_STALE_MS) endGame.push(vid);
      }
      // Spread across watched non-host visitors' last-seen times. Null if any
      // watched visitor has not produced a heartbeat yet, and null if fewer
      // than two watched non-host visitors have a lastSeen entry — spread
      // across a single seat carries no isolation signal.
      let spread: number | null = null;
      let minSeen = Infinity;
      let maxSeen = -Infinity;
      let seenCount = 0;
      let missing = false;
      for (const vid of watchedRef.current) {
        if (vid === hostRef.current) continue;
        const last = lastSeenRef.current.get(vid);
        if (last == null) { missing = true; break; }
        seenCount++;
        if (last < minSeen) minSeen = last;
        if (last > maxSeen) maxSeen = last;
      }
      if (!missing && seenCount >= 2 && maxSeen >= minSeen) {
        spread = maxSeen - minSeen;
      }
      const same = (prev: string[], next: string[]) =>
        prev.length === next.length && prev.every((v, i) => v === next[i]);
      setStaleVisitors((prev) => (same(prev, stale) ? prev : stale));
      setAwayVisitors((prev) => (same(prev, away) ? prev : away));
      setAwaySkipVisitors((prev) => (same(prev, awaySkip) ? prev : awaySkip));
      setEndGameVisitors((prev) => (same(prev, endGame) ? prev : endGame));
      setLastSeenSpreadMs((prev) => (prev === spread ? prev : spread));
    };
    tick();
    const id = window.setInterval(tick, 2000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
    };
  }, [enabled]);

  return { staleVisitors, awayVisitors, awaySkipVisitors, endGameVisitors, lastSeenSpreadMs };
}

// Host-drop note: if the host tab is the one that dies, no one is running
// this monitor — there is no other authority in the current architecture.
// The remaining clients will simply stop receiving state broadcasts and
// heartbeats from the host; the reducer they see is frozen at the last
// snapshot. Host migration is out of scope for this hook and would require
// a separate election/promotion pass.
