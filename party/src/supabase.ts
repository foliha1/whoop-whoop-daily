/**
 * The table server's only links to Supabase, all through public database
 * functions called with the public (anon) key. No secret lives on Cloudflare.
 *
 *  - table_member: is this phone really holding this room's seat key?
 *  - register_room_seats_by_pid: freeze a game's seat map (host credentials)
 *  - save_classic_game: save the finished game (host credentials)
 *
 * Saving uses the host's seat key, exactly as the host's phone does today,
 * but with the server's own record of the game (decided 26 Nov 2026).
 */
import type { GameReport, SeatEntry } from "./tableGame";

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface Member {
  pubId: string;
  displayName: string;
  isHost: boolean;
  roomCode: string;
}

export interface HostCredentials {
  roomId: string;
  visitorId: string;
  playerKey: string;
}

/** Version label stored with every result the server saves. */
export const SERVER_APP_VERSION = "table-server-1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * New Supabase keys (sb_publishable_…) are opaque, not JWTs: they go in the
 * apikey header only. Sent as a Bearer token they are refused, which is what
 * broke the first live server games (26 Nov 2026). Old JWT anon keys also
 * ride as the Bearer token, as before.
 */
export function rpcHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) h.Authorization = `Bearer ${key}`;
  return h;
}

export class SupabaseRpc {
  constructor(
    private readonly env: SupabaseEnv,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return !!this.env.SUPABASE_URL && !!this.env.SUPABASE_ANON_KEY;
  }

  private async call<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
    if (!this.configured) return null;
    const res = await this.fetchFn(`${this.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: rpcHeaders(this.env.SUPABASE_ANON_KEY!),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[supabase] ${fn} ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  }

  /** The member behind these credentials, or null if they do not match. */
  async member(roomId: string, visitorId: string, playerKey: string): Promise<Member | null> {
    if (!isUuid(roomId)) return null;
    const rows = await this.call<
      { pub_id: string; display_name: string; is_host: boolean; room_code: string }[]
    >("table_member", { p_room_id: roomId, p_visitor_id: visitorId, p_player_key: playerKey });
    const r = rows?.[0];
    if (!r?.pub_id) return null;
    return { pubId: r.pub_id, displayName: r.display_name, isHost: r.is_host === true, roomCode: r.room_code };
  }

  async registerGame(host: HostCredentials, gameId: string, seats: SeatEntry[]): Promise<boolean> {
    const ok = await this.call<boolean>("register_room_seats_by_pid", {
      p_room_id: host.roomId,
      p_game_id: gameId,
      p_host_visitor_id: host.visitorId,
      p_seats: seats.map((e) => ({ seat: e.seat, pid: e.pid })),
    });
    return ok === true;
  }

  async saveGame(host: HostCredentials, report: GameReport): Promise<boolean> {
    const ok = await this.call<boolean>("save_classic_game", {
      p_room_id: host.roomId,
      p_game_id: report.gameId,
      p_visitor_id: host.visitorId,
      p_player_key: host.playerKey,
      p_end_reason: report.endReason,
      p_seats: report.seats.map((e) => ({ seat: e.seat, name: e.name.slice(0, 24), score: e.score })),
      p_rounds_played: report.roundsPlayed,
      p_correct_claims: report.correctClaims,
      p_wrong_claims: report.wrongClaims,
      p_app_version: SERVER_APP_VERSION,
    });
    return ok === true;
  }
}
