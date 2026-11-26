// ============================================================================
// Classic tap-to-screen + frame timing. Sampled per game (TIMING_SAMPLE_RATE, currently every game),
// no personal data: only role, browser family, an Instagram in-app flag and
// durations. Sent in small batches through the rate-capped
// `log_classic_timing` RPC — never a direct table insert.
//
//   tap (joiner) → host receipt → host state send → joiner paint
// All stamps are server-clock (serverNow()), so the stages line up across
// devices within the clock-offset tolerance.
// ============================================================================

import type { TimingProbe, TimingProbeAck } from "@/lib/multiplayer";
import { browserFamily, isInstagramInApp, sampledGame, type BrowserFamily } from "@/lib/classicResponsiveness";

/** "table": any phone in a Together game run by the table server. */
export type TimingRole = "host" | "joiner" | "table";

export interface TimingSample {
  kind: "tap" | "frames";
  role: TimingRole;
  browser: BrowserFamily;
  ig: boolean;
  surface: "flip" | "pulse" | "roll" | "claim" | "claim_seen";
  tap_to_host_ms?: number;
  host_to_send_ms?: number;
  send_to_paint_ms?: number;
  total_ms?: number;
  window_ms?: number;
  long_frames?: number;
  dropped_frames?: number;
}

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent : "");

let sampled = false;
let role: TimingRole = "joiner";
let gameKey = "";
let buffer: TimingSample[] = [];
type Sender = (samples: TimingSample[]) => void;
let sender: Sender = (samples) => {
  void import("@/integrations/supabase/client").then(({ supabase }) =>
    supabase.rpc("log_classic_timing" as never, { p_samples: samples } as never),
  ).catch(() => {});
};

let tableMode = false;
/**
 * Table-server games label every sample "table", whoever hosts, so the
 * before (host phone) and after (table server) numbers never mix.
 */
export function setTimingTableMode(on: boolean): void {
  tableMode = on;
  if (on && gameKey) role = "table";
}

/** Decide sampling once per game. */
export function beginTimingGame(id: string, r: TimingRole, rand = Math.random()): void {
  if (id === gameKey) return;
  flushTiming();
  gameKey = id;
  role = tableMode ? "table" : r;
  sampled = !!id && sampledGame(rand);
}

export function isTimingSampled(): boolean {
  return sampled;
}

function base(): Pick<TimingSample, "role" | "browser" | "ig"> {
  const u = ua();
  return { role, browser: browserFamily(u), ig: isInstagramInApp(u) };
}

export function recordTiming(sample: Omit<TimingSample, "role" | "browser" | "ig">): void {
  if (!sampled) return;
  buffer.push({ ...base(), ...sample });
  if (buffer.length >= 20) flushTiming();
}

export function flushTiming(): void {
  if (!buffer.length) return;
  const out = buffer.slice(0, 50);
  buffer = [];
  sender(out);
}

/** Test hook. */
export function __setTimingSender(fn: Sender): void {
  sender = fn;
}
export function __timingBuffer(): TimingSample[] {
  return buffer;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flushTiming());
}

// ---- host side ----
export const hostTimingProbe = {
  pending: null as TimingProbeAck | null,
  received(probe: TimingProbe, now: number) {
    if (!probe?.id) return;
    this.pending = { id: probe.id, tapAt: probe.tapAt, recvAt: now, sentAt: 0 };
  },
  /** Attached to the next state send, once. */
  takeAck(now: number): TimingProbeAck | undefined {
    const p = this.pending;
    if (!p) return undefined;
    this.pending = null;
    return { ...p, sentAt: now };
  },
};

// ---- joiner side ----
let nowFn: () => number = () => Date.now();
export function setTimingClock(fn: () => number): void {
  nowFn = fn;
}

export const joinerTimingProbe = {
  outstanding: null as TimingProbe | null,
  tap(now: number): TimingProbe | undefined {
    if (!sampled) return undefined;
    const p = { id: Math.random().toString(36).slice(2, 10), tapAt: now };
    this.outstanding = p;
    return p;
  },
  ackReceived(ack: TimingProbeAck) {
    const o = this.outstanding;
    if (!o || o.id !== ack.id) return;
    this.outstanding = null;
    const paint = () => {
      const paintAt = nowFn();
      recordTiming({
        kind: "tap",
        surface: "flip",
        tap_to_host_ms: Math.round(ack.recvAt - ack.tapAt),
        host_to_send_ms: Math.round(ack.sentAt - ack.recvAt),
        send_to_paint_ms: Math.round(paintAt - ack.sentAt),
        total_ms: Math.round(paintAt - ack.tapAt),
      });
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => paint());
    else paint();
  },
};

/** Host's own taps: tap → local paint (no network leg). */
export function recordHostTap(tapAt: number): void {
  // On the table server the host is just another phone: its flips are timed
  // through the server like everyone's (noteTableFlip*).
  if (!sampled || tableMode) return;
  const done = () => {
    const t = nowFn();
    recordTiming({ kind: "tap", surface: "flip", tap_to_host_ms: 0, host_to_send_ms: 0, send_to_paint_ms: Math.round(t - tapAt), total_ms: Math.round(t - tapAt) });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => done());
  else done();
}

