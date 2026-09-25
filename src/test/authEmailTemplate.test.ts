import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const template = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/email-templates/code-email.tsx"),
  "utf8",
);

describe("authentication email template", () => {
  it("uses absolute published URLs for the app avatar and light/dark full logos", () => {
    expect(template).toContain("https://www.whoop-whoop.com/icons/daily/icon-192.png");
    expect(template).toContain("https://www.whoop-whoop.com/WhoopWhoop_Stacked_Logo.svg");
    expect(template).toContain("https://www.whoop-whoop.com/WhoopWhoop_Dark_Logo.svg");
    expect(template).toContain('.logo-dark { display: block !important; }');
    expect(template).not.toContain('style={brand}>WHOOP! WHOOP!</Text>');
  });

  it("rejects anything other than exactly six numeric digits before rendering", () => {
    expect(template).toContain("/^[0-9]{6}$/");
    expect(template).toContain("requireSixDigitCode(token)");
    expect(template).toContain("export const OTP_MINUTES = 60");
  });
});