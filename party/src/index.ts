/**
 * Together table server, step 2 of the PartyKit plan: the skeleton.
 *
 * One `Table` per Together code. Phones connect to
 *   wss://whoop-whoop-tables.<account>.workers.dev/parties/table/<CODE>
 *
 * What it does today (nothing players can see yet):
 * - Says hello with the server clock and who is at the table.
 * - Answers "ping" with the server clock, so we can measure the round trip
 *   from real phones before any game logic moves here.
 * - Tells everyone when someone joins or leaves.
 *
 * The game itself (the reducer, claims, turns) moves here in step 3.
 * Live Together keeps running on the host's phone until the switch in step 5.
 */
import { routePartykitRequest, Server, type Connection } from "partyserver";

type Env = { Table: DurableObjectNamespace<Table> };

const PROTOCOL_VERSION = 1;

type ClientMessage = { t: "ping"; id: number; sentAt?: number };

type ServerMessage =
  | { t: "hello"; v: number; you: string; table: string; serverNow: number; present: number }
  | { t: "pong"; id: number; serverNow: number; sentAt?: number }
  | { t: "presence"; present: number }
  | { t: "error"; reason: string };

export class Table extends Server<Env> {
  // Wake the server for messages without keeping it in memory while idle.
  static options = { hibernate: true };

  private send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private present() {
    let n = 0;
    for (const _ of this.getConnections()) n++;
    return n;
  }

  private announcePresence() {
    this.broadcast(JSON.stringify({ t: "presence", present: this.present() } satisfies ServerMessage));
  }

  onConnect(conn: Connection) {
    this.send(conn, {
      t: "hello",
      v: PROTOCOL_VERSION,
      you: conn.id,
      table: this.name,
      serverNow: Date.now(),
      present: this.present(),
    });
    this.announcePresence();
  }

  onClose() {
    this.announcePresence();
  }

  onMessage(conn: Connection, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 4096) {
      this.send(conn, { t: "error", reason: "bad_message" });
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.send(conn, { t: "error", reason: "bad_json" });
      return;
    }
    if (msg?.t === "ping" && typeof msg.id === "number") {
      this.send(conn, { t: "pong", id: msg.id, serverNow: Date.now(), sentAt: msg.sentAt });
      return;
    }
    this.send(conn, { t: "error", reason: "unknown_type" });
  }
}

const CODE_RE = /^\/parties\/table\/[A-Za-z0-9_-]{1,32}(\/|$)/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, v: PROTOCOL_VERSION, now: Date.now() });
    }
    if (url.pathname.startsWith("/parties/") && !CODE_RE.test(url.pathname)) {
      return new Response("Bad table code", { status: 400 });
    }
    return (await routePartykitRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
