import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DailyHowToSteps from "@/components/DailyHowToSteps";
import DailyDemo, { DAILY_DEMO_CARDS } from "@/components/DailyDemo";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { hasSeenHowTo } from "@/lib/dailyHowTo";

vi.mock("@/lib/sounds", () => ({ playDeal: vi.fn(), playFlip: vi.fn(), playDiceRoll: vi.fn(), playDieLand: vi.fn(), playCorrect: vi.fn(), playWrong: vi.fn(), startTheme: vi.fn(), leaveThemeZone: vi.fn(), prewarmTheme: vi.fn(), HOW_TO_PLAY_THEME_FILE: "howto.mp3" }));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: vi.fn() }));

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); setUmbrellaPreviewForTests(null); vi.restoreAllMocks(); });
const props = () => ({ mode: "reference" as const, onStart: vi.fn(), onClose: vi.fn() });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));

describe("Daily tutorial integration", () => {
  it("retains the legacy tutorial when OFF", () => {
    setUmbrellaPreviewForTests(false);
    render(<DailyHowToSteps {...props()} />);
    expect(screen.queryByTestId("daily-demo")).toBeNull();
    expect(hasSeenHowTo()).toBe(true);
  });
  it("uses the scripted board for the admin ON preview", () => {
    setUmbrellaPreviewForTests(true);
    render(<DailyHowToSteps {...props()} />);
    expect(screen.getByTestId("daily-demo")).toBeInTheDocument();
    expect(hasSeenHowTo()).toBe(true);
  });
  it("reference Escape closes without starting a Daily", () => {
    const callbacks = props();
    render(<DailyDemo {...callbacks} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onStart).not.toHaveBeenCalled();
  });
  it("gate Skip continues to the caller's start dialog exactly once", () => {
    const callbacks = props();
    render(<DailyDemo {...callbacks} mode="gate" />);
    const skip = screen.getByRole("button", { name: "Skip how to play and continue" });
    fireEvent.click(skip); fireEvent.click(skip);
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });
  it("finishing and back navigation preserve the caller contract without saving an attempt", () => {
    const callbacks = props();
    render(<DailyDemo {...callbacks} />);
    for (let i = 0; i < 6; i++) next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: /Start Daily #/ }));
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).filter((key) => key.startsWith("ww_daily_whoop-"))).toEqual([]);
  });
  it("cancels the study timeline when navigating away", () => {
    render(<DailyDemo {...props()} />);
    next();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("10s")).toBeInTheDocument();
    next();
    act(() => { vi.advanceTimersByTime(11000); });
    expect(screen.queryByText("0s")).toBeNull();
    expect(screen.getByAltText("Match color")).toBeInTheDocument();
  });
  it("reduced motion shows the readable study state without running a countdown", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query.includes("reduce"), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true }));
    render(<DailyDemo {...props()} />);
    next();
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByText("10s")).toBeInTheDocument();
  });
  it("teaches using nine valid cards, a real star match and a mismatching circle/square", () => {
    expect(DAILY_DEMO_CARDS).toHaveLength(9);
    expect(DAILY_DEMO_CARDS[1].shape).toBe("star");
    expect(DAILY_DEMO_CARDS[7].shape).toBe("star");
    expect(DAILY_DEMO_CARDS[0].shape).toBe("circle");
    expect(DAILY_DEMO_CARDS[2].shape).toBe("square");
  });
});