// ---- claims (PartyKit plan, step 1: the "before" numbers) ----
//
//   claim       on the claimer's phone. tap_to_host_ms = tap → the referee's
//               granted_at (one way, server clock); total_ms = tap → the
//               referee's answer back on this phone.
//   claim_seen  on every OTHER phone (host included). tap_to_host_ms =
//               granted_at → the grant arriving here; send_to_paint_ms =
//               grant arrival → the claim painted here; total_ms = granted_at
//               → painted. Add a claim's tap_to_host_ms for the full trip.
const claimGrants = new Map<number, { grantedAt: number; arrival: number }>();
let myClaim: { seat: number; tapAt: number; grantedAt?: number } | null = null;
const CLAIM_VERDICT_SETTLE_MS = 1000;

/** The claimer tapped WHOOP! WHOOP! (server-clock time). */
export function noteClaimTap(seat: number, tapAt: number): void {
  if (!sampled) return;
  myClaim = { seat, tapAt };
}

/** A claim grant arrived on this phone (every phone hears it). */
export function noteClaimGrant(seat: number, grantedAt: number | undefined, arrival: number): void {
  if (!sampled || !grantedAt) return;
  claimGrants.set(seat, { grantedAt, arrival });
  if (myClaim && myClaim.seat === seat && myClaim.grantedAt === undefined) myClaim.grantedAt = grantedAt;
}

/** The referee answered the claimer. Waits a beat for its grant broadcast. */
export function noteClaimVerdict(answeredAt: number): void {
  if (!sampled || !myClaim) return;
  const c = myClaim;
  setTimeout(() => {
    if (myClaim === c) myClaim = null;
    recordTiming({
      kind: "tap",
      surface: "claim",
      ...(c.grantedAt !== undefined ? { tap_to_host_ms: Math.round(c.grantedAt - c.tapAt) } : {}),
      total_ms: Math.round(answeredAt - c.tapAt),
    });
  }, CLAIM_VERDICT_SETTLE_MS);
}

/** Another seat's claim was painted on this phone. */
export function noteClaimSeen(seat: number, paintAt: number): void {
  if (!sampled) return;
  const g = claimGrants.get(seat);
  claimGrants.delete(seat);
  if (!g || paintAt - g.grantedAt > 10_000) return;
  recordTiming({
    kind: "tap",
    surface: "claim_seen",
    tap_to_host_ms: Math.round(g.arrival - g.grantedAt),
    send_to_paint_ms: Math.round(paintAt - g.arrival),
    total_ms: Math.round(paintAt - g.grantedAt),
  });
}

// ---- frame monitoring during the board pulse and the die roll ----
/**
 * Starts counting long / dropped frames. Uses the Long Animation Frames API
 * where supported, else rAF gap counting. Returns a stop function that
 * records one sample.
 */
export function watchFrames(surface: "pulse" | "roll"): () => void {
  if (!sampled || typeof window === "undefined") return () => {};
  const start = performance.now();
  let longFrames = 0;
  let dropped = 0;
  let observer: PerformanceObserver | null = null;
  let raf = 0;
  const supportsLoaf =
    typeof PerformanceObserver !== "undefined" &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes("long-animation-frame");
  if (supportsLoaf) {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longFrames += 1;
        dropped += Math.max(0, Math.round(e.duration / 16.7) - 1);
      }
    });
    try { observer.observe({ type: "long-animation-frame", buffered: false }); } catch { observer = null; }
  }
  if (!observer) {
    let last = start;
    const loop = (t: number) => {
      const gap = t - last;
      if (gap > 50) longFrames += 1;
      if (gap > 20) dropped += Math.max(0, Math.round(gap / 16.7) - 1);
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    if (raf) cancelAnimationFrame(raf);
    recordTiming({
      kind: "frames",
      surface,
      window_ms: Math.round(performance.now() - start),
      long_frames: longFrames,
      dropped_frames: dropped,
    });
  };
}

// ---- table server flips (PartyKit plan, step 5) ----
// tap → server receipt (ack.recvAt) → server state send (state.serverNow) →
// this phone paints the face. Same stages as the joiner probe above.
let tableFlip: { idx: number; tapAt: number; recvAt: number | null } | null = null;

export function noteTableFlipTap(idx: number, tapAt: number): void {
  if (!sampled) return;
  tableFlip = { idx, tapAt, recvAt: null };
}

export function noteTableFlipAck(recvAt: number, accepted: boolean): void {
  if (!tableFlip) return;
  if (!accepted) tableFlip = null;
  else tableFlip.recvAt = recvAt;
}

/** A state arrived. If it shows the flipped card, time the paint. */
export function noteTableFlipState(peekingCard: number | null, sentAt: number): void {
  const f = tableFlip;
  if (!f || f.recvAt === null || peekingCard !== f.idx) return;
  tableFlip = null;
  const paint = () => {
    const paintAt = nowFn();
    recordTiming({
      kind: "tap",
      surface: "flip",
      tap_to_host_ms: Math.round((f.recvAt as number) - f.tapAt),
      host_to_send_ms: Math.round(sentAt - (f.recvAt as number)),
      send_to_paint_ms: Math.round(paintAt - sentAt),
      total_ms: Math.round(paintAt - f.tapAt),
    });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => paint());
  else paint();
}
