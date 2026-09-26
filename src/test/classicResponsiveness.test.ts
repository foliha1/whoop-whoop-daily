// Classic responsiveness batch — one block per item plus the two resume
// corrections (no skips for players who stayed; claims beat deadlines).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  claimWindowLive,
  isTumbleOnly,
  planResume,
  presentationElapsed,
  shouldClearTapAck,
  browserFamily,
  isInstagramInApp,
  sampledGame,
  TIMING_SAMPLE_RATE,
} from "@/lib/classicResponsiveness";
import { DeadlineQueue } from "@/lib/hostDeadlines";
import { useMultiplayerHost, runResumeDrain } from "@/hooks/useMultiplayerGame";
import { useHeartbeatMonitor } from "@/hooks/useHeartbeat";
import { JOINER_TAP_ACK_TIMEOUT_MS, ROTATION_CLAIM_WINDOW_MS } from "@/lib/animationTiming";
import { SETTLE_MATCH_MS, SETTLE_WRONG_MS } from "@/hooks/useGameState";
import {
  __setTimingSender, __timingBuffer, beginTimingGame, flushTiming, recordTiming,
} from "@/lib/classicTiming";

vi.mock("@/lib/claimLock", () => ({ warmClaimLock: vi.fn(), callClaimLock: vi.fn() }));

const src = (p: string) => readFileSync(resolve(process.cwd(), "src", p), "utf8");

