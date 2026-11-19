import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the Daily results order: score, then the save-your-score box, then
// Share and Done. Share and Done must sit OUTSIDE the box, or signed-in
// players (who never see the box) lose them entirely.
const src = readFileSync(resolve(__dirname, "../pages/DailyPage.tsx"), "utf8");

describe("Daily results sign-in placement", () => {
  const boxOpen = src.indexOf("{emailCaptureOpen && (");
  const boxClose = src.indexOf("\n      )}\n", src.indexOf("<DailyEmailCapture", boxOpen));
  const share = src.indexOf("<ShareBlock", boxOpen);
  const done = src.indexOf('data-testid="results-done"', boxOpen);

  it("places the sign-in box before Share and Done", () => {
    expect(boxOpen).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(boxOpen);
    expect(done).toBeGreaterThan(share);
  });

  it("keeps Share and Done outside the sign-in box", () => {
    expect(boxClose).toBeGreaterThan(boxOpen);
    expect(share).toBeGreaterThan(boxClose);
    expect(done).toBeGreaterThan(boxClose);
  });
});
