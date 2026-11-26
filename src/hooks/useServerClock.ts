// ============================================================================
// useServerClock — measures the offset between this client's clock and the
// Supabase server clock, so multiplayer timestamps (e.g. roll `startAt`) can
// be compared meaningfully across peers whose local clocks drift.
//
// Strategy: hit the Supabase REST root with a HEAD request, read the `Date`
// response header, and estimate `offset = serverTime - (localTime + rtt/2)`.
// The half-RTT correction assumes symmetric latency — good enough for a
// game-loop tolerance of ~100ms.
//
// Safety:
//  - Offset is clamped to ±10s. A wildly wrong measurement (broken proxy,
//    misconfigured local clock) must never stall the game.
//  - If the ping fails for any reason, offset falls back to 0 — i.e. trust
//    the local clock. Better a small drift than a frozen round.
//  - Re-measures on `online` (browser reconnect).
// ============================================================================

import { useEffect, useRef, useState, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MAX_OFFSET_MS = 10_000;

let sharedOffset = 0;

export function serverNow(): number {
  return Date.now() + sharedOffset;
}

export function getServerOffset(): number {
  return sharedOffset;
}

/**
 * Together on the table server: the server measures this precisely with
 * pings (millisecond clock, no 1 s Date-header rounding) and sets it here,
 * so every server timestamp lines up with serverNow().
 */
export function setServerOffset(ms: number): void {
  if (!Number.isFinite(ms)) return;
  sharedOffset = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, ms));
}

async function measureOffsetOnce(): Promise<number> {
  if (!SUPABASE_URL) return 0;
  try {
    const localStart = Date.now();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "HEAD",
      cache: "no-store",
    });
    const localEnd = Date.now();
    const dateHeader = res.headers.get("date");
    if (!dateHeader) return 0;
    const serverTime = Date.parse(dateHeader);
    if (!Number.isFinite(serverTime)) return 0;
    const rtt = localEnd - localStart;
    const raw = serverTime - (localStart + rtt / 2);
    // Clamp — a broken measurement must not be able to freeze the game.
    const clamped = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, raw));
    return clamped;
  } catch {
    return 0;
  }
}

export function useServerClock(): { offset: number; serverNow: () => number; remeasure: () => void } {
  const [offset, setOffset] = useState(sharedOffset);
  const mountedRef = useRef(true);

  const remeasure = useCallback(async () => {
    const next = await measureOffsetOnce();
    sharedOffset = next;
    if (mountedRef.current) setOffset(next);
    // eslint-disable-next-line no-console
    console.log("[serverClock] offset =", next, "ms");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void remeasure();
    const onOnline = () => void remeasure();
    window.addEventListener("online", onOnline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("online", onOnline);
    };
  }, [remeasure]);

  return { offset, serverNow, remeasure };
}
