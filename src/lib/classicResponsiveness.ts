// ============================================================================
// Pure helpers for the Classic responsiveness batch. Kept free of React so the
// ordering and timing rules are unit-testable.
// ============================================================================

import type { Deadline } from "@/lib/hostDeadlines";

// ---- 1. joiner tap acknowledgment ------------------------------------------

export interface TapAck {
  idx: number;
  at: number; // local ms
}

/**
 * Should a pending tap acknowledgment be cleared? It clears when the real flip
 * arrives (any card peeking), when the tap can no longer become a flip (not
 * my flip turn), or when the ceiling elapses.
 */
export function shouldClearTapAck(
  ack: TapAck | null,
  s: { phase: string; flipper: number; peekingCard: number | null },
  mySeat: number | null,
  now: number,
  timeoutMs: number,
): boolean {
  if (!ack) return false;
  if (s.peekingCard !== null) return true;
  if (mySeat === null || s.phase !== "FLIPPING" || s.flipper !== mySeat) return true;
  return now - ack.at >= timeoutMs;
}

// ---- 2. absolute timing ----------------------------------------------------

/**
 * How far into a presentation of `totalMs` ending at `endsAt` (server clock)
 * this client is. 0 when there is no stamp (older host) or we are on time.
 */
export function presentationElapsed(endsAt: number | null | undefined, totalMs: number, serverNowMs: number): number {
  if (endsAt == null) return 0;
  const remaining = endsAt - serverNowMs;
  return Math.min(totalMs, Math.max(0, totalMs - remaining));
}

/** Is the last-flip claim window still live? Absent stamp = trust the phase. */
export function claimWindowLive(endsAt: number | null | undefined, serverNowMs: number): boolean {
  if (endsAt == null) return true;
  return serverNowMs < endsAt;
}

// ---- 3. tumble suppression -------------------------------------------------

type RollView = { rolling: boolean; phase: string; rule: string[]; dieValues: string[] };

/**
 * True when `next` differs from the last sent snapshot only by a cosmetic
 * tumble tick. The roll commit already lets every client animate locally, so
 * these are never broadcast. Roll start, landing (rule set) and settle
 * (rolling false) all remain boundaries that do broadcast.
 */
export function isTumbleOnly(prevSent: RollView | null, next: RollView): boolean {
  if (!prevSent) return false;
  if (!prevSent.rolling || !next.rolling) return false;
  if (prevSent.phase !== next.phase) return false;
  return prevSent.rule.join("|") === next.rule.join("|");
}

// ---- 4. resume ordering ----------------------------------------------------

export interface QueuedMessage {
  kind: "grant" | "intent";
  /** Local-clock time the message was created (server time − offset). */
  at: number;
  arrival: number;
  run: () => void;
}

export type ResumeStep =
  | { type: "message"; at: number; item: QueuedMessage }
  | { type: "deadline"; at: number; item: Deadline };

/**
 * Merge messages that queued up while the host was suspended with overdue
 * deadlines. Everything runs in time order; on a tie the message wins, so a
 * claim made before (or exactly at) a window's end beats that window's expiry
 * even though it is processed after the end. Messages with no timestamp use
 * their arrival time.
 */
export function planResume(messages: QueuedMessage[], deadlines: Deadline[]): ResumeStep[] {
  const steps: ResumeStep[] = [
    ...messages.map((m) => ({ type: "message" as const, at: m.at, item: m })),
    ...deadlines.map((d) => ({ type: "deadline" as const, at: d.at, item: d })),
  ];
  const rank = (s: ResumeStep) => (s.type === "message" ? 0 : 1);
  const tie = (s: ResumeStep) => (s.type === "message" ? s.item.arrival : s.item.seq);
  return steps.sort((a, b) => a.at - b.at || rank(a) - rank(b) || tie(a) - tie(b));
}

/**
 * Heartbeat liveness after the host itself was away. If the monitor's own
 * clock jumped (the tab slept), every joiner's age is meaningless: reset to
 * "unknown" and measure the normal grace from the moment the host returned.
 */
export function hostWasAway(lastTickAt: number, now: number, expectedIntervalMs: number): boolean {
  return now - lastTickAt > expectedIntervalMs * 3;
}

// ---- 5. measurement --------------------------------------------------------

export type BrowserFamily = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "other";

export function browserFamily(ua: string): BrowserFamily {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari|AppleWebKit/i.test(ua)) return "safari";
  return "other";
}

export function isInstagramInApp(ua: string): boolean {
  return /Instagram/i.test(ua);
}

/** Share of games that report timing. */
export const TIMING_SAMPLE_RATE = 0.1;

export function sampledGame(rand: number, rate = TIMING_SAMPLE_RATE): boolean {
  return rand < rate;
}
