import { describe, it, expect, vi } from "vitest";

// The study level trial is behind a switch. These tests cover it switched ON,
// which is how it runs during the trial.
vi.mock("@/lib/featureFlags", () => ({ SIGN_IN_ENABLED: true, STUDY_LEVELS_ENABLED: true }));

import { formatDailyShare } from "@/lib/daily";
import { scoreSegments } from "@/lib/dailyShareImage";

const result = (studyLevel: string) =>
  ({
    seed: "whoop-2026-08-05", puzzleNumber: 14, attributes: ["SHAPE", "COLOR", "NUMBER"],
    elapsedMs: 1, roundsSolved: 3, totalMisses: 0, roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
    peekUsed: false, peekRound: null, failed: false, studyLevel,
  }) as never;

describe("Daily study levels switch (on)", () => {
  it("shows the saved level as name plus time in the share text", () => {
    expect(formatDailyShare(result("blink"))).toContain("3 of 3 · Clean · Blink 3s");
  });

  it("shows an older result with no saved level as Look 10s", () => {
    expect(formatDailyShare(result("look"))).toContain("3 of 3 · Clean · Look 10s");
  });

  it("adds the level to the share image score line", () => {
    const text = scoreSegments(result("blink"), 4).map((s) => s.text).join("");
    expect(text).toBe("3 of 3 · Clean · Blink 3s · 4 day streak");
  });
});
