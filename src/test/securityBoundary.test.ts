// Guards for the visitor-id identity boundary (external audit, 2026-09-25).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import { handleAuthIdentity, currentRecordOwner, getSessionUserId } from "@/lib/account";
import { isAccountOwnedRecord, loadDailyResult, saveDailyResult, type DailyResult } from "@/lib/daily";

const root = process.cwd();
const migration = readFileSync(
  join(root, "drizzle/migrations", readdirSync(join(root, "drizzle/migrations")).find((f) => f.includes("visitor_identity_boundary"))!),
  "utf8"
);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

const result = (seed: string): DailyResult => ({
  seed,
  puzzleNumber: 46,
  attributes: [],
  elapsedMs: 1000,
  roundsSolved: 3,
  totalMisses: 0,
  roundEvents: [[], [], []],
  peekUsed: false,
  peekRound: null,
  failed: false,
  completedAt: new Date().toISOString(),
});

describe("1 + 5 + 6: server-only functions", () => {
  it.each([
    "whoop_points_rows()", "whoop_points_for(text, date)", "whoop_points_table(date)",
    "whoop_points_active_identities(date)", "whoop_points_all(date)",
    "create_daily_group(text, text, text)", "join_daily_group(text, text, text)",
    "leave_daily_group(uuid, text)", "get_my_groups(text, integer)",
    "get_group_today(uuid, integer, text)", "get_group_season(uuid, integer, text)",
    "subscribe_daily(text, text)", "subscribe_daily(text, text, text)",
  ])("revokes %s from PUBLIC, anon and authenticated", (fn) => {
    expect(migration).toContain(`'${fn}'`);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("group boards read the first attempt", () => {
    expect(migration).not.toMatch(/ORDER BY r\.rounds_solved DESC/);
    expect(migration.match(/ORDER BY r\.created_at ASC, r\.id ASC\n\s+LIMIT 1\n\s+\) b ON true/g)?.length).toBe(2);
  });

  it("no browser code calls subscribe_daily directly", () => {
    const hits = walk(join(root, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("/test/") && !f.includes("integrations/supabase/types"))
      .filter((f) => readFileSync(f, "utf8").includes("subscribe_daily"));
    expect(hits).toEqual([]);
  });
});

describe("2: device takeover", () => {
  it("never overwrites another account's link", () => {
    expect(migration).toContain("WHERE public.player_devices.user_id = EXCLUDED.user_id");
    expect(migration).not.toMatch(/DO UPDATE SET user_id/);
  });
});

describe("3 + 4: a bare visitor id never borrows an account", () => {
  it("readers accept only an unlinked or own-linked visitor", () => {
    expect(migration).toMatch(/pd\.user_id <> auth\.uid\(\)/);
    for (const fn of ["daily_rows_for", "get_daily_results", "get_first_attempt"]) {
      const body = migration.split(`FUNCTION public.${fn}(`)[1].split("$function$;")[0];
      expect(body).toContain("public.caller_visitor(p_visitor_id)");
    }
  });

  it("signed-out score never resolves an account-linked visitor", () => {
    const body = migration.split("FUNCTION public.get_whoop_points(")[1].split("$function$;")[0];
    expect(body).not.toMatch(/SELECT pd\.user_id::text FROM public\.player_devices/);
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor)");
  });

  it("signed-out save never recovers user_id; signed-in save rejects another's visitor", () => {
    const body = migration.split("FUNCTION public.save_daily_result(")[1].split("$function$;")[0];
    expect(body).not.toMatch(/SELECT pd\.user_id INTO v_uid/);
    expect(body).toContain("'visitor_owned_elsewhere'");
  });
});

describe("7: sign-out is an identity boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    handleAuthIdentity("INITIAL_SESSION", null);
  });

  it("admin uses the account sign-out wrapper", () => {
    const src = readFileSync(join(root, "src/pages/AdminPage.tsx"), "utf8");
    expect(src).not.toContain("supabase.auth.signOut");
    expect(src).toContain("accountSignOut");
  });

  it("stores the owning user id on the played record", () => {
    handleAuthIdentity("SIGNED_IN", "user-a");
    expect(getSessionUserId()).toBe("user-a");
    expect(currentRecordOwner()).toBe("user:user-a");
    saveDailyResult(result("whoop-2026-09-25"), currentRecordOwner());
    expect(loadDailyResult("whoop-2026-09-25")?.owner).toBe("user:user-a");
    expect(isAccountOwnedRecord(localStorage.getItem("ww_daily_whoop-2026-09-25"))).toBe(true);
  });

  it("a direct SIGNED_OUT clears account-owned state but keeps the browser's own record", () => {
    handleAuthIdentity("SIGNED_IN", "user-a");
    saveDailyResult(result("whoop-2026-09-25"), "user:user-a");
    saveDailyResult(result("whoop-2026-09-24"), "anon");
    localStorage.setItem("ww_visitor_id", "v1");
    expect(handleAuthIdentity("SIGNED_OUT", null)).toBe(true);
    expect(localStorage.getItem("ww_daily_whoop-2026-09-25")).toBeNull();
    expect(localStorage.getItem("ww_daily_whoop-2026-09-24")).not.toBeNull();
    expect(localStorage.getItem("ww_visitor_id")).toBeNull();
  });

  it("switching accounts clears the previous account's records", () => {
    handleAuthIdentity("SIGNED_IN", "user-a");
    saveDailyResult(result("whoop-2026-09-25"), "user:user-a");
    expect(handleAuthIdentity("SIGNED_IN", "user-b")).toBe(true);
    expect(localStorage.getItem("ww_daily_whoop-2026-09-25")).toBeNull();
  });

  it("a first load or token refresh is not a boundary", () => {
    saveDailyResult(result("whoop-2026-09-24"), "anon");
    expect(handleAuthIdentity("INITIAL_SESSION", null)).toBe(false);
    expect(handleAuthIdentity("SIGNED_IN", "user-a")).toBe(false);
    expect(handleAuthIdentity("TOKEN_REFRESHED", "user-a")).toBe(false);
    expect(localStorage.getItem("ww_daily_whoop-2026-09-24")).not.toBeNull();
  });
});
