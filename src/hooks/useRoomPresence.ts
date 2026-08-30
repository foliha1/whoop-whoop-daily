import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type PresenceStatus = "connecting" | "connected" | "error";

export interface PresenceParticipant {
  visitor_id: string;
  display_name: string;
  joined_at: number;
  is_host: boolean;
}

interface PresenceMeta {
  visitor_id: string;
  display_name: string;
  joined_at: number;
  is_host: boolean;
}

export type BroadcastListener = (msg: { payload: unknown }) => void;

/**
 * Subscribes to Supabase Realtime PRESENCE for a room, and exposes the
 * channel via a ref so callers can piggyback broadcast on it.
 *
 * `isHost` comes from the client's own rooms RPC result and is included in
 * this client's presence meta so every OTHER client can identify the host
 * by data, not by guessing at seat 0.
 *
 * Broadcast fan-out: Supabase Realtime requires broadcast `.on(...)`
 * handlers to be registered BEFORE `.subscribe()`. We register a single
 * broadcast handler here (pre-subscribe) that fans out to any listeners
 * registered via `onBroadcast`.
 */
export function useRoomPresence(
  roomId: string | null,
  visitorId: string,
  displayName: string,
  isHost: boolean,
): {
  participants: PresenceParticipant[];
  status: PresenceStatus;
  channel: RealtimeChannel | null;
  channelRef: React.MutableRefObject<RealtimeChannel | null>;
  onBroadcast: (listener: BroadcastListener) => () => void;
} {
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
  const [status, setStatus] = useState<PresenceStatus>("connecting");
  // Channel exposed as STATE so consumers re-render when it becomes available.
  // A ref alone silently strands hooks that gate on `channel != null`.
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const joinedAtRef = useRef<number>(Date.now());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listenersRef = useRef<Set<BroadcastListener>>(new Set());

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  useEffect(() => {
    if (!roomId) {
      setParticipants([]);
      setStatus("connecting");
      channelRef.current = null;
      setChannel(null);
      return;
    }

    joinedAtRef.current = Date.now();
    setStatus("connecting");

    const ch: RealtimeChannel = supabase.channel(`room:${roomId}`, {
      config: {
        presence: { key: visitorId },
        broadcast: { self: false, ack: false },
      },
    });
    channelRef.current = ch;


    const syncParticipants = () => {
      const state = ch.presenceState<PresenceMeta>();
      const seen = new Map<string, PresenceParticipant>();
      for (const key of Object.keys(state)) {
        const metas = state[key];
        if (!metas || metas.length === 0) continue;
        let best: PresenceMeta | null = null;
        for (const m of metas) {
          if (!best || m.joined_at < best.joined_at) best = m;
        }
        if (best) {
          seen.set(best.visitor_id, {
            visitor_id: best.visitor_id,
            display_name: best.display_name,
            joined_at: best.joined_at,
            is_host: !!best.is_host,
          });
        }
      }
      const list = Array.from(seen.values()).sort((a, b) => {
        // Host always seat 0 in lobby ordering.
        if (a.is_host !== b.is_host) return a.is_host ? -1 : 1;
        if (a.joined_at !== b.joined_at) return a.joined_at - b.joined_at;
        return a.visitor_id.localeCompare(b.visitor_id);
      });
      setParticipants(list);
    };

    ch
      .on("presence", { event: "sync" }, syncParticipants)
      .on("presence", { event: "join" }, syncParticipants)
      .on("presence", { event: "leave" }, syncParticipants)
      .on("broadcast", { event: "msg" }, (msg: { payload?: unknown }) => {
        listenersRef.current.forEach((cb) => {
          try { cb({ payload: msg.payload }); } catch { /* isolate */ }
        });
      })
      .subscribe(async (subStatus) => {
        if (subStatus === "SUBSCRIBED") {
          try {
            await ch.track({
              visitor_id: visitorId,
              display_name: displayNameRef.current,
              joined_at: joinedAtRef.current,
              is_host: isHostRef.current,
            } satisfies PresenceMeta);
            setChannel(ch);
            setStatus("connected");
          } catch (e) {
            console.warn("[presence] track failed", e);
            setStatus("error");
          }
        } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
          setStatus("error");
        } else if (subStatus === "CLOSED") {
          setStatus("connecting");
        }
      });

    // pagehide fires reliably on mobile Safari (unlike beforeunload) when the
    // tab is closed, backgrounded to bfcache, or the browser is quit. Untrack
    // synchronously so the server broadcasts a leave to remaining peers
    // instead of waiting for the socket heartbeat to time out.
    const onPageHide = () => {
      try { ch.untrack(); } catch { /* ignore */ }
    };
    window.addEventListener("pagehide", onPageHide);

    // Return path: backgrounded tabs come back via pageshow (bfcache restore)
    // and/or visibilitychange. Re-track with the ORIGINAL meta (same
    // joined_at) so the player keeps their lobby ordering and seat. Both
    // events often fire together, and re-tracking while already tracked is a
    // harmless no-op — Supabase just overwrites the presence entry.
    let rejoining = false;
    const rejoin = () => {
      if (rejoining) return;
      if (channelRef.current !== ch) return; // superseded by a newer channel
      rejoining = true;
      void (async () => {
        try {
          // If the socket died while backgrounded, tracking alone won't
          // reach the server — resubscribe first and wait for it.
          if (ch.state === "closed" || ch.state === "errored") {
            await new Promise<void>((resolve) => {
              ch.subscribe((subStatus) => {
                if (subStatus === "SUBSCRIBED") resolve();
                else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT" || subStatus === "CLOSED") resolve();
              });
            });
            if (channelRef.current !== ch) return;
          }
          await ch.track({
            visitor_id: visitorId,
            display_name: displayNameRef.current,
            joined_at: joinedAtRef.current,
            is_host: isHostRef.current,
          } satisfies PresenceMeta);
          if (channelRef.current !== ch) return;
          setChannel(ch);
          setStatus("connected");
        } catch (e) {
          console.warn("[presence] rejoin failed", e);
        } finally {
          rejoining = false;
        }
      })();
    };
    const onPageShow = () => rejoin();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") rejoin();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      try {
        ch.untrack();
      } catch {
        // ignore
      }
      supabase.removeChannel(ch);
      channelRef.current = null;
      setChannel(null);
    };
  }, [roomId, visitorId]);

  // Re-track on display-name or host-flag change while connected.
  useEffect(() => {
    if (!roomId || status !== "connected") return;
    const ch = channelRef.current;
    if (!ch) return;
    ch
      .track({
        visitor_id: visitorId,
        display_name: displayName,
        joined_at: joinedAtRef.current,
        is_host: isHost,
      } satisfies PresenceMeta)
      .catch(() => {
        /* non-fatal */
      });
  }, [displayName, isHost, roomId, status, visitorId]);

  const onBroadcast = useCallback((listener: BroadcastListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  return useMemo(
    () => ({ participants, status, channel, channelRef, onBroadcast }),
    [participants, status, channel, onBroadcast],
  );
}