function fakeBus() {
  const listeners = new Set<(m: { payload: unknown }) => void>();
  const sent: Array<{ type?: string; payload?: unknown }> = [];
  const channel = {
    send: vi.fn((m: { payload: { type?: string } }) => { sent.push(m.payload); return Promise.resolve("ok"); }),
  } as unknown as import("@supabase/supabase-js").RealtimeChannel;
  const onBroadcast = (l: (m: { payload: unknown }) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const deliver = (payload: unknown) => listeners.forEach((l) => l({ payload }));
  return { channel, onBroadcast, deliver, sent };
}
const seatMap = [
  { seat: 0, pid: "host", display_name: "Hana" },
  { seat: 1, pid: "k1", display_name: "Jo" },
];
const hostOpts = (bus: ReturnType<typeof fakeBus>) => ({
  channel: bus.channel, onBroadcast: bus.onBroadcast, seatMap, hostVisitorId: "host",
  enabled: true, gameId: "g1", roomId: "r1", disconnectedSeats: [], presenceStatus: "connected" as const,
});
const setVisibility = (v: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("1. joiner tap acknowledgment", () => {
  const flipping = { phase: "FLIPPING", flipper: 1, peekingCard: null };
  it("appears immediately and holds while the flip is in flight", () => {
    const ack = { idx: 3, at: 1000 };
    expect(shouldClearTapAck(ack, flipping, 1, 1000, JOINER_TAP_ACK_TIMEOUT_MS)).toBe(false);
    expect(shouldClearTapAck(ack, flipping, 1, 1900, JOINER_TAP_ACK_TIMEOUT_MS)).toBe(false);
  });
  it("hands over to the real flip when the host snapshot arrives", () => {
    expect(shouldClearTapAck({ idx: 3, at: 0 }, { ...flipping, peekingCard: 3 }, 1, 50, 1000)).toBe(true);
  });
  it("clears on rejection (turn moved on) and on the 1s timeout", () => {
    expect(shouldClearTapAck({ idx: 3, at: 0 }, { ...flipping, flipper: 0 }, 1, 50, 1000)).toBe(true);
    expect(shouldClearTapAck({ idx: 3, at: 0 }, { ...flipping, phase: "CLAIM_SELECTING" }, 1, 50, 1000)).toBe(true);
    expect(shouldClearTapAck({ idx: 3, at: 0 }, flipping, 1, 1000, 1000)).toBe(true);
    expect(JOINER_TAP_ACK_TIMEOUT_MS).toBe(1000);
  });
  it("never reveals the face; reduced motion keeps a static ring", () => {
    const card = src("components/GameCard.tsx");
    // The opening layer is a ring only — faceUp is untouched by `opening`.
    expect(card).toMatch(/ww-card-opening/);
    expect(card).not.toMatch(/opening\s*\?\s*"rotateY\(0deg\)"/);
    const css = src("index.css");
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\/\*[^*]*\*\/\s*\.ww-card-pressed \{ transform: none; \}/);
    const view = src("components/MultiplayerGameView.tsx");
    expect(view).toMatch(/onPressStart=\{cardsInteractive \? \(\) => noteTapAck\(i\)/);
  });
});

describe("2. absolute timing for settles and the final claim window", () => {
  it("a client joining mid-settle lands at the right remaining time", () => {
    // Match settle ends at 10_000; joining at 9_000 → 900ms in.
    expect(presentationElapsed(10_000, SETTLE_MATCH_MS, 9_000)).toBe(SETTLE_MATCH_MS - 1000);
    expect(presentationElapsed(10_000, SETTLE_WRONG_MS, 9_500)).toBe(SETTLE_WRONG_MS - 500);
    expect(presentationElapsed(10_000, SETTLE_MATCH_MS, 8_100)).toBe(0); // on time
    expect(presentationElapsed(10_000, SETTLE_MATCH_MS, 12_000)).toBe(SETTLE_MATCH_MS); // over
    expect(presentationElapsed(null, SETTLE_MATCH_MS, 12_000)).toBe(0);
  });
  it("a client joining mid-claim-window stops being live exactly at the end", () => {
    expect(claimWindowLive(5_000, 4_999)).toBe(true);
    expect(claimWindowLive(5_000, 5_000)).toBe(false);
  });
  it("the claim window adds no countdown, ring or bar", () => {
    const view = src("components/MultiplayerGameView.tsx");
    expect(view).not.toMatch(/claimWindowEndsAt[^\n]*(width|progress|countdown|%)/i);
  });
  it("durations are unchanged", () => {
    expect(SETTLE_MATCH_MS).toBe(1900);
    expect(SETTLE_WRONG_MS).toBe(1600);
    expect(ROTATION_CLAIM_WINDOW_MS).toBe(2000);
  });
});

describe("2b/3. roll catch-up and no tumble snapshots", () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility("visible"); });
  afterEach(() => { vi.useRealTimers(); });

  it("catch-up during a roll includes the roll commit; tumble ticks are not broadcast", async () => {
    const bus = fakeBus();
    const { result } = renderHook(() => useMultiplayerHost(hostOpts(bus)));
    await act(async () => { vi.advanceTimersByTime(200); });
    await act(async () => { result.current.commitAndRoll(0); });
    const commitIdx = bus.sent.findIndex((p) => p.type === "roll_committed");
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    // Into the tumble.
    for (let i = 0; i < 6; i++) await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.state.rolling).toBe(true);
    const beforeReq = bus.sent.length;
    await act(async () => { bus.deliver({ v: 1, type: "state_request", seq: 0, payload: {} }); });
    const reply = bus.sent.slice(beforeReq).map((p) => p.type);
    expect(reply).toContain("state");
    expect(reply).toContain("roll_committed");
    // Finish the roll.
    for (let i = 0; i < 20; i++) await act(async () => { vi.advanceTimersByTime(100); });
    expect(result.current.state.rolling).toBe(false);
    // Between commit and settle: only boundaries (start, land, settle) plus
    // the catch-up reply — never one snapshot per 100ms tumble tick (~15).
    const statesDuring = bus.sent.slice(commitIdx).filter((p) => p.type === "state").length;
    expect(statesDuring).toBeLessThanOrEqual(5);
  });

  it("isTumbleOnly treats only cosmetic die ticks as skippable", () => {
    const a = { rolling: true, phase: "AWAITING_ROLL", rule: [], dieValues: ["SHAPE"] };
    expect(isTumbleOnly(a, { ...a, dieValues: ["COLOR"] })).toBe(true);
    expect(isTumbleOnly(a, { ...a, rule: ["COLOR"] })).toBe(false); // landing
    expect(isTumbleOnly(a, { ...a, rolling: false, phase: "FLIPPING" })).toBe(false); // settle
    expect(isTumbleOnly({ ...a, rolling: false }, a)).toBe(false); // roll start
  });
});

