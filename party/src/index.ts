/**
 * Together table server (PartyKit plan). One `Table` per Together code:
 *   wss://whoop-whoop-tables.<account>.workers.dev/parties/table/<CODE>?pid=<player id>
 *
 * Step 3: the whole game runs here (see tableGame.ts), using the same rules
 * file as every other mode.
 * Step 4: a phone is only seated after Supabase confirms it holds this room's
 * secret seat key (table_member). The host's credentials register each game's
 * seat map and save the result (supabase.ts). `pid` is the member's public id.
 * Live Together keeps running on the host's phone until the switch in step 5.
 */
import { routePartykitRequest, Server, type Connection, type ConnectionContext } from "partyserver";
import { SupabaseRpc, type HostCredentials, type SupabaseEnv } from "./supabase";
import {
  TABLE_PROTOCOL,
  TableGame,
  type ServerMessage,
  type TableHooks,
  type TableIntent,
  type TableSnapshot,
} from "./tableGame";

/** Browser ids the live smoke test uses. Its games are never saved as results. */
const SMOKE_VISITOR_PREFIX = "smoke-";
/** A saved table older than this is left behind (its room code may be reused). */
const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Saves are batched: at most one write per this many ms, plus one at game end. */
const SAVE_EVERY_MS = 250;
/**
 * What a table keeps in its own Cloudflare storage. `host` holds the host's
 * seat key so a restarted table can still register a rematch and save the
 * result; it never leaves this table's storage.
 */
type Saved = { roomId: string | null; host: (HostCredentials & { pid: string }) | null; snap: TableSnapshot };

type Env = SupabaseEnv & {
  Table: DurableObjectNamespace<Table>;
  /** "supabase" (production): seats need a checked seat key. "open": local tests only. */
  TABLE_AUTH?: string;
};

type ClientMessage =
  | { t: "ping"; id: number; sentAt?: number }
  | { t: "join"; name?: string; roomId?: string; visitorId?: string; playerKey?: string }
  | { t: "start"; seats?: { pid?: unknown; name?: unknown }[] }
  | { t: "intent"; action: TableIntent; id?: string }
  | { t: "visibility"; hidden: boolean };

type ConnState = { pid: string; verified: boolean };

const PID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const INTENT_TYPES = new Set([
  "REQUEST_ROLL",
  "FLIP_START",
  "CLAIM",
  "PLAYER_SELECT_CARD",
  "PLAYER_RESOLVE_MATCH",
  "CANCEL_CLAIM",
  "NEW_GAME",
]);
/** Messages per second one socket may send before extras are dropped. */
const RATE_PER_SEC = 30;

function readIntent(raw: unknown): TableIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: unknown; idx?: unknown };
  if (typeof a.type !== "string" || !INTENT_TYPES.has(a.type)) return null;
  if (a.type === "FLIP_START" || a.type === "PLAYER_SELECT_CARD") {
    if (typeof a.idx !== "number" || !Number.isSafeInteger(a.idx)) return null;
    return { type: a.type, idx: a.idx };
  }
  return { type: a.type } as TableIntent;
}

/** The host's frozen lobby: up to six { pid, name }, ids checked for shape. */
function readSeatList(raw: unknown): { pid: string; name: unknown }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .slice(0, 6)
    .filter((e): e is { pid: string; name?: unknown } => !!e && typeof e.pid === "string" && PID_RE.test(e.pid))
    .map((e) => ({ pid: e.pid, name: e.name }));
  return list.length ? list : undefined;
}

export class Table extends Server<Env> {
  // A game lives in memory, with live timers, so the table stays awake while
  // anyone is connected. Free plan limits are far above Together's traffic.
  static options = { hibernate: false };

  private game: TableGame | null = null;
  private rate = new Map<string, { second: number; count: number }>();
  private rpc: SupabaseRpc | null = null;
  /** The Supabase room this table belongs to, fixed by the first checked join. */
  private roomId: string | null = null;
  private host: (HostCredentials & { pid: string }) | null = null;

  private get open(): boolean {
    return this.env.TABLE_AUTH === "open";
  }

