import { describe, expect, it } from "vitest";
import { normalizedDisplayName, validateDisplayName } from "@/lib/displayName";

describe("global display names", () => {
  it.each(["Felix", "Cass", "Dickon", "Mía", "A B"])("accepts %s", (name) => {
    expect(validateDisplayName(name)).toEqual({ ok: true, name });
  });

  it.each(["", "SEVEN77", "f.u.c.k", "sh1t", "N1GGER"])("rejects %s", (name) => {
    expect(validateDisplayName(name)).toEqual({ ok: false, error: "Try another name." });
  });

  it("normalizes separators and common digit substitutions", () => {
    expect(normalizedDisplayName(" F.U-C_K ")).toBe("fuck");
  });
});