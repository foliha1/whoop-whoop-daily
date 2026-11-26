// Runs the table server locally (wrangler dev) and checks the skeleton:
// hello, ping/pong, presence, bad codes. Run: npm test (from party/).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
let dev;

before(async () => {
  dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler dev did not start");
});

after(() => dev?.kill("SIGTERM"));

function open(code) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/parties/table/${code}`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const next = (pred) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
  };
  return { ws, next, ready: new Promise((r) => ws.addEventListener("open", r)) };
}

test("health answers", async () => {
  const r = await (await fetch(`${BASE}/health`)).json();
  assert.equal(r.ok, true);
});

test("hello, ping and presence across two phones", async () => {
  const a = open("TEST01");
  await a.ready;
  const hello = await a.next((m) => m.t === "hello");
  assert.equal(hello.table, "TEST01");
  assert.equal(typeof hello.serverNow, "number");

  const b = open("TEST01");
  await b.ready;
  await b.next((m) => m.t === "hello");
  const seen = await a.next((m) => m.t === "presence" && m.present === 2);
  assert.equal(seen.present, 2);

  const t0 = Date.now();
  a.ws.send(JSON.stringify({ t: "ping", id: 7, sentAt: t0 }));
  const pong = await a.next((m) => m.t === "pong");
  assert.equal(pong.id, 7);
  assert.equal(pong.sentAt, t0);

  a.ws.send("not json");
  assert.equal((await a.next((m) => m.t === "error")).reason, "bad_json");

  b.ws.close();
  await a.next((m) => m.t === "presence" && m.present === 1);
  a.ws.close();
});

test("tables are separate", async () => {
  const a = open("TEST02");
  await a.ready;
  const hello = await a.next((m) => m.t === "hello");
  assert.equal(hello.present, 1);
  a.ws.close();
});

test("bad table codes are refused", async () => {
  const r = await fetch(`${BASE}/parties/table/bad code!`);
  assert.equal(r.status, 400);
});
