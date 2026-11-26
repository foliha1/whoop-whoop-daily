import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTimingSender,
  beginTimingGame,
  flushTiming,
  noteClaimGrant,
  noteClaimSeen,
  noteClaimTap,
  noteClaimVerdict,
  type TimingSample,
} from "@/lib/classicTiming";

let sent: TimingSample[] = [];
let game = 0;

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  __setTimingSender((s) => { sent.push(...s); });
  beginTimingGame(`g${++game}`, "joiner", 0); // rand 0 = sampled
});
afterEach(() => { vi.useRealTimers(); });

describe("claim timing (PartyKit plan step 1)", () => {
  it("claimer: tap to referee and tap to answer", () => {
    noteClaimTap(1, 1000);
    noteClaimGrant(1, 1080, 1150);
    noteClaimVerdict(1200);
    vi.advanceTimersByTime(1000);
    flushTiming();
    expect(sent).toEqual([expect.objectContaining({ kind: "tap", surface: "claim", tap_to_host_ms: 80, total_ms: 200 })]);
  });

  it("observer: grant to arrival to paint", () => {
    noteClaimGrant(2, 5000, 5070);
    noteClaimSeen(2, 5190);
    flushTiming();
    expect(sent).toEqual([expect.objectContaining({ surface: "claim_seen", tap_to_host_ms: 70, send_to_paint_ms: 120, total_ms: 190 })]);
  });

  it("observer: no grant heard, no sample", () => {
    noteClaimSeen(3, 9000);
    flushTiming();
    expect(sent).toEqual([]);
  });
});