  private getRpc(): SupabaseRpc {
    if (!this.rpc) this.rpc = new SupabaseRpc(this.env);
    return this.rpc;
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly clock = {
    now: () => Date.now(),
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };

  private hooks(): TableHooks {
    const rpc = this.getRpc();
    const changed = () => this.scheduleSave();
    if (this.open) return { changed };
    return {
      changed,
      registerGame: async (gameId, seats) => !!this.host && (await rpc.registerGame(this.host, gameId, seats)),
      saveResult: (report) => {
        const host = this.host;
        if (!host) return;
        // The live smoke test's games are never saved (see scripts/smoke.mjs).
        if (host.visitorId.startsWith(SMOKE_VISITOR_PREFIX)) {
          console.log("[table] smoke test game, not saved", report.gameId);
          return;
        }
        this.ctx.waitUntil(
          rpc.saveGame(host, report).then((ok) => {
            if (!ok) console.warn("[table] result not saved", report.gameId);
          }),
        );
      },
    };
  }

  private getGame(): TableGame {
    if (!this.game) {
      this.game = new TableGame(this.clock, (to, msg) => this.deliver(to, msg), () => crypto.randomUUID(), this.hooks());
    }
    return this.game;
  }

  /**
   * Pick a saved game back up after a restart (a deploy, or Cloudflare moving
   * the table). Runs before the first phone connects.
   */
  async onStart() {
    try {
      const saved = await this.ctx.storage.get<Saved>("table");
      if (!saved || Date.now() - saved.snap.savedAt > SNAPSHOT_MAX_AGE_MS) return;
      this.roomId = saved.roomId;
      this.host = saved.host ?? null;
      this.game = TableGame.restore(
        saved.snap,
        this.clock,
        (to, msg) => this.deliver(to, msg),
        () => crypto.randomUUID(),
        this.hooks(),
      );
      console.log("[table] restored", this.name, saved.snap.state.phase);
    } catch (e) {
      console.warn("[table] restore failed", e instanceof Error ? e.message : e);
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, SAVE_EVERY_MS);
  }

  private saveNow() {
    if (!this.game) return;
    const value: Saved = { roomId: this.roomId, host: this.host, snap: this.game.snapshot() };
    this.ctx.waitUntil(
      this.ctx.storage.put("table", value).catch((e: unknown) => {
        console.warn("[table] save failed", e instanceof Error ? e.message : e);
      }),
    );
  }

  private deliver(to: string | null, msg: ServerMessage) {
    const text = JSON.stringify(msg);
    for (const conn of this.getConnections<ConnState>()) {
      if (to === null || conn.state?.pid === to) conn.send(text);
    }
  }

  onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const pid = new URL(ctx.request.url).searchParams.get("pid") ?? "";
    if (!PID_RE.test(pid)) {
      conn.send(JSON.stringify({ t: "error", reason: "bad_pid" }));
      conn.close(4000, "bad_pid");
      return;
    }
    // Open (test) tables trust the pid; real tables wait for a checked join.
    conn.setState({ pid, verified: this.open });
    conn.send(
      JSON.stringify({ t: "hello", v: TABLE_PROTOCOL, you: conn.id, table: this.name, serverNow: Date.now() }),
    );
    if (this.open) this.getGame().connect(pid);
  }

  onClose(conn: Connection<ConnState>) {
    const st = conn.state;
    if (st?.pid && st.verified) this.getGame().disconnect(st.pid);
    this.rate.delete(conn.id);
  }

  /** Check a phone's seat key with Supabase, then seat it. */
  private async verifiedJoin(conn: Connection<ConnState>, msg: Extract<ClientMessage, { t: "join" }>) {
    const pid = conn.state!.pid;
    const { roomId, visitorId, playerKey } = msg;
    if (typeof roomId !== "string" || typeof visitorId !== "string" || typeof playerKey !== "string") {
      return this.reply(conn, "join_needs_seat_key");
    }
    if (this.roomId && this.roomId !== roomId) {
      // A table code from an old room, reused: start fresh unless a game is live.
      const g = this.game;
      if (g?.isStarted && g.state.phase !== "GAME_OVER") return this.reply(conn, "wrong_room");
      this.game = null;
      this.roomId = null;
      this.host = null;
    }
    let member;
    try {
      member = await this.getRpc().member(roomId, visitorId.slice(0, 100), playerKey.slice(0, 64));
    } catch (e) {
      console.warn("[table] seat check failed", e instanceof Error ? e.message : e);
      return this.reply(conn, "check_failed");
    }
    if (!member || member.pubId !== pid) return this.reply(conn, "seat_key_refused");
    if (member.roomCode.toUpperCase() !== this.name.toUpperCase()) return this.reply(conn, "wrong_room");
    this.roomId = roomId;
    if (member.isHost) this.host = { pid, roomId, visitorId, playerKey };
    const game = this.getGame();
    if (!conn.state?.verified) {
      conn.setState({ pid, verified: true });
      game.connect(pid);
    }
    game.join(pid, member.displayName, member.isHost);
  }

  onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer) {
    const pid = conn.state?.pid;
    if (!pid) return;
    const verified = conn.state?.verified === true;
    if (typeof raw !== "string" || raw.length > 4096) return this.reply(conn, "bad_message");

    const second = Math.floor(Date.now() / 1000);
    const r = this.rate.get(conn.id);
    if (r && r.second === second) {
      if (++r.count > RATE_PER_SEC) return;
    } else {
      this.rate.set(conn.id, { second, count: 1 });
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.reply(conn, "bad_json");
    }
    const game = this.getGame();
    switch (msg?.t) {
      case "ping":
        if (typeof msg.id !== "number") return this.reply(conn, "bad_message");
        conn.send(JSON.stringify({ t: "pong", id: msg.id, serverNow: Date.now(), sentAt: msg.sentAt }));
        return;
      case "join":
        if (this.open) game.join(pid, msg.name);
        else void this.verifiedJoin(conn, msg);
        return;
      case "start":
        if (!verified) return this.reply(conn, "not_seated");
        if (!this.open && this.host?.pid !== pid) return this.reply(conn, "host_only");
        game.start(pid, readSeatList(msg.seats));
        return;
      case "visibility":
        if (verified) game.visibility(pid, msg.hidden === true);
        return;
      case "intent": {
        if (!verified) return this.reply(conn, "not_seated");
        const action = readIntent(msg.action);
        if (!action) return this.reply(conn, "bad_intent");
        const id = typeof msg.id === "string" ? msg.id.slice(0, 64) : undefined;
        game.intent(pid, action, id);
        return;
      }
      default:
        this.reply(conn, "unknown_type");
    }
  }

  private reply(conn: Connection, reason: string) {
    conn.send(JSON.stringify({ t: "error", reason }));
  }
}

const CODE_RE = /^\/parties\/table\/[A-Za-z0-9_-]{1,32}(\/|$)/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, v: TABLE_PROTOCOL, now: Date.now() });
    }
    if (url.pathname.startsWith("/parties/") && !CODE_RE.test(url.pathname)) {
      return new Response("Bad table code", { status: 400 });
    }
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
