import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the Daily results order: Share lives in the score panel, the
// save-your-score box follows, and Done lives inside FELIX's Solo panel.
// None of these actions may be trapped inside the sign-in-only box.
const src = readFileSync(resolve(__dirname, "../pages/DailyPage.tsx"), "utf8");

describe("Daily results sign-in placement", () => {
  const boxOpen = src.indexOf("{emailCaptureOpen && (");
  const score = src.indexOf("<WhoopPointsChange");
  const solo = src.indexOf("<DailySoloPrompt", boxOpen);

  it("puts Share in the score panel and Done in FELIX's panel", () => {
    expect(score).toBeGreaterThan(-1);
    expect(src.slice(score, boxOpen)).toContain("shareAction={");
    expect(src.slice(score, boxOpen)).toContain("<ShareBlock");
    expect(src.slice(solo)).toContain("onDone={");
  });

  it("keeps both action destinations outside the sign-in box", () => {
    expect(boxOpen).toBeGreaterThan(score);
    expect(solo).toBeGreaterThan(boxOpen);
  });
});

describe("Daily results sign-in styling", () => {
  it("puts the ask on the blue panel and hides Your Stats until sign-in", () => {
    expect(src).toContain("background: COLORS.blue");
    expect(src).toContain("<DailyEmailCapture\n            onBlueSurface");
    expect(src).toContain("showStatsLink={subscribed}");
  });
});
