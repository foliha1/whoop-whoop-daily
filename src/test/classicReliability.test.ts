// Classic multiplayer reliability batch — one block per audit item.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import {
  SnapshotOrder,
  decideGrant,
  grantKey,
  hostLiveness,
  mayRoll,
  registerSeatsWithRetry,
  skippableSeats,
  tableUrl,
} from "@/lib/classicReliability";
import { useMultiplayerHost, useMultiplayerJoiner } from "@/hooks/useMultiplayerGame";

const noSleep = () => Promise.resolve();

// A tiny in-memory channel: records sends, lets a test deliver messages.
function fakeBus() {
  const listeners = new Set<(m: { payload: unknown }) => void>();
  const sent: unknown[] = [];
  const channel = {
    send: vi.fn((m: { payload: unknown }) => { sent.push(m.payload); return Promise.resolve("ok"); }),
  } as unknown as import("@supabase/supabase-js").RealtimeChannel;
  const onBroadcast = (l: (m: { payload: unknown }) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const deliver = (payload: unknown) => listeners.forEach((l) => l({ payload }));
  return { channel, onBroadcast, deliver, sent };
}

describe("1. seat registration gates game start", () => {
  it("a delayed success resolves true after one call", async () => {
    let resolve!: (v: { data: unknown; error: unknown }) => void;
    const call = vi.fn(() => new Promise<{ data: unknown; error: unknown }>((r) => { resolve = r; }));
    const p = registerSeatsWithRetry(call, 0, noSleep);
    let done = false;
    void p.then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false); // the game cannot start while this is pending
    resolve({ data: true, error: null });
    expect(await p).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("retries a transient failure once", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "network" } })
      .mockResolvedValueOnce({ data: true, error: null });
    expect(await registerSeatsWithRetry(call, 0, noSleep)).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("a persistent failure returns false (lobby stays on Starting… with retry)", async () => {
    const call = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await registerSeatsWithRetry(call, 0, noSleep)).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("data:false is a failure, not a success", async () => {
    const call = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await registerSeatsWithRetry(call, 0, noSleep)).toBe(false);
  });
  it("the window awaits registration before setting the gameId", () => {
    const src = readFileSync("src/components/MultiplayerWindow.tsx", "utf8");
    const start = src.indexOf("const handleStartGame");
    const body = src.slice(start, src.indexOf("// Joiner: listen for the host's game_starting", start));
    expect(body).toMatch(/await registerSeatsWithRetry/);
    expect(body.indexOf("await registerSeatsWithRetry")).toBeLessThan(body.indexOf("setGameId(newGameId)"));
    expect(body).not.toMatch(/void supabase\.rpc\("register_room_seats"/);
  });
});

describe("2. a server win is never lost", () => {
  const src = readFileSync("supabase/functions/claim-lock/index.ts", "utf8");
  it("broadcast failure after a successful insert returns unknown, never a loss, and keeps the lock", () => {
    const ok = src.slice(src.indexOf("if (!insertErr) {"), src.indexOf('if (code === "23505")'));
    expect(ok).toMatch(/outcome: "unknown"/);
    expect(ok).not.toMatch(/won: false/);
    expect(ok).not.toMatch(/delete\(/);
  });
  it("the conflict path rebroadcasts the existing winner, scoped to the same game and window", () => {
    const conflict = src.slice(src.indexOf('if (code === "23505")'), src.indexOf("insert_failed"));
    expect(conflict).toMatch(/\.eq\("game_id", game_id\)/);
    expect(conflict).toMatch(/\.eq\("claim_window", claim_window\)/);
    // Rebroadcast carries the ORIGINAL win time so resume ordering stays fair.
    expect(conflict).toMatch(/broadcastGrant\(supabase, room_id, game_id, claim_window, existing\.player_seat, Date\.parse\(existing\.created_at\)\)/);
  });
  it("grants carry game_id and never a browser id", () => {
    const fn = src.slice(src.indexOf("async function broadcastGrant"));
    expect(fn).toMatch(/game_id/);
    expect(fn).not.toMatch(/visitor_id/);
  });

  it("client: unknown then a retry that heals it resolves to won", async () => {
    vi.resetModules();
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { won: null, outcome: "unknown", winner_seat: 1, claim_window: 3 }, error: null })
      .mockResolvedValueOnce({ data: { won: false, winner_seat: 1, claim_window: 3 }, error: null });
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
    vi.doMock("@/lib/animationTiming", () => ({ CLAIM_LOCK_RETRIES: 2, CLAIM_LOCK_RETRY_DELAY_MS: 0 }));
    const { callClaimLock } = await import("@/lib/claimLock");
    const r = await callClaimLock({ room_id: "r", game_id: "g", claim_window: 3, player_seat: 1, visitor_id: "v" });
    expect(r.outcome).toBe("won");
    expect(invoke).toHaveBeenCalledTimes(2);
    vi.doUnmock("@/integrations/supabase/client");
    vi.doUnmock("@/lib/animationTiming");
  });
});

