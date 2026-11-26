// Live smoke test for the table server (run by .github/workflows/table-smoke.yml).
// Makes a throwaway room with two members through the same public database
// functions the app uses, connects two phones to the LIVE table server,
// checks in, starts, rolls, flips and claims, and prints every message.
// The room code is printed so the test rows can be deleted afterwards.
import { webcrypto } from "node:crypto";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const ORIGIN = process.env.TABLE_ORIGIN ?? "wss://whoop-whoop-tables.felixfoliha.workers.dev";

const headers = { apikey: KEY, "Content-Type": "application/json" };
async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`[rpc] ${fn} -> ${res.status} ${text.slice(0, 200)}`);
  return res.ok ? JSON.parse(text) : null;
}
async function pubkey() {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", kp.publicKey));
  return Buffer.from(raw).toString("base64");
}
const rid = () => webcrypto.randomUUID();

function phone(label, code, pid) {
  const ws = new WebSocket(`${ORIGIN}/parties/table/${code}?pid=${pid}`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const brief = m.t === "state" ? `state seq=${m.seq} phase=${m.state.phase} claimBy=${m.state.claimBy} paused=${m.state.paused}` : JSON.stringify(m).slice(0, 220);
    console.log(`[${label}] ${new Date().toISOString().slice(11, 23)} ${brief}`);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  ws.addEventListener("close", (e) => console.log(`[${label}] closed ${e.code} ${e.reason}`));
  ws.addEventListener("error", () => console.log(`[${label}] socket error`));
  const next = (pred, ms = 8000) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error(`${label}: timed out waiting`)), ms);
    });
  };
  const send = (m) => ws.send(JSON.stringify(m));
  return { ws, next, send, ready: new Promise((r) => ws.addEventListener("open", r)) };
}

const hostV = `smoke-${rid()}`;
const guestV = `smoke-${rid()}`;
const hostKey = rid();
const guestKey = rid();
const room = (await rpc("create_room", { p_visitor_id: hostV }))?.[0];
if (!room) throw new Error("create_room failed");
console.log(`ROOM_CODE=${room.room_code} ROOM_ID=${room.id}`);
const h = (await rpc("join_room_session", { p_room_id: room.id, p_visitor_id: hostV, p_player_key: hostKey, p_sign_pubkey: await pubkey(), p_display_name: "Smoke Host" }))?.[0];
const g = (await rpc("join_room_session", { p_room_id: room.id, p_visitor_id: guestV, p_player_key: guestKey, p_sign_pubkey: await pubkey(), p_display_name: "Smoke Guest" }))?.[0];
console.log("host", h, "guest", g);
await rpc("table_member", { p_room_id: room.id, p_visitor_id: hostV, p_player_key: hostKey });

const A = phone("host", room.room_code, h.pub_id);
const B = phone("guest", room.room_code, g.pub_id);
await Promise.all([A.ready, B.ready]);
await A.next((m) => m.t === "hello");
await B.next((m) => m.t === "hello");
A.send({ t: "join", roomId: room.id, visitorId: hostV, playerKey: hostKey });
B.send({ t: "join", roomId: room.id, visitorId: guestV, playerKey: guestKey });
let ok = true;
try {
  await A.next((m) => m.t === "joined" || m.t === "error");
  await B.next((m) => m.t === "joined" || m.t === "error");
  const t0 = Date.now();
  A.send({ t: "start", seats: [{ pid: h.pub_id, name: h.display_name }, { pid: g.pub_id, name: g.display_name }] });
  await B.next((m) => m.t === "state" || m.t === "error");
  console.log(`START took ${Date.now() - t0} ms`);
  A.send({ t: "intent", action: { type: "REQUEST_ROLL" }, id: "r" });
  await B.next((m) => m.t === "state" && m.state.phase === "FLIPPING", 6000);
  const t1 = Date.now();
  A.send({ t: "intent", action: { type: "FLIP_START", idx: 4 }, id: "f" });
  await B.next((m) => m.t === "state" && m.state.peekingCard === 4);
  console.log(`FLIP seen by guest after ${Date.now() - t1} ms`);
  const t2 = Date.now();
  B.send({ t: "intent", action: { type: "CLAIM" }, id: "c" });
  await B.next((m) => m.t === "ack" && m.id === "c");
  console.log(`CLAIM answered after ${Date.now() - t2} ms`);
  await A.next((m) => m.t === "state" && m.state.claimBy === 1);
  console.log(`CLAIM seen by host after ${Date.now() - t2} ms`);
} catch (e) {
  ok = false;
  console.log("FAILED:", e.message);
}
A.ws.close();
B.ws.close();
await new Promise((r) => setTimeout(r, 1000));
console.log(ok ? "SMOKE OK" : "SMOKE FAILED");
process.exit(ok ? 0 : 1);
