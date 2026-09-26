// Guards for the Classic containment fixes (2026-09-25): no player's browser
// id may reach another player's device, and the room list is server-only.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const lockdown = read("drizzle/migrations/0016_classic_pids_and_room_lockdown.sql");
const codeFormat = read("drizzle/migrations/0017_room_code_matches_client_format.sql");

describe("rooms are server-only", () => {
  it("revokes direct table access from every client role", () => {
    expect(lockdown).toContain(
      "REVOKE ALL ON public.rooms, public.room_seats, public.claim_locks FROM PUBLIC, anon, authenticated;"
    );
  });

  it("room RPCs never return the host's browser id", () => {
    for (const sql of [lockdown, codeFormat]) {
      for (const m of sql.matchAll(/RETURNS TABLE\(([^)]*)\)/g)) {
        expect(m[1]).not.toMatch(/visitor/);
      }
    }
  });

  it("room creation is rate capped by IP", () => {
    expect(codeFormat + lockdown).toMatch(/rl_hit|request_ip/);
  });
});

describe("shared-channel payloads carry player keys, not browser ids", () => {
  it("presence, heartbeat and public state never serialize visitor_id", () => {
    for (const f of [
      "src/lib/publicState.ts",
      "src/hooks/useRoomPresence.ts",
      "src/hooks/useHeartbeat.ts",
      "src/lib/multiplayer.ts",
    ]) {
      expect(read(f), f).not.toMatch(/visitor_id\s*:/);
    }
  });

  it("claim rejections broadcast no browser id", () => {
    const release = read("supabase/functions/release-lock/index.ts");
    const broadcasts = release.match(/payload:\s*\{[^}]*\}/g) ?? [];
    for (const b of broadcasts) expect(b).not.toMatch(/visitor/);
  });
});

describe("signed-out saves into an account's browser", () => {
  it("are refused and logged", () => {
    expect(lockdown).toContain("'visitor_linked_needs_session'");
    expect(lockdown).toContain("'result_rejected'");
  });
});
