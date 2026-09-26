// Security pass 1: the Classic room channel is signed. Keys come from the
// server only (here: a fake key directory), and anything that fails to
// verify never reaches game code.

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook } from "@testing-library/react";
import {
  KEY_REFETCH_MIN_MS,
  KeyDirectory,
  NonceStore,
  canonical,
  createVerifier,
  generateSigningKey,
  randomNonce,
  signEnvelope,
  signingStats,
  type SignKeyRow,
  type SigningKey,
} from "@/lib/channelSigning";
import { useMultiplayerHost } from "@/hooks/useMultiplayerGame";

const ROOM = "room-1";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

async function table(n: number) {
  const keys: SigningKey[] = [];
  for (let i = 0; i < n; i++) keys.push(await generateSigningKey());
  // keys[0] is the host; seat i is played by keys[i] with pid `p${i}`.
  const rows: SignKeyRow[] = [
    { role: "host", seat: null, pub_id: "p0", sign_pubkey: keys[0].publicKeyB64 },
    ...keys.map((k, i) => ({ role: "seat", seat: i, pub_id: `p${i}`, sign_pubkey: k.publicKeyB64 })),
  ];
  return { keys, rows };
}

async function dirFor(rowsRef: { rows: SignKeyRow[] }) {
  const fetchRows = vi.fn(async () => rowsRef.rows);
  const d = new KeyDirectory(fetchRows);
  await d.refresh(true);
  return { d, fetchRows };
}

const state = (seq: number) => ({ v: 2, type: "state", seq, payload: { gameId: "g1", seatMap: [] } });
const intent = (seat: number, pid: string, nonce = randomNonce()) => ({
  v: 2, type: "intent", seq: 1,
  payload: { seat, pid, gameId: "g1", nonce, sentAt: Date.now(), action: { type: "REQUEST_ROLL" } },
});

afterEach(() => vi.useRealTimers());

describe("1. host messages must be signed by the host", () => {
  it("drops a state message signed by a non-host key, accepts the host's", async () => {
    const { keys, rows } = await table(3);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    expect(await verify(await signEnvelope(state(1), "p0", keys[0].privateKey, ROOM))).toBe(true);
    // A seated player pretending to be the host (own id, or the host's id).
    expect(await verify(await signEnvelope(state(2), "p1", keys[1].privateKey, ROOM))).toBe(false);
    expect(await verify(await signEnvelope(state(3), "p0", keys[1].privateKey, ROOM))).toBe(false);
    // Unsigned, and tampered-after-signing.
    expect(await verify(state(4))).toBe(false);
    const signed = await signEnvelope(state(5), "p0", keys[0].privateKey, ROOM);
    expect(await verify({ ...signed, seq: 6 })).toBe(false);
    // Same signature, different room.
    const other = createVerifier({ roomId: "room-2", role: "joiner", directory: d });
    expect(await other(signed)).toBe(false);
  });

  it("drops game_starting, roll and events that are not host-signed", async () => {
    const { keys, rows } = await table(2);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    for (const m of [
      { kind: "game_starting" },
      { v: 2, type: "roll_committed", seq: 1, payload: {} },
      { v: 2, type: "event", seq: 1, payload: {} },
      { v: 2, type: "claim_reject", seq: 1, payload: {} },
    ]) {
      expect(await verify(await signEnvelope(m, "p1", keys[1].privateKey, ROOM))).toBe(false);
      expect(await verify(await signEnvelope(m, "p0", keys[0].privateKey, ROOM))).toBe(true);
    }
  });
});

describe("2. an intent can only act for its sender's own seat", () => {
  it("drops an intent signed with seat 1's key that claims seat 2", async () => {
    const { keys, rows } = await table(3);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "host", directory: d });
    expect(await verify(await signEnvelope(intent(1, "p1"), "p1", keys[1].privateKey, ROOM))).toBe(true);
    // Claims seat 2 with its own id.
    expect(await verify(await signEnvelope(intent(2, "p1"), "p1", keys[1].privateKey, ROOM))).toBe(false);
    // Claims to BE seat 2 (seat 2's public id) but signs with seat 1's key.
    expect(await verify(await signEnvelope(intent(2, "p2"), "p2", keys[1].privateKey, ROOM))).toBe(false);
    // Joiners never act on intents.
    const joiner = createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    expect(await joiner(await signEnvelope(intent(1, "p1"), "p1", keys[1].privateKey, ROOM))).toBe(false);
  });

  it("heartbeats must come from the id they name", async () => {
    const { keys, rows } = await table(3);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "host", directory: d });
    const hb = (pid: string) => ({ v: 2, type: "heartbeat", seq: 1, payload: { pid, at: 1, hidden: false } });
    expect(await verify(await signEnvelope(hb("p1"), "p1", keys[1].privateKey, ROOM))).toBe(true);
    expect(await verify(await signEnvelope(hb("p2"), "p1", keys[1].privateKey, ROOM))).toBe(false);
  });
});