describe("5 / correction 1. grants apply only to the current game's open window", () => {
  it("two fresh games, same window and seat: the second game's grant applies", () => {
    const handled = new Set([grantKey("game-1", 0, 1)]);
    expect(decideGrant({
      grantGameId: "game-2", currentGameId: "game-2", grantWindow: 0, openWindow: 0,
      alreadyHandled: handled.has(grantKey("game-2", 0, 1)), windowResolved: false,
    })).toBe("apply");
  });
  it("a repeat of the same grant is ignored", () => {
    expect(decideGrant({
      grantGameId: "g", currentGameId: "g", grantWindow: 2, openWindow: 2, alreadyHandled: true, windowResolved: true,
    })).toBe("ignore");
  });
  it("a grant for a finished window arriving after the next roll does nothing", () => {
    // window 2 resolved (seat 1 won); round advanced; window 3 is open.
    expect(decideGrant({
      grantGameId: "g", currentGameId: "g", grantWindow: 2, openWindow: 3, alreadyHandled: false, windowResolved: true,
    })).toBe("ignore");
  });
  it("a grant from another game is ignored even for a matching window", () => {
    expect(decideGrant({
      grantGameId: "old", currentGameId: "new", grantWindow: 0, openWindow: 0, alreadyHandled: false, windowResolved: false,
    })).toBe("ignore");
  });
  it("host hook: a late rebroadcast for a closed window never reopens a claim", async () => {
    const bus = fakeBus();
    const seatMap = [
      { seat: 0, pid: "host", display_name: "H" },
      { seat: 1, pid: "k1", display_name: "J" },
    ];
    const { result } = renderHook(() =>
      useMultiplayerHost({
        channel: bus.channel, onBroadcast: bus.onBroadcast, seatMap, hostVisitorId: "host",
        enabled: true, gameId: "g1", roomId: "r1", disconnectedSeats: [], presenceStatus: "connected",
      }),
    );
    await act(async () => { await Promise.resolve(); });
    // Window 0 is open; a grant for game g0 (a previous game) arrives.
    await act(async () => {
      bus.deliver({ v: 2, type: "claim_grant", seq: 0, payload: { claim_window: 0, seat: 1, game_id: "g0" } });
    });
    expect(result.current.state.claimBy).toBeNull();
    expect(bus.sent.some((p) => (p as { type?: string }).type === "claim_reject")).toBe(false);
  });
});

describe("correction 2. joiner snapshot ordering is scoped per game", () => {
  it("a late snapshot from game one arriving during game two is ignored", () => {
    const o = new SnapshotOrder();
    expect(o.accept("g1", 40)).toBe(true);
    expect(o.accept("g2", 41)).toBe(true);
    expect(o.accept("g1", 42)).toBe(false);
    expect(o.current).toBe("g2");
  });
  it("within a game, older or repeated seqs are dropped", () => {
    const o = new SnapshotOrder();
    o.accept("g", 5);
    expect(o.accept("g", 5)).toBe(false);
    expect(o.accept("g", 4)).toBe(false);
    expect(o.accept("g", 6)).toBe(true);
  });
  it("a reloaded host (seq restarts) with a new game is accepted", () => {
    const o = new SnapshotOrder();
    o.accept("g1", 900);
    expect(o.accept("g2", 1)).toBe(true);
  });
});

describe("3. state request catch-up", () => {
  it("joiner asks on subscribe and again on reconnect; accepts the reply", async () => {
    const bus = fakeBus();
    const { result, rerender } = renderHook(
      ({ epoch }) => useMultiplayerJoiner({
        channel: bus.channel, onBroadcast: bus.onBroadcast, mySeat: null, visitorId: "k1", enabled: true, connectEpoch: epoch,
      }),
      { initialProps: { epoch: 1 } },
    );
    const requests = () => bus.sent.filter((p) => (p as { type?: string }).type === "state_request").length;
    expect(requests()).toBe(1);
    rerender({ epoch: 2 });
    expect(requests()).toBe(2);
    await act(async () => {
      bus.deliver({ v: 2, type: "state", seq: 7, payload: { gameId: "g", seatMap: [{ seat: 1, pid: "k1", display_name: "J" }] } });
    });
    expect(result.current.mySeat).toBe(1);
  });
  it("joiner asks again when the tab becomes visible", () => {
    const bus = fakeBus();
    renderHook(() => useMultiplayerJoiner({
      channel: bus.channel, onBroadcast: bus.onBroadcast, mySeat: null, visitorId: "k1", enabled: true,
    }));
    const before = bus.sent.length;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 5000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(bus.sent.length).toBe(before + 1);
    vi.restoreAllMocks();
  });
  it("host replies to a state_request with a full snapshot", async () => {
    const bus = fakeBus();
    const seatMap = [
      { seat: 0, pid: "host", display_name: "H" },
      { seat: 1, pid: "k1", display_name: "J" },
    ];
    renderHook(() => useMultiplayerHost({
      channel: bus.channel, onBroadcast: bus.onBroadcast, seatMap, hostVisitorId: "host",
      enabled: true, gameId: "g1", roomId: "r1", disconnectedSeats: [], presenceStatus: "connected",
    }));
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const before = bus.sent.filter((p) => (p as { type?: string }).type === "state").length;
    await act(async () => { bus.deliver({ v: 2, type: "state_request", seq: 0, payload: {} }); });
    const states = bus.sent.filter((p) => (p as { type?: string }).type === "state") as Array<{ payload: { gameId: string } }>;
    expect(states.length).toBe(before + 1);
    expect(states[states.length - 1].payload.gameId).toBe("g1");
  });
});