describe("4. host deadline catch-up on resume", () => {
  it("processes overdue deadlines in order", () => {
    let now = 0;
    const q = new DeadlineQueue({ now: () => now, set: () => 1, clear: () => {} });
    const order: string[] = [];
    q.schedule("settle", "settle_complete", 1900, () => order.push("settle"));
    q.schedule("flip:a", "flip_complete", 2000, () => order.push("flip"));
    q.schedule("claim_window", "claim_window_expire", 1000, () => order.push("window"));
    q.schedule("later", "claim_abandon", 60_000, () => order.push("later"));
    q.pause();
    now = 30_000;
    runResumeDrain([], q, (fn) => fn());
    expect(order).toEqual(["window", "settle", "flip"]);
    expect(q.has("later")).toBe(true);
  });

  it("a claim won before a deadline beats that deadline even when processed after it", () => {
    const order: string[] = [];
    const deadline = { key: "claim_window", kind: "claim_window_expire" as const, at: 2000, seq: 1, run: () => order.push("expire") };
    const grant = { kind: "grant" as const, at: 1500, arrival: 1, run: () => order.push("grant") };
    const lateGrant = { kind: "grant" as const, at: 2500, arrival: 2, run: () => order.push("late") };
    const tie = { kind: "intent" as const, at: 2000, arrival: 3, run: () => order.push("tie") };
    planResume([lateGrant, tie, grant], [deadline]).forEach((s) => s.item.run());
    expect(order).toEqual(["grant", "tie", "expire", "late"]);
  });

  beforeEach(() => { setVisibility("visible"); });

  it("after a simulated background with deadlines passed, the host sends one state", async () => {
    vi.useFakeTimers();
    try {
      const bus = fakeBus();
      const { result } = renderHook(() => useMultiplayerHost(hostOpts(bus)));
      await act(async () => { vi.advanceTimersByTime(200); });
      await act(async () => { result.current.commitAndRoll(0); });
      await act(async () => { setVisibility("hidden"); });
      // Suspended: the clock moves, timers do not run.
      const q = result.current.deadlines;
      q.pause();
      vi.setSystemTime(Date.now() + 30_000);
      const before = bus.sent.filter((p) => p.type === "state").length;
      await act(async () => { setVisibility("visible"); });
      await act(async () => { vi.advanceTimersByTime(200); });
      const after = bus.sent.filter((p) => p.type === "state").length;
      expect(result.current.state.rolling).toBe(false); // roll start → land → settle drained in order
      expect(result.current.state.phase).toBe("FLIPPING");
      expect(after - before).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("host backgrounded 30s while every joiner stays present: nobody is skipped", async () => {
    vi.useFakeTimers();
    try {
      const bus = fakeBus();
      const { result } = renderHook(() => useHeartbeatMonitor({
        channel: bus.channel, onBroadcast: bus.onBroadcast, enabled: true,
        watchedVisitorIds: ["host", "k1", "k2"], hostVisitorId: "host",
      }));
      const beat = (k: string) => bus.deliver({ v: 1, type: "heartbeat", seq: 1, payload: { pid: k, at: Date.now(), hidden: false } });
      await act(async () => { beat("k1"); beat("k2"); vi.advanceTimersByTime(2000); });
      await act(async () => { setVisibility("hidden"); });
      // Host suspended: no timers, no heartbeats received.
      vi.setSystemTime(Date.now() + 30_000);
      await act(async () => { setVisibility("visible"); });
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(result.current.staleVisitors).toEqual([]);
      expect(result.current.awaySkipVisitors).toEqual([]);
      // Fresh heartbeats arrive within the normal grace: still nobody skipped.
      await act(async () => { beat("k1"); beat("k2"); vi.advanceTimersByTime(10_000); });
      expect(result.current.staleVisitors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("5. tap-to-screen measurement", () => {
  it("samples every game and sends no personal data through the RPC", () => {
    expect(TIMING_SAMPLE_RATE).toBe(1);
    expect(sampledGame(0.05)).toBe(true);
    expect(sampledGame(0.999)).toBe(true);
    expect(sampledGame(0.5, 0.1)).toBe(false);
    const sent: unknown[][] = [];
    __setTimingSender((s) => sent.push(s));
    beginTimingGame("gA", "joiner", 0.01);
    recordTiming({ kind: "tap", surface: "flip", total_ms: 120 });
    flushTiming();
    expect(sent).toHaveLength(1);
    const keys = Object.keys(sent[0][0] as object).sort();
    expect(keys).toEqual(["browser", "ig", "kind", "role", "surface", "total_ms"].sort());
    beginTimingGame("gB", "joiner", 0.99);
    recordTiming({ kind: "tap", surface: "flip", total_ms: 120 });
    expect(__timingBuffer()).toHaveLength(1);
    flushTiming();
    expect(src("lib/classicTiming.ts")).toMatch(/rpc\("log_classic_timing"/);
    expect(src("lib/classicTiming.ts")).not.toMatch(/from\("classic_timing_samples"\)/);
  });
  it("tags browser family and Instagram's in-app browser", () => {
    const ig = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0";
    expect(browserFamily(ig)).toBe("safari");
    expect(isInstagramInApp(ig)).toBe(true);
    expect(browserFamily("Mozilla/5.0 Chrome/120 Safari/537.36")).toBe("chrome");
  });
});