describe("3. replayed intents are dropped", () => {
  it("NonceStore accepts a nonce once per game and refuses stale times", () => {
    const store = new NonceStore("g1");
    const n = randomNonce();
    expect(store.accept(n, 1000, 1000)).toBe(true);
    expect(store.accept(n, 1000, 1000)).toBe(false);
    expect(store.accept(randomNonce(), 0, 11 * 60 * 1000)).toBe(false);
    expect(store.accept(undefined, 1000, 1000)).toBe(false);
  });

  it("the host applies a replayed intent only once, and ignores other games", async () => {
    const sent: Array<{ type?: string }> = [];
    const listeners = new Set<(m: { payload: unknown }) => void>();
    const channel = { send: (m: { payload: { type?: string } }) => { sent.push(m.payload); return Promise.resolve("ok"); } };
    const deliver = (payload: unknown) => listeners.forEach((l) => l({ payload }));
    // Seat 0 (the first roller) is a joiner, so its REQUEST_ROLL is honoured.
    const seatMap = [
      { seat: 0, pid: "p1", display_name: "A" },
      { seat: 1, pid: "p0", display_name: "H" },
    ];
    renderHook(() => useMultiplayerHost({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: channel as any,
      onBroadcast: (l) => { listeners.add(l); return () => listeners.delete(l); },
      seatMap, hostVisitorId: "p0", enabled: true, gameId: "g1", roomId: ROOM,
      disconnectedSeats: [], presenceStatus: "connected",
    }));
    const rolls = () => sent.filter((p) => p.type === "roll_committed").length;
    const env = {
      v: 2, type: "intent", seq: 1,
      payload: { seat: 0, pid: "p1", gameId: "g1", nonce: "nonce-replay-000001", sentAt: Date.now(), action: { type: "REQUEST_ROLL" } },
    };
    // Wrong game first: ignored outright.
    await act(async () => { deliver({ ...env, payload: { ...env.payload, gameId: "g0", nonce: "nonce-other-game-01" } }); });
    expect(rolls()).toBe(0);
    await act(async () => { deliver(env); });
    expect(rolls()).toBe(1);
    await act(async () => { deliver(env); deliver(env); });
    expect(rolls()).toBe(1);
  });
});

describe("4. refreshes", () => {
  it("host refresh mid-game: joiners refetch once and trust the new host key", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { keys, rows } = await table(3);
    const ref = { rows };
    const { d, fetchRows } = await dirFor(ref);
    const verify = createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    expect(await verify(await signEnvelope(state(1), "p0", keys[0].privateKey, ROOM))).toBe(true);

    // Host reloads: new key pair, new public id, registered on the server.
    const fresh = await generateSigningKey();
    ref.rows = [{ role: "host", seat: null, pub_id: "p0b", sign_pubkey: fresh.publicKeyB64 }, ...rows.slice(1)];
    vi.setSystemTime(Date.now() + KEY_REFETCH_MIN_MS + 1);
    const calls = fetchRows.mock.calls.length;
    expect(await verify(await signEnvelope(state(1), "p0b", fresh.privateKey, ROOM))).toBe(true);
    expect(fetchRows.mock.calls.length).toBe(calls + 1);
    expect(d.hostPid).toBe("p0b");
    // The old host key is no longer trusted.
    expect(await verify(await signEnvelope(state(2), "p0", keys[0].privateKey, ROOM))).toBe(false);
  });

  it("forged traffic cannot make a joiner hammer the server", async () => {
    const { keys, rows } = await table(2);
    const { d, fetchRows } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    const calls = fetchRows.mock.calls.length;
    for (let i = 0; i < 20; i++) {
      expect(await verify(await signEnvelope(state(i), "p1", keys[1].privateKey, ROOM))).toBe(false);
    }
    expect(fetchRows.mock.calls.length).toBeLessThanOrEqual(calls + 1);
  });

  it("joiner refresh mid-game: the host accepts the rebound seat's new key", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { keys, rows } = await table(3);
    const ref = { rows };
    const { d } = await dirFor(ref);
    const verify = createVerifier({ roomId: ROOM, role: "host", directory: d });
    const fresh = await generateSigningKey();
    // Server rebinds seat 1 to the reloaded tab's new id and key.
    ref.rows = rows.map((r) => (r.seat === 1 ? { ...r, pub_id: "p1b", sign_pubkey: fresh.publicKeyB64 } : r));
    vi.setSystemTime(Date.now() + KEY_REFETCH_MIN_MS + 1);
    expect(await verify(await signEnvelope(intent(1, "p1b"), "p1b", fresh.privateKey, ROOM))).toBe(true);
    expect(await verify(await signEnvelope(intent(1, "p1"), "p1", keys[1].privateKey, ROOM))).toBe(false);
  });
});

