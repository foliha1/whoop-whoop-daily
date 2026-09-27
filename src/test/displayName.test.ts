import { describe, expect, it } from "vitest";
import { displayNameLength, normalizedDisplayName, sliceDisplayName, validateDisplayName } from "@/lib/displayName";

// Same cases are run against the server function public.display_name_allowed.
export const ACCEPT = ["さくら", "Олег", "محمد", "Zoë", "李娜", "Ana", "Cass", "José", "Felix", "Dickon", "Mía", "A B"];
export const REJECT = [
  "", "!!", "🎉", "🎉🎉", "***", "—", "f.u.c.k", "sh1t", "N1GGER", "SEVEN77",
  "fu\u200Bck", "\u202EAna", "An\u2066a", "A\uFEFFna", "\u0301",
];

describe("global display names", () => {
  it.each(ACCEPT)("accepts %s", (name) => {
    expect(validateDisplayName(name)).toEqual({ ok: true, name: name.normalize("NFKC") });
  });

  it.each(REJECT.map((n) => [JSON.stringify(n), n]))("rejects %s", (_label, name) => {
    expect(validateDisplayName(name)).toEqual({ ok: false, error: "Try another name." });
  });

  it("normalizes separators and common digit substitutions", () => {
    expect(normalizedDisplayName(" F.U-C_K ")).toBe("fuck");
  });

  it("counts code points like the server", () => {
    expect(displayNameLength("李娜")).toBe(2);
    expect(displayNameLength("𝒜")).toBe(1);
    expect(sliceDisplayName("さくらさくらさ")).toBe("さくらさくら");
    expect(validateDisplayName("さくらさくら").ok).toBe(true);
    expect(validateDisplayName("さくらさくらさ").ok).toBe(false);
  });
});
