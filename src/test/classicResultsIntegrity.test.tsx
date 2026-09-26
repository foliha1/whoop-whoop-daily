// Security pass 2 — Classic results integrity (client + edge-function side).
// The database rules themselves are exercised live against the backend; these
// cover what the app sends and the arbiter's key check.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const calls = vi.hoisted(() => ({
  start: vi.fn(async () => "11111111-1111-4111-8111-111111111111" as string | null),
  saveSolo: vi.fn(async () => true),
  saveMulti: vi.fn(async () => true),
}));
vi.mock("@/lib/classicResults", async (orig) => {
  const real = await orig<typeof import("@/lib/classicResults")>();
  return {
    ...real,
    startSoloGame: calls.start,
    saveSoloGame: calls.saveSolo,
    saveClassicGame: calls.saveMulti,
  };
});

import { useClassicResultRecorder, type ClassicSnapshot } from "@/hooks/useClassicResultRecorder";
import { endReasonFor } from "@/lib/classicResults";
import { verifySeatOwner } from "../../supabase/functions/_shared/seatOwnership";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const snap = (o: Partial<ClassicSnapshot>): ClassicSnapshot => ({
  phase: "AWAITING_ROLL", settleKind: null, scores: [0, 0], names: ["A", "B"], roundNum: 1, gameId: G1, ...o,
});

beforeEach(() => {
  calls.start.mockClear(); calls.saveSolo.mockClear(); calls.saveMulti.mockClear();
});

describe("end reason", () => {
  it("12 or 13 is a target finish; otherwise table-empty (warning) or stalled", () => {
    expect(endReasonFor([12, 3], "info")).toBe("target");
    expect(endReasonFor([4, 13], "info")).toBe("target");
    expect(endReasonFor([4, 3], "warning")).toBe("table_empty");
    expect(endReasonFor([4, 3], "info")).toBe("stalled");
  });
});

describe("multiplayer recorder", () => {
  it("sends room, game, host key and final board — never times or identity", async () => {
    const { rerender } = renderHook((s: ClassicSnapshot) =>
      useClassicResultRecorder({ snapshot: s, isSolo: false, enabled: true, visitorId: "v-host", roomId: "r1", playerKey: "k-host" }),
      { initialProps: snap({}) });
    rerender(snap({ phase: "GAME_OVER", scores: [12, 4] }));
    expect(calls.saveMulti).toHaveBeenCalledTimes(1);
    const arg = calls.saveMulti.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({ roomId: "r1", gameId: G1, visitorId: "v-host", playerKey: "k-host", endReason: "target" });
    expect(arg).not.toHaveProperty("startedAt");
    expect(arg).not.toHaveProperty("endedAt");
    expect(arg).not.toHaveProperty("hostVisitorId");
  });

  it("does not save without the host's session key", () => {
    const { rerender } = renderHook((s: ClassicSnapshot) =>
      useClassicResultRecorder({ snapshot: s, isSolo: false, enabled: true, visitorId: "v", roomId: "r1", playerKey: null }),
      { initialProps: snap({}) });
    rerender(snap({ phase: "GAME_OVER", scores: [12, 4] }));
    expect(calls.saveMulti).not.toHaveBeenCalled();
  });

  it("a rematch on a new registered id saves its own result", () => {
    const { rerender } = renderHook((s: ClassicSnapshot) =>
      useClassicResultRecorder({ snapshot: s, isSolo: false, enabled: true, visitorId: "v", roomId: "r1", playerKey: "k" }),
      { initialProps: snap({}) });
    rerender(snap({ phase: "GAME_OVER", scores: [12, 4] }));
    rerender(snap({ gameId: G2 }));
    rerender(snap({ gameId: G2, phase: "GAME_OVER", scores: [3, 13] }));
    expect(calls.saveMulti.mock.calls.map((c) => (c[0] as { gameId: string }).gameId)).toEqual([G1, G2]);
  });

  it("the rematch button registers a fresh game id before re-dealing", () => {
    const src = read("src/components/MultiplayerWindow.tsx");
    const body = src.slice(src.indexOf("async function startRematch"), src.indexOf("async function startRematch") + 1600);
    expect(body).toMatch(/register_room_seats_by_pid/);
    expect(body).toMatch(/setGameId\(nextId\)/);
    expect(body.indexOf("setGameId(nextId)")).toBeLessThan(body.indexOf('type: "INIT"'));
    expect(src).toMatch(/action\.type === "NEW_GAME"\) \{\s*\/\/[^\n]*\n\s*void startRematch\(\)/);
  });
});

describe("solo recorder", () => {
  it("asks the server for a game id when the game begins and saves against it", async () => {
    const { rerender } = renderHook((s: ClassicSnapshot) =>
      useClassicResultRecorder({ snapshot: s, isSolo: true, enabled: true, visitorId: "v-solo" }),
      { initialProps: snap({ gameId: "solo-game" }) });
    expect(calls.start).toHaveBeenCalledWith("v-solo");
    rerender(snap({ gameId: "solo-game", phase: "GAME_OVER", scores: [12, 5] }));
    await waitFor(() => expect(calls.saveSolo).toHaveBeenCalledTimes(1));
    expect(calls.saveSolo.mock.calls[0][0]).toMatchObject({ gameId: "11111111-1111-4111-8111-111111111111", endReason: "target" });
  });

  it("without a server-issued id nothing is saved", async () => {
    calls.start.mockResolvedValueOnce(null);
    const { rerender } = renderHook((s: ClassicSnapshot) =>
      useClassicResultRecorder({ snapshot: s, isSolo: true, enabled: true, visitorId: "v-solo" }),
      { initialProps: snap({ gameId: "solo-game" }) });
    rerender(snap({ gameId: "solo-game", phase: "GAME_OVER", scores: [12, 5] }));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.saveSolo).not.toHaveBeenCalled();
  });
});

describe("claim arbiter seat key", () => {
  const client = (row: { visitor_id: string; player_key: string | null } | null) => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) }),
  }) as never;
  const seat = { visitor_id: "v1", player_key: "secret-1" };
  const base = { room_id: "r", game_id: "g", seat: 1, visitor_id: "v1" };

  it("right browser id but wrong key is refused", async () => {
    expect(await verifySeatOwner(client(seat), { ...base, player_key: "guess" })).toEqual({ ok: false, reason: "bad_seat_key" });
  });
  it("an empty key is refused", async () => {
    expect(await verifySeatOwner(client(seat), { ...base, player_key: "" })).toEqual({ ok: false, reason: "missing_seat_key" });
  });
  it("the right key is accepted", async () => {
    expect(await verifySeatOwner(client(seat), { ...base, player_key: "secret-1" })).toEqual({ ok: true });
  });
  it("until publish day, a tab that sends no key still works", async () => {
    expect(await verifySeatOwner(client(seat), base)).toEqual({ ok: true });
  });
  it("the app sends its key to the arbiter and to release-lock", () => {
    expect(read("src/components/MultiplayerGameView.tsx")).toMatch(/player_key: playerKey/);
    expect(read("src/hooks/useMultiplayerGame.ts")).toMatch(/player_key: hostSessionKey/);
  });
});