describe("4. table kept in the URL (reload, incl. typed-code joiner)", () => {
  it("adds r=CODE and keeps other params", () => {
    expect(tableUrl("", "ABC123")).toBe("/classic.html?r=ABC123");
    expect(tableUrl("?mode=multiplayer", "ABC123")).toBe("/classic.html?mode=multiplayer&r=ABC123");
    expect(tableUrl("?r=ABC123", null)).toBe("/classic.html");
  });
  it("both creating and joining (link or typed code) record the table; a remembered reload rejoins directly", () => {
    const src = readFileSync("src/components/MultiplayerWindow.tsx", "utf8");
    expect((src.match(/rememberTable\(room\.room_code\)/g) ?? []).length).toBe(2);
    expect(src).toMatch(/history\.replaceState/);
    expect(src).toMatch(/remembered === normalized[\s\S]{0,120}enterRoom\(\{ kind: "join-code"/);
  });
});

describe("6. only the current roller can roll", () => {
  let randSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { randSpy = vi.spyOn(Math, "random").mockReturnValue(0); });
  afterEach(() => randSpy.mockRestore());
  it("mayRoll", () => {
    expect(mayRoll(0, 0)).toBe(true);
    expect(mayRoll(1, 0)).toBe(false);
  });
  it("a stale REQUEST_ROLL from a non-roller seat is ignored", async () => {
    const bus = fakeBus();
    const seatMap = [
      { seat: 0, pid: "host", display_name: "H" },
      { seat: 1, pid: "k1", display_name: "J" },
    ];
    const { result } = renderHook(() => useMultiplayerHost({
      channel: bus.channel, onBroadcast: bus.onBroadcast, seatMap, hostVisitorId: "host",
      enabled: true, gameId: "g1", roomId: "r1", disconnectedSeats: [], presenceStatus: "connected",
    }));
    expect(result.current.state.roller).toBe(0);
    await act(async () => {
      bus.deliver({ v: 2, type: "intent", seq: 1, payload: { seat: 1, pid: "k1", action: { type: "REQUEST_ROLL" } } });
    });
    expect(bus.sent.some((p) => (p as { type?: string }).type === "roll_committed")).toBe(false);
    await act(async () => { result.current.commitAndRoll(0); });
    expect(bus.sent.some((p) => (p as { type?: string }).type === "roll_committed")).toBe(true);
  });
});

describe("7. a phone blinking is not a player leaving", () => {
  const seats = [{ seat: 0, pid: "host" }, { seat: 1, pid: "k1" }];
  it("joiner: missing from presence but heartbeat fresh → not skippable", () => {
    expect(skippableSeats(seats, [], [])).toEqual([]);
  });
  it("joiner: heartbeat stale past the grace → skippable", () => {
    expect(skippableSeats(seats, ["k1"], [])).toEqual([1]);
    expect(skippableSeats(seats, [], ["k1"])).toEqual([1]);
  });
  it("host: a brief presence drop shows waiting, not host-left", () => {
    expect(hostLiveness({ hostKey: "host", presentKeys: [], staleKeys: [] })).toBe("waiting");
    expect(hostLiveness({ hostKey: "host", presentKeys: ["host"], staleKeys: [] })).toBe("here");
  });
  it("host: stale heartbeat by the existing thresholds → gone", () => {
    expect(hostLiveness({ hostKey: "host", presentKeys: [], staleKeys: ["host"] })).toBe("gone");
  });
  it("the window no longer ends the game on presence absence alone", () => {
    const src = readFileSync("src/components/MultiplayerWindow.tsx", "utf8");
    expect(src).not.toMatch(/if \(!hostStillHere\)/);
    expect(src).toMatch(/hostState === "gone"\) setView\(\{ kind: "host-left" \}\)/);
  });
});
