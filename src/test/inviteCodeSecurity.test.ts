import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0046_fix_invite_code_random_function.sql", "utf8");

describe("private invite code generation", () => {
  it.each(["create_room", "gen_daily_group_code"])("%s uses cryptographic random bytes", (fn) => {
    const body = migration.split(`FUNCTION public.${fn}(`)[1]?.split("$$;")[0] ?? "";
    expect(body).toContain("extensions.gen_random_bytes(1)");
    expect(body).not.toContain("random()");
    expect(body).toMatch(/FOR i IN 1\s*\.\.\s*6 LOOP/);
  });

  it("preserves both existing code alphabets", () => {
    expect(migration).toContain("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    expect(migration).toContain("abcdefghjkmnpqrstuvwxyz23456789");
  });
});
