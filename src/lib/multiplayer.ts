// ============================================================================
// Multiplayer message envelope + intent shapes.
//
// Every broadcast message carries: { v, type, seq, payload }.
//   v   — protocol version. Bumped on breaking changes so stale tabs can
//         detect mismatch instead of silently misrendering.
//   seq — host-issued monotonically increasing counter. Clients ignore any
//         `state` message with seq <= last applied seq. Out-of-order delivery
//         must never rewind the board.
//   type — message discriminator. Today: "state" (host→all), "intent"
//         (joiner→host). A future "event" type (prompt 10) will carry
//         transient feedback (NICE!/TOO SLOW!/Great Match!/NOPE!); the
//         envelope shape is chosen so adding it is not a rewrite.
// ============================================================================

import type { PublicState } from "@/lib/publicState";
import type { Action } from "@/hooks/useGameState";

export const PROTOCOL_VERSION = 1;

// Total duration of the hero roll animation, in milliseconds. Shared across
// the wire AND the reducer: the host schedules `ROLL_SETTLE` at
// `startAt + ROLL_HERO_MS`, and every client's overlay animates on the same
// budget. Split as tumble(800) + hold(950) + land(250) = 2000.
export const ROLL_HERO_MS = 2000;

// Intent actions a joiner may request. Roll is a special intent because the
// host owns dice animation; the joiner just asks. All other intents map
// 1:1 onto seat-generic reducer actions.
export type IntentAction =
  | { type: "REQUEST_ROLL" }
  | { type: "CANCEL_CLAIM"; by: number }
  // Rematch. Host-only in multiplayer: maps onto the reducer's INIT with the
  // same grid size, seat count and names, so scores reset to zero.
  | { type: "NEW_GAME" }
  | { type: "DEBUG_DRAIN_DECK" }
  | { type: "DEBUG_FORCE_END_GAME" }
  | Extract<
      Action,
      | { type: "PLAYER_ENTER_CLAIM" }
      
      | { type: "PLAYER_SELECT_CARD" }
      | { type: "PLAYER_RESOLVE_MATCH" }
      | { type: "FLIP_START" }
    >;

export interface IntentPayload {
  seat: number;
  visitor_id: string; // sender identity for host-side validation
  action: IntentAction;
}

export interface StateEnvelope {
  v: number;
  type: "state";
  seq: number;
  payload: PublicState;
}

export interface IntentEnvelope {
  v: number;
  type: "intent";
  seq: number; // joiners just increment locally; host validates by content
  payload: IntentPayload;
}

// Emitted server-side by the claim-lock edge function on a successful lock.
// The host listens and dispatches PLAYER_ENTER_CLAIM for the granted seat.
// Joiners can ignore it — they see the winner via the next state broadcast.
export interface ClaimGrantEnvelope {
  v: number;
  type: "claim_grant";
  seq: number;
  payload: { claim_window: number; seat: number; visitor_id: string };
}

// Transient events (NICE!, Great Match!, NOPE!). Each carries a unique id so
// clients can dedupe — an event applied twice must not animate twice. Events
// cannot be derived from a PublicState snapshot; a client that misses one
// degrades gracefully because the derived state on the next snapshot is
// self-sufficient. TOO SLOW! is NOT broadcast — the arbiter's `won:false`
// response is rendered locally by the loser only.
export type TransientEventKind = "NICE" | "GREAT_MATCH" | "NOPE";
export interface TransientEvent {
  id: string;
  kind: TransientEventKind;
  seat: number;   // whose chip / grid the event lands on
  at: number;     // host-issued epoch millis (informational)
}
export interface EventEnvelope {
  v: number;
  type: "event";
  seq: number;
  payload: TransientEvent;
}

// Server-authoritative roll commit. The host decides the outcome and
// broadcasts BEFORE any client (including itself) animates. `startAt` is a
// host epoch millis timestamp set ~150ms in the future so subscribers can
// align the tumble animation. `attribute` is the resolved rule; `faceIndex`
// disambiguates which of the two cube faces bearing that attribute settles
// up; `tumbleSeed` seeds any client-side visual jitter deterministically.
export type RollAttribute = "SHAPE" | "NUMBER" | "COLOR";
export interface RollCommitPayload {
  roundId: string;
  attribute: RollAttribute;
  faceIndex: 0 | 1;
  tumbleSeed: number;
  startAt: number;
}
export interface RollCommittedEnvelope {
  v: number;
  type: "roll_committed";
  seq: number;
  payload: RollCommitPayload;
}

