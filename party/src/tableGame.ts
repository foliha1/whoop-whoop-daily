/**
 * One Together table, run on the server (PartyKit plan, step 3).
 *
 * This is the host phone's job moved to Cloudflare. It runs the SAME rules
 * file every mode uses (src/lib/gameEngine.ts) and the same timer queue
 * (src/lib/hostDeadlines.ts), and does what useMultiplayerHost does today:
 *   - rolls (the server picks the die, then lands and settles it on time)
 *   - flips (the server owns the 2 s reveal)
 *   - WHOOP! WHOOP! claims: the first press to reach the server wins.
 *     This replaces the claim-lock edge function and the host round trip.
 *   - settle holds, the last-flip claim window, abandoned claims
 *   - skipping players who left or hid their tab, ending an empty table
 *   - hidden card faces: every phone gets the redacted public state only
 *   - rematch and end of game
 *
 * Nothing here knows about Cloudflare. The Durable Object in index.ts feeds
 * it messages and a clock, so tests can run thousands of games on a fake one.
 *
 * Not here yet (step 4): checking sign-in, reading seats from the Supabase
 * table code, saving results. Until then `join` trusts the name it is given,
 * and no live player is pointed at this server.
 */
import {
  CLAIM_ABANDON_MS,
  ROTATION_CLAIM_WINDOW_MS,
} from "@/lib/animationTiming";
import {
  MAX_WRONG_CLAIMS_PER_ROUND,
  REVEAL_MS,
  SETTLE_MATCH_MS,
  SETTLE_WRONG_MS,
  hasAnyValidPair,
  hasLegalCard,
  initialState,
  reducer,
  type Action,
  type State,
} from "@/lib/gameEngine";
import { DeadlineQueue } from "@/lib/hostDeadlines";
import {
  AWAY_SKIP_MS,
  HEARTBEAT_END_GAME_STALE_MS,
  HEARTBEAT_STALE_MS,
  ROLL_HERO_MS,
  type ClaimRejectPayload,
  type RollAttribute,
  type RollCommitPayload,
  type TransientEvent,
} from "@/lib/multiplayer";
import { toPublicState, type PublicState } from "@/lib/publicState";
import { computeSafetySwap, pickRoll, pickTumbleSeed, rngOf } from "@/lib/rolls";

export const TABLE_PROTOCOL = 1;
export const TABLE_CAPACITY = 6;
/** 3x3, the only grid Together plays. */
export const SLOT_COUNT = 9;
/** Roll commits start this far ahead so every phone can line up the tumble. */
export const ROLL_LEAD_MS = 150;
/** The die lands this long after the roll starts (matches useGameState). */
export const ROLL_LAND_MS = 450;
const NAME_MAX = 24;

export interface Clock {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
}

export interface SeatEntry {
  seat: number;
  pid: string;
  display_name: string;
}

/** What a phone may ask for. Card indexes are checked by the rules file. */
export type TableIntent =
  | { type: "REQUEST_ROLL" }
  | { type: "FLIP_START"; idx: number }
  | { type: "CLAIM" }
  | { type: "PLAYER_SELECT_CARD"; idx: number }
  | { type: "PLAYER_RESOLVE_MATCH" }
  | { type: "CANCEL_CLAIM" }
  | { type: "NEW_GAME" };

export type RejectReason =
  | "not_seated"
  | "not_started"
  | "game_over"
  | "rolling"
  | "not_your_roll"
  | "not_allowed"
  | "too_slow"
  | "no_calls_left"
  | "host_only";

export type TableStateMessage = PublicState & {
  /** Server-clock time this state was sent. */
  serverNow: number;
};

export type ServerMessage =
  | { t: "lobby"; seats: SeatEntry[]; started: boolean; gameId: string | null }
  | { t: "state"; seq: number; state: TableStateMessage }
  | { t: "roll_committed"; payload: RollCommitPayload }
  | { t: "event"; payload: TransientEvent }
  | { t: "claim_grant"; seat: number; claim_window: number; granted_at: number }
  | { t: "claim_reject"; payload: ClaimRejectPayload }
  | { t: "ack"; id: string; accepted: boolean; reason?: RejectReason; recvAt: number }
  | { t: "joined"; seat: number | null; host: boolean }
  | { t: "error"; reason: string };

/** `to: null` means everyone at the table. */
export type Send = (to: string | null, msg: ServerMessage) => void;

const ROLL_ATTRS: readonly RollAttribute[] = ["SHAPE", "NUMBER", "COLOR"];
const BOARD_ACTIONS = new Set(["FLIP_START", "PLAYER_SELECT_CARD", "PLAYER_RESOLVE_MATCH"]);

