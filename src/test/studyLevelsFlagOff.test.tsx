import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

// The study level trial is behind a switch. These tests cover it switched OFF,
// which is how the site ships today.
vi.mock("@/lib/featureFlags", () => ({ SIGN_IN_ENABLED: true, STUDY_LEVELS_ENABLED: false }));

import DailyStartDialog, { dailyWelcomeLine } from "@/components/DailyStartDialog";
import { formatDailyShare } from "@/lib/daily";
import { scoreSegments } from "@/lib/dailyShareImage";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const result = (studyLevel: string) =>
  ({
    seed: "whoop-2026-08-05", puzzleNumber: 14, attributes: ["SHAPE", "COLOR", "NUMBER"],
    elapsedMs: 1, roundsSolved: 3, totalMisses: 0, roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
    peekUsed: false, peekRound: null, failed: false, studyLevel,
  }) as never;

describe("Daily study levels switch (off)", () => {
  it("shows the welcome line and no picker on the start screen", () => {
    render(<DailyStartDialog puzzleNumber={123} onStart={vi.fn()} />);
    const [first] = dailyWelcomeLine(123);
    expect(screen.getByTestId("daily-start-dialog").textContent).toContain(first);
    expect(screen.queryByRole("radiogroup", { name: "Study time" })).toBeNull();
    expect(screen.queryByTestId("daily-study-level")).toBeNull();
    expect(screen.queryByText("How long do you want to look?")).toBeNull();
  });

  it("starts a plain 10s (Look) run with no picker touched", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    render(<DailyStartDialog puzzleNumber={123} onStart={start} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => { vi.runAllTimers(); });
    expect(start).toHaveBeenCalledWith("look");
  });

  it("keeps the level out of the share text", () => {
    expect(formatDailyShare(result("blink"))).toContain("3 of 3 · Clean\n");
    expect(formatDailyShare(result("blink"))).not.toContain("Blink 3s");
    expect(formatDailyShare(result("blink"))).not.toContain("Look 10s");
  });

  it("keeps the level out of the share image score line", () => {
    const text = scoreSegments(result("blink"), 4).map((s) => s.text).join("");
    expect(text).toBe("3 of 3 · Clean · 4 day streak");
  });
});
