// Runs the real table server locally (wrangler dev) and plays the opening of
// a game over real sockets: join, start, roll, flip, claim. Run: npm test.
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
    detached: true,
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

after(() => {
  // wrangler starts its own children; stop the whole group so the run exits.
  try {
    process.kill(-dev.pid, "SIGTERM");
  } catch {}
});

function open(code, pid) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/parties/table/${code}?pid=${pid}`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const next = (pred, ms = 5000) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("timeout")), ms);
    });
  };
  const send = (m) => ws.send(JSON.stringify(m));
  return { ws, next, send, ready: new Promise((r) => ws.addEventListener("open", r)) };
}

test("health answers", async () => {
  const r = await (await fetch(`${BASE}/health`)).json();
  assert.equal(r.ok, true);
});

test("a two-player game opens: join, start, roll, flip, claim", async () => {
  const a = open("GAME01", "alice-test-1");
  const b = open("GAME01", "bob-test-22");
  await Promise.all([a.ready, b.ready]);
  await a.next((m) => m.t === "hello");

  a.send({ t: "join", name: "Alice" });
  assert.equal((await a.next((m) => m.t === "joined")).seat, 0);
  b.send({ t: "join", name: "Bob" });
  assert.equal((await b.next((m) => m.t === "joined")).seat, 1);

  a.send({ t: "start" });
  const first = await b.next((m) => m.t === "state");
  assert.equal(first.state.phase, "AWAITING_ROLL");
  assert.deepEqual(first.state.seatMap.map((s) => s.display_name), ["Alice", "Bob"]);
  assert.ok(first.state.grid.every((g) => g.card === null));

  a.send({ t: "intent", action: { type: "REQUEST_ROLL" }, id: "r1" });
  assert.equal((await a.next((m) => m.t === "ack" && m.id === "r1")).accepted, true);
  const commit = await b.next((m) => m.t === "roll_committed");
  await b.next((m) => m.t === "state" && m.state.phase === "FLIPPING", 4000);

  a.send({ t: "intent", action: { type: "FLIP_START", idx: 4 }, id: "f1" });
  const ack = await a.next((m) => m.t === "ack" && m.id === "f1");
  assert.equal(ack.accepted, true);
  const flipped = await b.next((m) => m.t === "state" && m.state.peekingCard === 4);
  assert.ok(flipped.state.grid[4].card);
  assert.equal(flipped.state.rule[0], commit.payload.attribute);

  b.send({ t: "intent", action: { type: "CLAIM" }, id: "c1" });
  a.send({ t: "intent", action: { type: "CLAIM" }, id: "c2" });
  const grant = await a.next((m) => m.t === "claim_grant");
  assert.equal(grant.seat, 1);
  assert.equal((await a.next((m) => m.t === "ack" && m.id === "c2")).reason, "too_slow");

  a.ws.close();
  b.ws.close();
});

test("ping answers with the server clock", async () => {
  const a = open("PING01", "pinger-test-1");
  await a.ready;
  const t0 = Date.now();
  a.send({ t: "ping", id: 7, sentAt: t0 });
  const pong = await a.next((m) => m.t === "pong");
  assert.equal(pong.id, 7);
  assert.equal(pong.sentAt, t0);
  a.ws.close();
});

test("a missing player id is refused", async () => {
  const a = open("NOPID1", "x");
  await a.ready;
  assert.equal((await a.next((m) => m.t === "error")).reason, "bad_pid");
});

test("bad table codes are refused", async () => {
  const r = await fetch(`${BASE}/parties/table/bad code!`);
  assert.equal(r.status, 400);
});
