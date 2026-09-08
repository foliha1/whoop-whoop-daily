// ============================================================================
// PublicState — the redacted view of the host's reducer State that is safe to
// broadcast to all clients. The host must NEVER broadcast the raw reducer
// State: `grid` contains face-down Card objects and `deck` contains the full
// remaining draw order, both of which would expose hidden information via
// devtools.
//
// A slot in `grid` is emitted as a real Card ONLY when it is legitimately
// visible to everyone right now:
//   - currently peeking (state.peekingCard === i)
//   - a wrong-claim penalty exposure (any wrongBy set contains i)
//   - matched this tick (state.matchedCards has i)
// Any face-down slot is emitted as { occupied: true, card: null }, and empty
// slots as { occupied: false, card: null }. A client MUST NOT be able to tell
// "face-down card" from "empty slot" by inspecting the payload contents beyond
// the explicit `occupied` flag.
//
// `deck` is dropped entirely and replaced by `deckCount: number`.
// ============================================================================

import type { Card } from "@/cardData";
import type { Phase, State } from "@/hooks/useGameState";

export interface PublicSlot {
  occupied: boolean;
  card: Card | null;
}

export interface PublicState {
  phase: Phase;
  // Which feedback animation the SETTLING hold is waiting on.
  settleKind: "MATCH" | "WRONG" | null;
  seatCount: number;
  roller: number;
  flipper: number;
  scores: number[];
  rule: string[];
  dieValues: string[];
  claimBy: number | null;
  roundNum: number;
  allFaceUp: boolean;
  selectedCards: number[];
  matchedCards: number[]; // Set<number> serialized as array
  peekingCard: number | null;
  message: string;
  messageType: "info" | "success" | "error" | "warning";
  drawEmpty: boolean;
  deckCount: number;
  grid: PublicSlot[];
  rolling: boolean;
  // wrongBy union of exposed indices per seat. Faces of these cards are
  // already visible in `grid` above; the per-seat sets tell clients who owes
  // which wrong-claim penalty. Serialized as arrays.
  wrongBy: number[][];
  // v7.2: wrong claims each seat has spent this round. UI reads ONLY its own
  // entry — a player never sees another seat's remaining calls.
  missesThisRound: number[];
  // Frozen seat map — host's authoritative visitor_id → seat mapping. Joiners
  // learn their own seat by looking themselves up here.
  seatMap: Array<{ seat: number; visitor_id: string; display_name: string }>;
  // The current claim arbitration window. Incremented by the host every time
  // the claim state REOPENS (after a claim resolves, or when a round ends).
  // The claim-lock edge function keys UNIQUE (room_id, claim_window) on this.
  claimWindow: number;
  // Host-generated UUID minted at game start. Scopes the arbiter's
  // UNIQUE (room_id, game_id, claim_window) constraint so a second game in
  // the same room does not collide with the first game's rows.
  // Host-generated UUID minted at game start. Scopes the arbiter's
  // UNIQUE (room_id, game_id, claim_window) constraint so a second game in
  // the same room does not collide with the first game's rows.
  gameId: string;
  // Seats whose visitor_id is no longer in room presence, or whose heartbeat
  // has gone stale past its applicable threshold. The seat is kept — score,
  // seat index and seatMap position stay valid — but the host auto-advances
  // past the seat when it becomes flipper. More urgent than PENALTY in the UI.
  disconnectedSeats: number[];
  // Seats whose latest heartbeat reported document.hidden=true and are still
  // within the (much longer) hidden-stale grace window. UI-only — reducer
  // does NOT skip these, so a briefly backgrounded player isn't ghosted.
  awaySeats: number[];
}

export function toPublicState(
  state: State,
  seatMap: Array<{ seat: number; visitor_id: string; display_name: string }>,
  claimWindow: number = 0,
  gameId: string = "",
  disconnectedSeats: number[] = [],
  awaySeats: number[] = [],
): PublicState {
  const exposed = new Set<number>();
  if (state.peekingCard !== null) exposed.add(state.peekingCard);
  state.matchedCards.forEach((i) => exposed.add(i));
  // Only expose selected faces once the claim locks (second touch). Before
  // that, the first-selected card is broadcast as face-down with a selection
  // ring — touching one card must never leak its face (free-peek exploit).
  if (state.selectedCards.length >= 2) {
    state.selectedCards.forEach((i) => exposed.add(i));
  }
  for (const s of state.wrongBy) s.forEach((i) => exposed.add(i));

  const grid: PublicSlot[] = state.grid.map((c, i) => {
    if (c === null) return { occupied: false, card: null };
    const show = state.allFaceUp || exposed.has(i);
    return { occupied: true, card: show ? c : null };
  });

  return {
    phase: state.phase,
    settleKind: state.settleKind,
    seatCount: state.seatCount,
    roller: state.roller,
    flipper: state.flipper,
    scores: state.scores.slice(),
    rule: state.rule.slice(),
    dieValues: state.dieValues.slice(),
    claimBy: state.claimBy,
    roundNum: state.roundNum,
    allFaceUp: state.allFaceUp,
    selectedCards: state.selectedCards.slice(),
    matchedCards: Array.from(state.matchedCards),
    peekingCard: state.peekingCard,
    message: state.message,
    messageType: state.messageType,
    drawEmpty: state.drawEmpty,
    deckCount: state.deck.length,
    grid,
    rolling: state.rolling,
    wrongBy: state.wrongBy.map((s) => Array.from(s)),
    missesThisRound: state.missesThisRound.slice(),
    seatMap: seatMap.slice(),
    claimWindow,
    gameId,
    disconnectedSeats: disconnectedSeats.slice(),
    awaySeats: awaySeats.slice(),
  };
}
