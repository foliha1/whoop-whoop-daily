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

export type TimingRole = "host" | "joiner";

export interface TimingSample {
  kind: "tap" | "frames";
  role: TimingRole;
  browser: BrowserFamily;
  ig: boolean;
  surface: "flip" | "pulse" | "roll";
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

/** Decide sampling once per game. */
export function beginTimingGame(id: string, r: TimingRole, rand = Math.random()): void {
  if (id === gameKey) return;
  flushTiming();
  gameKey = id;
  role = r;
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
  if (!sampled) return;
  const done = () => {
    const t = nowFn();
    recordTiming({ kind: "tap", surface: "flip", tap_to_host_ms: 0, host_to_send_ms: 0, send_to_paint_ms: Math.round(t - tapAt), total_ms: Math.round(t - tapAt) });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => done());
  else done();
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
