// The server's Supabase calls, against a fake fetch.
import { describe, expect, it } from "vitest";
import { SupabaseRpc, SERVER_APP_VERSION } from "../src/supabase";

const ROOM = "22222222-2222-4222-8222-222222222222";
const GAME = "33333333-3333-4333-8333-333333333333";
const env = { SUPABASE_URL: "https://db.example", SUPABASE_ANON_KEY: "anon" };

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("SupabaseRpc", () => {
  it("checks a seat key with table_member using the public key", async () => {
    const f = fakeFetch([{ pub_id: "abc123", display_name: "Ana", is_host: true, room_code: "WHOOP1" }]);
    const rpc = new SupabaseRpc(env, f.fn);
    const m = await rpc.member(ROOM, "visitor-1", "k".repeat(20));
    expect(m).toEqual({ pubId: "abc123", displayName: "Ana", isHost: true, roomCode: "WHOOP1" });
    expect(f.calls[0].url).toBe("https://db.example/rest/v1/rpc/table_member");
    expect(f.calls[0].headers.apikey).toBe("anon");
    expect(f.calls[0].body).toEqual({ p_room_id: ROOM, p_visitor_id: "visitor-1", p_player_key: "k".repeat(20) });
  });

  it("a wrong key, a bad room id or a failed call seats nobody", async () => {
    expect(await new SupabaseRpc(env, fakeFetch([]).fn).member(ROOM, "v", "k".repeat(20))).toBeNull();
    expect(await new SupabaseRpc(env, fakeFetch([], 500).fn).member(ROOM, "v", "k".repeat(20))).toBeNull();
    const f = fakeFetch([{ pub_id: "x" }]);
    expect(await new SupabaseRpc(env, f.fn).member("not-a-uuid", "v", "k")).toBeNull();
    expect(f.calls).toHaveLength(0);
    expect(await new SupabaseRpc({}, f.fn).member(ROOM, "v", "k".repeat(20))).toBeNull();
  });

  it("registers seats and saves results with the host's credentials", async () => {
    const f = fakeFetch(true);
    const rpc = new SupabaseRpc(env, f.fn);
    const host = { roomId: ROOM, visitorId: "host-visitor", playerKey: "h".repeat(20) };
    expect(await rpc.registerGame(host, GAME, [{ seat: 0, pid: "p0", display_name: "Ana" }])).toBe(true);
    expect(f.calls[0].body).toEqual({
      p_room_id: ROOM,
      p_game_id: GAME,
      p_host_visitor_id: "host-visitor",
      p_seats: [{ seat: 0, pid: "p0" }],
    });
    await rpc.saveGame(host, {
      gameId: GAME,
      endReason: "target",
      seats: [{ seat: 0, pid: "p0", name: "Ana", score: 12 }],
      roundsPlayed: 9,
      correctClaims: 6,
      wrongClaims: 2,
    });
    expect(f.calls[1].url).toMatch(/save_classic_game$/);
    expect(f.calls[1].body).toMatchObject({
      p_player_key: "h".repeat(20),
      p_end_reason: "target",
      p_seats: [{ seat: 0, name: "Ana", score: 12 }],
      p_app_version: SERVER_APP_VERSION,
    });
  });
});
