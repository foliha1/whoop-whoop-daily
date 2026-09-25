// ============================================================================
// classicReliability — small pure rules for the Classic network layer, kept
// out of the hooks so each one is directly testable.
// ============================================================================

/** Result of one register_room_seats call. */
export type SeatRpcResult = { data: unknown; error: unknown };

/**
 * Register the frozen seats before a game may start. Success means no error
 * AND the server answered `true` — `data: false` is a refusal, not a success.
 * One retry for a transient failure; the caller keeps the lobby on
 * "Starting…" with a retry if this still returns false.
 */
export async function registerSeatsWithRetry(
  call: () => PromiseLike<SeatRpcResult>,
  retryDelayMs = 600,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await call();
      if (!error && data === true) return true;
      console.warn("[register_room_seats] not registered", { attempt, error, data });
    } catch (e) {
      console.warn("[register_room_seats] threw", { attempt, e });
    }
    if (attempt === 0) await sleep(retryDelayMs);
  }
  return false;
}

/** Dedupe key for a claim grant — scoped to one game. */
export const grantKey = (gameId: string, claimWindow: number, seat: number) =>
  `${gameId}:${claimWindow}:${seat}`;

export type GrantDecision =
  | "apply" // current game, currently open window: may enter claim (or defer)
  | "ignore" // duplicate, another game, or a window that already resolved
  | "refuse"; // current game but a window that never resolved — tell the seat

/**
 * The host applies a grant only when it belongs to the current game AND
 * names the currently open claim window. Everything else is ignored — a late
 * or rebroadcast grant can never reopen a claim in a window that has closed.
 * `refuse` keeps the existing reject + release path for a grant that raced a
 * window close without ever being honoured (so the pressing seat hears why).
 */
export function decideGrant(opts: {
  grantGameId: string | undefined;
  currentGameId: string;
  grantWindow: number;
  openWindow: number;
  alreadyHandled: boolean; // dedupe key seen (applied or refused)
  windowResolved: boolean; // some grant was applied for this window already
}): GrantDecision {
  const { grantGameId, currentGameId, grantWindow, openWindow, alreadyHandled, windowResolved } = opts;
  if (grantGameId !== undefined && grantGameId !== currentGameId) return "ignore";
  if (alreadyHandled) return "ignore";
  if (grantWindow === openWindow) return "apply";
  if (grantWindow < openWindow && windowResolved) return "ignore";
  return "refuse";
}

/**
 * Joiner snapshot ordering, scoped per game. A snapshot is accepted only if
 * it belongs to the current game with a higher seq than any seen for that
 * game, or it opens a game this joiner has not seen yet (the old game is then
 * retired). Snapshots from a retired game are always dropped.
 */
export class SnapshotOrder {
  private gameId: string | null = null;
  private lastSeq = 0;
  private retired = new Set<string>();

  accept(gameId: string, seq: number): boolean {
    if (this.gameId === gameId) {
      if (seq <= this.lastSeq) return false;
      this.lastSeq = seq;
      return true;
    }
    if (this.retired.has(gameId)) return false;
    if (this.gameId !== null) this.retired.add(this.gameId);
    this.gameId = gameId;
    this.lastSeq = seq;
    return true;
  }

  get current(): string | null {
    return this.gameId;
  }
}

/** Only the current roller may roll. */
export const mayRoll = (requestingSeat: number, roller: number) => requestingSeat === roller;

/**
 * Seats the reducer may skip. Presence absence alone never counts — it only
 * starts the grace period, which the heartbeat monitor measures. A seat is
 * skippable only once its heartbeat has gone stale or it has dwelt hidden.
 */
export function skippableSeats(
  seats: Array<{ seat: number; player_key: string }>,
  staleKeys: Iterable<string>,
  awaySkipKeys: Iterable<string>,
): number[] {
  const stale = new Set(staleKeys);
  const awaySkip = new Set(awaySkipKeys);
  return seats.filter((e) => stale.has(e.player_key) || awaySkip.has(e.player_key)).map((e) => e.seat);
}

export type HostLiveness = "here" | "waiting" | "gone";

/**
 * Joiner's view of the host during play. Missing from presence → "waiting"
 * (quiet grace); only a stale host heartbeat, per the existing thresholds,
 * means the host is really gone.
 */
export function hostLiveness(opts: {
  hostKey: string | null;
  presentKeys: Iterable<string>;
  staleKeys: Iterable<string>;
}): HostLiveness {
  const { hostKey, presentKeys, staleKeys } = opts;
  if (!hostKey) return "waiting";
  if (new Set(staleKeys).has(hostKey)) return "gone";
  return new Set(presentKeys).has(hostKey) ? "here" : "waiting";
}

/** The table URL a reload returns to. Keeps other params, replaces `r`. */
export function tableUrl(currentSearch: string, code: string | null): string {
  const params = new URLSearchParams(currentSearch);
  if (code) params.set("r", code);
  else params.delete("r");
  const qs = params.toString();
  return `/classic.html${qs ? `?${qs}` : ""}`;
}

export const ACTIVE_TABLE_KEY = "ww_classic_active_table";