// Explicit rejection emitted by the host when a client action arrives during
// the ROLLING window. NOT a silent no-op — subscribers can log/toast.
export interface RollRejectPayload {
  roundId: string;
  seat: number;
  action: string;
  reason: "ROLLING";
}
export interface RollRejectEnvelope {
  v: number;
  type: "roll_reject";
  seq: number;
  payload: RollRejectPayload;
}

// Host-emitted rejection of a claim grant whose claim_window doesn't match
// the host's current window. Sent so the pressing player can distinguish a
// dropped-grant race from a stuck "LOCKING…" state. reason describes why:
//   STALE_WINDOW  — grant.claim_window < host's current (window already
//                   closed by a resolution or round advance)
//   FUTURE_WINDOW — grant.claim_window > host's current (should not happen;
//                   surfaced explicitly rather than swallowed)
//   NO_CALLS_LEFT — v7.2: the seat has already used its two wrong claims this
//                   round. Refused WITHOUT consuming the window: the host
//                   releases the arbiter row so other seats can still claim.
export interface ClaimRejectPayload {
  grant_claim_window: number;
  host_claim_window: number;
  seat: number;
  visitor_id: string;
  reason: "STALE_WINDOW" | "FUTURE_WINDOW" | "NO_CALLS_LEFT";
}
export interface ClaimRejectEnvelope {
  v: number;
  type: "claim_reject";
  seq: number;
  payload: ClaimRejectPayload;
}

// Application-level liveness heartbeat. Presence leave events cannot be
// relied on — a crashed or backgrounded client never untracks, and server
// reap can take well over a minute. Every client broadcasts this on the
// room channel on a fixed cadence; the host tracks last-seen per visitor
// and marks a seat disconnected when its last heartbeat is stale. A seat
// is un-marked the moment its heartbeat resumes (SET_DISCONNECTED uses
// REPLACE semantics on the reducer).
export const HEARTBEAT_INTERVAL_MS = 5000;
export const HEARTBEAT_STALE_MS = 15000;
// Backgrounded (document.hidden) clients get a much longer grace window before
// the host counts them disconnected. Browsers throttle timers on hidden tabs
// aggressively — Chrome drops to ~1 timer/minute after ~5min hidden — so a
// 15s threshold produces false positives on healthy sleeping tabs. A hidden
// client is surfaced as AWAY (not GONE) until this longer threshold trips.
export const HEARTBEAT_HIDDEN_STALE_MS = 180000; // 3 minutes
// End-game guard threshold. Fewer than 2 connected → END_GAME_TABLE_EMPTY is
// IRREVERSIBLE, so it demands a much stricter signal than the per-turn skip.
// A seat only counts toward the end-condition if we've heard NOTHING from it
// for this long — regardless of whether its last heartbeat said hidden. A
// still-arriving "hidden" heartbeat is proof-of-life and does NOT count.
export const HEARTBEAT_END_GAME_STALE_MS = 60000; // 60s, 4x the skip threshold
// Dwell time before a seat that is reporting hidden becomes turn-skippable.
// AWAY chip shows immediately on the first hidden:true heartbeat (proof the
// player has backgrounded), but we do not want a momentary tab switch to
// steal a turn — the reducer only skips AWAY seats after this dwell.
export const AWAY_SKIP_MS = 15000;
// If every watched seat's last-seen heartbeat falls within this window, the
// silence is almost certainly caused by the HOST'S own socket dropping (all
// peers went quiet simultaneously) rather than every peer leaving one at a
// time. Used to gate the irreversible END_GAME_TABLE_EMPTY dispatch. Set to
// the sender interval plus a small buffer for jitter.
export const ISOLATION_SPREAD_MS = HEARTBEAT_INTERVAL_MS + 2000;
export interface HeartbeatPayload {
  visitor_id: string;
  at: number; // sender wall clock — informational; host uses local receive time
  // Set on visibilitychange transitions AND every regular tick so the host
  // does not need to correlate events with intervals. Absent (undefined) is
  // treated as visible for backward compatibility.
  hidden?: boolean;
}
export interface HeartbeatEnvelope {
  v: number;
  type: "heartbeat";
  seq: number;
  payload: HeartbeatPayload;
}

export type Envelope =
  | StateEnvelope
  | IntentEnvelope
  | ClaimGrantEnvelope
  | EventEnvelope
  | RollCommittedEnvelope
  | RollRejectEnvelope
  | ClaimRejectEnvelope
  | HeartbeatEnvelope;

export function jsonSerialize(payload: unknown): string {
  return JSON.stringify(payload);
}

export function jsonDeserialize<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