describe("5. a normal 3-player game is unchanged by signing", () => {
  it("every host broadcast of a real game verifies at both joiners, content intact", async () => {
    const { keys, rows } = await table(3);
    const sent: Array<Record<string, unknown>> = [];
    const channel = { send: (m: { payload: Record<string, unknown> }) => { sent.push(m.payload); return Promise.resolve("ok"); } };
    const seatMap = [0, 1, 2].map((i) => ({ seat: i, pid: `p${i}`, display_name: `P${i}` }));
    const { result } = renderHook(() => useMultiplayerHost({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: channel as any, onBroadcast: () => () => {},
      seatMap, hostVisitorId: "p0", enabled: true, gameId: "g1", roomId: ROOM,
      disconnectedSeats: [], presenceStatus: "connected",
    }));
    await act(async () => { result.current.commitAndRoll(0); });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(sent.length).toBeGreaterThan(0);
    const joiners = await Promise.all([1, 2].map(async () => {
      const { d } = await dirFor({ rows });
      return createVerifier({ roomId: ROOM, role: "joiner", directory: d });
    }));
    for (const env of sent) {
      const signed = await signEnvelope(env, "p0", keys[0].privateKey, ROOM);
      const { from: _f, sig: _s, ...content } = signed;
      expect(canonical(content)).toBe(canonical(env));
      for (const v of joiners) expect(await v(signed)).toBe(true);
    }
    const stats = signingStats();
    expect(stats.sign.n).toBeGreaterThan(0);
    expect(stats.verify.n).toBeGreaterThan(0);
  });
});

describe("6. player_key never goes on the channel", () => {
  it("no channel code or wire type carries player_key", () => {
    for (const f of [
      "src/lib/multiplayer.ts",
      "src/lib/publicState.ts",
      "src/hooks/useRoomPresence.ts",
      "src/hooks/useHeartbeat.ts",
      "src/hooks/useMultiplayerGame.ts",
      "src/components/MultiplayerGameView.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/player_key/);
    }
    // The server functions send public ids only.
    const claim = read("supabase/functions/claim-lock/index.ts");
    expect(claim).not.toMatch(/grantPayload\.player_key/);
    expect(claim).toMatch(/grantPayload\.pid = seatRow\.pub_id/);
  });

  it("the session key only travels to the server", () => {
    const win = read("src/components/MultiplayerWindow.tsx");
    // sessionKey is only ever passed to the two RPC wrappers.
    const uses = win.match(/sessionKey/g) ?? [];
    const rpcUses = win.match(/(joinRoomSessionSigned|fetchSignKeys)\([^)]*sessionKey/g) ?? [];
    expect(rpcUses.length).toBe(2);
    // declaration + 2 RPC uses + effect deps
    expect(uses.length).toBe(4);
  });
});

describe("7. claim grants must be server-signed", () => {
  it("the host drops a grant not signed by the server key", async () => {
    const { keys, rows } = await table(2);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({ roomId: ROOM, role: "host", directory: d });
    const grant = { v: 2, type: "claim_grant", seq: 0, payload: { claim_window: 0, seat: 1, game_id: "g1" } };
    expect(await verify(grant)).toBe(false);
    expect(await verify(await signEnvelope(grant, "server", keys[1].privateKey, ROOM))).toBe(false);
    expect(await verify(await signEnvelope(grant, "p1", keys[1].privateKey, ROOM))).toBe(false);
  });

  it("a grant signed with the real server key format verifies", async () => {
    const fake = await generateSigningKey();
    const { rows } = await table(2);
    const { d } = await dirFor({ rows });
    const verify = createVerifier({
      roomId: ROOM, role: "host", directory: d,
      serverKeyOverride: () => crypto.subtle.importKey("raw", Uint8Array.from(atob(fake.publicKeyB64), (c) => c.charCodeAt(0)), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]),
    });
    const grant = { v: 2, type: "claim_grant", seq: 0, payload: { claim_window: 0, seat: 1, game_id: "g1" } };
    expect(await verify(await signEnvelope(grant, "server", fake.privateKey, ROOM))).toBe(true);
  });

  it("server and client canonical encodings are identical", () => {
    const body = (src: string) => {
      const a = src.indexOf("export function canonical");
      return src.slice(a, src.indexOf("\n}\n", a)).replace(/\s+/g, "");
    };
    expect(body(read("supabase/functions/_shared/classicSign.ts"))).toBe(body(read("src/lib/channelSigning.ts")));
    expect(read("supabase/functions/_shared/classicSign.ts")).toContain("`ww-classic:v2:${roomId}:${canonical(body)}`");
  });

  it("the server private key never ships in the app", () => {
    const client = read("src/lib/channelSigning.ts");
    expect(client).not.toMatch(/CLASSIC_SIGNING_SEED/);
    expect(read("supabase/functions/_shared/classicSign.ts")).toMatch(/Deno\.env\.get\("CLASSIC_SIGNING_SEED"\)/);
  });
});
