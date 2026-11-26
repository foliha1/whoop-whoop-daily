/**
 * Together table server (PartyKit plan). One `Table` per Together code:
 *   wss://whoop-whoop-tables.<account>.workers.dev/parties/table/<CODE>?pid=<player id>
 *
 * Step 3: the whole game runs here (see tableGame.ts), using the same rules
 * file as every other mode. Step 4 replaces the trusted `pid` with a checked
 * sign-in and saves results. Live Together keeps running on the host's
 * phone until the switch in step 5.
 */
import { routePartykitRequest, Server, type Connection, type ConnectionContext } from "partyserver";
import { TABLE_PROTOCOL, TableGame, type ServerMessage, type TableIntent } from "./tableGame";

type Env = { Table: DurableObjectNamespace<Table> };

type ClientMessage =
  | { t: "ping"; id: number; sentAt?: number }
  | { t: "join"; name?: string }
  | { t: "start" }
  | { t: "intent"; action: TableIntent; id?: string }
  | { t: "visibility"; hidden: boolean };

type ConnState = { pid: string };

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

export class Table extends Server<Env> {
  // A game lives in memory, with live timers, so the table stays awake while
  // anyone is connected. Free plan limits are far above Together's traffic.
  static options = { hibernate: false };

  private game: TableGame | null = null;
  private rate = new Map<string, { second: number; count: number }>();

  private getGame(): TableGame {
    if (!this.game) {
      this.game = new TableGame(
        {
          now: () => Date.now(),
          set: (fn, ms) => setTimeout(fn, ms),
          clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        },
        (to, msg) => this.deliver(to, msg),
      );
    }
    return this.game;
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
    conn.setState({ pid });
    conn.send(
      JSON.stringify({ t: "hello", v: TABLE_PROTOCOL, you: conn.id, table: this.name, serverNow: Date.now() }),
    );
    this.getGame().connect(pid);
  }

  onClose(conn: Connection<ConnState>) {
    const pid = conn.state?.pid;
    if (pid) this.getGame().disconnect(pid);
    this.rate.delete(conn.id);
  }

  onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer) {
    const pid = conn.state?.pid;
    if (!pid) return;
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
        game.join(pid, msg.name);
        return;
      case "start":
        game.start(pid);
        return;
      case "visibility":
        game.visibility(pid, msg.hidden === true);
        return;
      case "intent": {
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