function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  return s || fallback;
}

export class TableGame {
  // ---- seats and liveness ----
  private seats: SeatEntry[] = [];
  private started = false;
  /** Open sockets per player id. A player may have more than one tab. */
  private sockets = new Map<string, number>();
  private hidden = new Set<string>();
  /** Seats skipped as absent: socket closed or tab hidden past the grace. */
  private skippable = new Set<number>();
  /** Seats gone long enough to count toward ending an empty table. */
  private gone = new Set<number>();

  // ---- game ----
  state: State;
  gameId: string | null = null;
  private claimWindow = 0;
  private seq = 0;
  private flipToken = 0;
  private rollLatch: string | null = null;
  private rollCommit: RollCommitPayload | null = null;
  private scheduledSettle = -1;
  private scheduledWindow = -1;
  private scheduledAbandon = -1;
  private dirty = false;
  /** Back-to-back reshuffles in one burst; stops a hopeless grid looping. */
  private swapsInARow = 0;
  private readonly deadlines: DeadlineQueue;

  constructor(
    private readonly clock: Clock,
    private readonly send: Send,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {
    this.deadlines = new DeadlineQueue(clock);
    this.state = initialState(SLOT_COUNT, { seatCount: 2 });
  }

  // ==========================================================================
  // Connections
  // ==========================================================================

  /** A socket for `pid` opened (before it has joined, or on reconnect). */
  connect(pid: string): void {
    this.sockets.set(pid, (this.sockets.get(pid) ?? 0) + 1);
    const entry = this.seatOf(pid);
    if (entry && this.started) {
      this.markPresent(entry.seat, pid);
      this.catchUp(pid);
    }
  }

  /** A socket for `pid` closed. */
  disconnect(pid: string): void {
    const n = (this.sockets.get(pid) ?? 1) - 1;
    if (n > 0) {
      this.sockets.set(pid, n);
      return;
    }
    this.sockets.delete(pid);
    this.hidden.delete(pid);
    const entry = this.seatOf(pid);
    if (!entry) return;
    if (!this.started) {
      // Before the game starts, leaving the lobby frees the seat.
      this.seats = this.seats
        .filter((e) => e.pid !== pid)
        .map((e, i) => ({ ...e, seat: i }));
      this.sendLobby();
      return;
    }
    const seat = entry.seat;
    this.deadlines.after(`drop:${seat}`, "seat_drop", HEARTBEAT_STALE_MS, () => {
      this.skippable.add(seat);
      this.applyLiveness();
    });
    this.deadlines.after(`gone:${seat}`, "seat_gone", HEARTBEAT_END_GAME_STALE_MS, () => {
      this.gone.add(seat);
      this.checkTableEmpty();
    });
    this.flush();
  }

  /** The phone's tab was hidden or shown again. */
  visibility(pid: string, isHidden: boolean): void {
    const entry = this.seatOf(pid);
    if (!entry || !this.started) return;
    if (isHidden) {
      if (this.hidden.has(pid)) return;
      this.hidden.add(pid);
      this.deadlines.after(`away:${entry.seat}`, "away_skip", AWAY_SKIP_MS, () => {
        this.skippable.add(entry.seat);
        this.applyLiveness();
      });
      this.dirty = true;
    } else {
      this.markPresent(entry.seat, pid);
    }
    this.flush();
  }

  private markPresent(seat: number, pid: string): void {
    this.hidden.delete(pid);
    this.deadlines.cancel(`drop:${seat}`);
    this.deadlines.cancel(`gone:${seat}`);
    this.deadlines.cancel(`away:${seat}`);
    this.gone.delete(seat);
    if (this.skippable.delete(seat)) this.applyLiveness();
    this.dirty = true;
  }

  private applyLiveness(): void {
    if (!this.started) return;
    this.dispatch({ type: "SET_DISCONNECTED", seats: [...this.skippable].sort() });
    this.flush();
  }

  private checkTableEmpty(): void {
    if (!this.started || this.state.phase === "GAME_OVER") return;
    if (this.seats.length - this.gone.size < 2) {
      this.dispatch({ type: "END_GAME_TABLE_EMPTY" });
      this.flush();
    }
  }

  // ==========================================================================
  // Lobby
  // ==========================================================================

  /** Take a seat. Before the start anyone may join; after it, only reconnects. */
  join(pid: string, name: unknown): void {
    const existing = this.seatOf(pid);
    if (existing) {
      if (!this.started) existing.display_name = cleanName(name, existing.display_name);
      this.send(pid, { t: "joined", seat: existing.seat, host: existing.seat === 0 });
      this.sendLobby();
      if (this.started) this.catchUp(pid);
      return;
    }
    if (this.started) {
      this.send(pid, { t: "error", reason: "game_in_progress" });
      return;
    }
    if (this.seats.length >= TABLE_CAPACITY) {
      this.send(pid, { t: "error", reason: "table_full" });
      return;
    }
    const seat = this.seats.length;
    this.seats.push({ seat, pid, display_name: cleanName(name, `Player ${seat + 1}`) });
    this.send(pid, { t: "joined", seat, host: seat === 0 });
    this.sendLobby();
  }

  /** The host starts the game with whoever is seated. */
  start(pid: string): void {
    const entry = this.seatOf(pid);
    if (!entry || entry.seat !== 0) {
      this.send(pid, { t: "error", reason: "host_only" });
      return;
    }
    if (this.started) return;
    if (this.seats.length < 2) {
      this.send(pid, { t: "error", reason: "need_two_players" });
      return;
    }
    this.started = true;
    this.newGame();
  }

  private newGame(): void {
    this.deadlines.clearAll();
    this.gameId = this.newId();
    this.claimWindow = 0;
    this.rollLatch = null;
    this.rollCommit = null;
    this.scheduledSettle = this.scheduledWindow = this.scheduledAbandon = -1;
    this.gone.clear();
    this.state = initialState(SLOT_COUNT, {
      seatCount: this.seats.length,
      names: this.seats.map((e) => e.display_name),
    });
    // Liveness carries over a rematch: an absent seat is still absent.
    for (const e of this.seats) {
      if (!this.sockets.has(e.pid)) {
        this.skippable.add(e.seat);
        this.deadlines.after(`gone:${e.seat}`, "seat_gone", HEARTBEAT_END_GAME_STALE_MS, () => {
          this.gone.add(e.seat);
          this.checkTableEmpty();
        });
      }
    }
    if (this.skippable.size) this.dispatch({ type: "SET_DISCONNECTED", seats: [...this.skippable] });
    this.sendLobby();
    this.dirty = true;
    this.flush();
  }

  // ==========================================================================
  // Intents
  // ==========================================================================

  intent(pid: string, action: TableIntent, ackId?: string): void {
    const recvAt = this.clock.now();
    const ack = (accepted: boolean, reason?: RejectReason) => {
      if (ackId) this.send(pid, { t: "ack", id: ackId, accepted, reason, recvAt });
    };
    const entry = this.seatOf(pid);
    if (!entry) return ack(false, "not_seated");
    if (!this.started) return ack(false, "not_started");
    const seat = entry.seat;
    // Any intent is proof the player is here.
    if (this.skippable.has(seat) || this.gone.has(seat)) this.markPresent(seat, pid);

    if (action.type === "NEW_GAME") {
      if (seat !== 0) return ack(false, "host_only");
      if (this.state.phase !== "GAME_OVER") return ack(false, "not_allowed");
      ack(true);
      this.newGame();
      return;
    }
    if (this.state.phase === "GAME_OVER") return ack(false, "game_over");
    if (this.state.rolling && BOARD_ACTIONS.has(action.type)) return ack(false, "rolling");

    let accepted = false;
    let reason: RejectReason = "not_allowed";
    switch (action.type) {
      case "REQUEST_ROLL":
        if (this.state.roller !== seat) reason = "not_your_roll";
        else accepted = this.commitRoll();
        break;
      case "FLIP_START": {
        const token = ++this.flipToken;
        accepted = this.dispatch({ type: "FLIP_START", by: seat, idx: action.idx, token });
        if (accepted) {
          this.deadlines.after(`flip:${token}`, "flip_complete", REVEAL_MS, () => {
            this.dispatch({ type: "FLIP_COMPLETE", token });
            this.flush();
          });
        }
        break;
      }
      case "CLAIM": {
        const r = this.claim(seat, recvAt);
        accepted = r === null;
        if (r) reason = r;
        break;
      }
      case "PLAYER_SELECT_CARD":
        accepted = this.dispatch({ type: "PLAYER_SELECT_CARD", by: seat, idx: action.idx });
        break;
      case "PLAYER_RESOLVE_MATCH":
        accepted = this.dispatch({ type: "PLAYER_RESOLVE_MATCH", by: seat });
        break;
      case "CANCEL_CLAIM":
        accepted = this.dispatch({ type: "CANCEL_CLAIM", by: seat });
        break;
      default:
        reason = "not_allowed";
    }
    ack(accepted, accepted ? undefined : reason);
    this.flush();
  }

  /** WHOOP! WHOOP!: the first press the server receives wins. */
  private claim(seat: number, at: number): RejectReason | null {
    const s = this.state;
    if ((s.missesThisRound[seat] ?? 0) >= MAX_WRONG_CLAIMS_PER_ROUND) {
      this.send(this.seats[seat].pid, {
        t: "claim_reject",
        payload: {
          grant_claim_window: this.claimWindow,
          host_claim_window: this.claimWindow,
          seat,
          pid: this.seats[seat].pid,
          reason: "NO_CALLS_LEFT",
        },
      });
      return "no_calls_left";
    }
    const claimable = (s.phase === "FLIPPING" || s.phase === "CLAIM_WINDOW") && s.claimBy === null && !s.rolling;
    if (!claimable) return "too_slow";
    const window = this.claimWindow;
    if (!this.dispatch({ type: "PLAYER_ENTER_CLAIM", by: seat })) return "too_slow";
    this.send(null, { t: "claim_grant", seat, claim_window: window, granted_at: at });
    return null;
  }

  /** The server decides the die, tells everyone, then lands it on time. */
  private commitRoll(): boolean {
    const s = this.state;
    if (s.phase !== "AWAITING_ROLL" || s.rolling) return false;
    const latch = `${this.gameId}:${s.roundNum}`;
    if (this.rollLatch === latch) return false;
    this.rollLatch = latch;
    const { attribute, faceIndex } = pickRoll(ROLL_ATTRS, rngOf(s));
    const startAt = this.clock.now() + ROLL_LEAD_MS;
    const payload: RollCommitPayload = {
      roundId: latch,
      attribute,
      faceIndex,
      tumbleSeed: pickTumbleSeed(),
      startAt,
    };
    this.rollCommit = payload;
    this.send(null, { t: "roll_committed", payload });
    this.deadlines.schedule("roll_start", "roll_start", startAt, () => {
      this.dispatch({ type: "ROLL_START" });
      this.flush();
    });
    this.deadlines.schedule("roll_land", "roll_land", startAt + ROLL_LAND_MS, () => {
      this.dispatch({ type: "ROLL_LAND", values: [attribute], rule: [attribute] });
      this.flush();
    });
    this.deadlines.schedule("roll_settle", "roll_settle", startAt + ROLL_HERO_MS, () => {
      this.dispatch({ type: "ROLL_SETTLE" });
      this.flush();
    });
    return true;
  }

  // ==========================================================================
  // Running the rules
  // ==========================================================================

  /** Apply one action. Returns true when the rules accepted it. */
  private dispatch(action: Action): boolean {
    const before = this.state;
    const after = reducer(before, action);
    if (after === before) return false;
    this.state = after;
    this.dirty = true;
    this.afterChange(before, action.type);
    return true;
  }

  /**
   * What the host hook's effects do after every state change, in one place:
   * claim window numbering, feedback events, timers, auto-skips and the
   * dead-grid reshuffle.
   */
  private afterChange(prev: State, actionType: Action["type"]): void {
    const s = this.state;
    if (s.roundNum !== prev.roundNum) this.claimWindow += 1;
    if (prev.claimBy !== null && s.claimBy === null) this.claimWindow += 1;

    for (let i = 0; i < s.seatCount; i++) {
      if ((s.scores[i] ?? 0) > (prev.scores[i] ?? 0)) this.event("GREAT_MATCH", i);
      if ((s.wrongBy[i]?.size ?? 0) > (prev.wrongBy[i]?.size ?? 0)) this.event("NOPE", i);
    }

    // Settle hold: one timer per settle token.
    if (s.phase === "SETTLING" && s.settleKind !== null) {
      if (this.scheduledSettle !== s.settleToken) {
        this.scheduledSettle = s.settleToken;
        const token = s.settleToken;
        const ms = s.settleKind === "MATCH" ? SETTLE_MATCH_MS : SETTLE_WRONG_MS;
        this.deadlines.after("settle", "settle_complete", ms, () => {
          this.dispatch({ type: "SETTLE_COMPLETE", token });
          this.flush();
        });
      }
    } else {
      this.deadlines.cancel("settle");
      this.scheduledSettle = -1;
    }

    // Last-flip claim window: one timer per window, never restarted by a claim.
    if (s.claimWindowOpen) {
      if (this.scheduledWindow !== s.claimWindowToken) {
        this.scheduledWindow = s.claimWindowToken;
        const token = s.claimWindowToken;
        this.deadlines.after("claim_window", "claim_window_expire", ROTATION_CLAIM_WINDOW_MS, () => {
          this.dispatch({ type: "CLAIM_WINDOW_EXPIRE", token });
          this.flush();
        });
      }
    } else {
      this.deadlines.cancel("claim_window");
      this.scheduledWindow = -1;
    }

    // A claim nobody finishes expires and play continues.
    if (s.phase === "CLAIM_SELECTING") {
      if (this.scheduledAbandon !== s.claimSeq) {
        this.scheduledAbandon = s.claimSeq;
        const seq = s.claimSeq;
        this.deadlines.after("claim_abandon", "claim_abandon", CLAIM_ABANDON_MS, () => {
          this.dispatch({ type: "CLAIM_ABANDONED", seq });
          this.flush();
        });
      }
    } else {
      this.deadlines.cancel("claim_abandon");
      this.scheduledAbandon = -1;
    }

    if (s.phase === "GAME_OVER") {
      for (const key of ["settle", "claim_window", "claim_abandon", "roll_start", "roll_land", "roll_settle"]) {
        this.deadlines.cancel(key);
      }
      return;
    }

    // Skip a flipper who cannot act (absent, or locked out of every card).
    if (
      s.phase === "FLIPPING" &&
      !s.inFlight &&
      (s.disconnected[s.flipper] || !hasLegalCard(s, s.flipper))
    ) {
      this.dispatch({ type: "SKIP_TICK" });
      return;
    }

    // Dead grid with cards left in the pile: reshuffle two cards back in.
    // Capped per burst: a tiny endgame grid and pile may have no pair at all,
    // and the rules' own stalemate check ends that game at the next round.
    if (actionType === "SAFETY_SWAP") this.swapsInARow += 1;
    else this.swapsInARow = 0;
    if (
      this.swapsInARow < 20 &&
      s.phase !== "CLAIM_SELECTING" &&
      s.phase !== "CLAIM_RESOLVING" &&
      !s.rolling &&
      s.deck.length >= 2 &&
      s.grid.filter((c) => c !== null).length >= 2 &&
      !hasAnyValidPair(s.grid)
    ) {
      const swapped = computeSafetySwap(s.grid, s.deck, rngOf(s));
      this.dispatch({ type: "SAFETY_SWAP", grid: swapped.grid, deck: swapped.deck });
    }
  }

  private event(kind: TransientEvent["kind"], seat: number): void {
    this.seq += 1;
    this.send(null, {
      t: "event",
      payload: { id: `${this.gameId}:${this.seq}:${kind}:${seat}`, kind, seat, at: this.clock.now() },
    });
  }

  // ==========================================================================
  // Sending
  // ==========================================================================

  publicState(): TableStateMessage {
    const settleAt = this.state.phase === "SETTLING" ? this.deadlines.atOf("settle") : null;
    const windowAt = this.state.claimWindowOpen ? this.deadlines.atOf("claim_window") : null;
    const hiddenSeats = this.seats.filter((e) => this.hidden.has(e.pid)).map((e) => e.seat);
    return {
      ...toPublicState(
        this.state,
        this.seats,
        this.claimWindow,
        this.gameId ?? "",
        [...this.skippable].sort(),
        hiddenSeats,
      ),
      settleEndsAt: settleAt,
      claimWindowEndsAt: windowAt,
      serverNow: this.clock.now(),
    };
  }

  /** Send the latest state once, after a burst of changes. */
  private flush(): void {
    if (!this.dirty || !this.started) return;
    this.dirty = false;
    this.seq += 1;
    this.send(null, { t: "state", seq: this.seq, state: this.publicState() });
  }

  private catchUp(pid: string): void {
    this.send(pid, { t: "state", seq: this.seq, state: this.publicState() });
    if (this.rollCommit && this.state.rolling) {
      this.send(pid, { t: "roll_committed", payload: this.rollCommit });
    }
  }

  private sendLobby(): void {
    this.send(null, { t: "lobby", seats: this.seats.slice(), started: this.started, gameId: this.gameId });
  }

  private seatOf(pid: string): SeatEntry | undefined {
    return this.seats.find((e) => e.pid === pid);
  }

  // ---- read-only views for tests and the server ----
  get seatList(): readonly SeatEntry[] {
    return this.seats;
  }
  get isStarted(): boolean {
    return this.started;
  }
  get pendingTimers(): number {
    return this.deadlines.due(Number.POSITIVE_INFINITY).length;
  }
}
