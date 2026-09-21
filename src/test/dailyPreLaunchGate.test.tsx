// ============================================================================
// Pre-launch gate.
//
// Before launch day (11 August 2026) the daily is not playable: the ready
// screen shows a disabled "Coming 11 August" control plus the email capture,
// nothing is written to `daily_results`, and ?debug=1 bypasses the gate so
// launch day can be tested early.
// ============================================================================

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

import {
  DAILY_LAUNCH_LABEL,
  getDailyNumber,
  isPreLaunch,
  resolveDailyContext,
} from "@/lib/daily";

const localDate = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h);

describe("getDailyNumber without the clamp", () => {
  it("is 1 on launch day and counts up from there", () => {
    expect(getDailyNumber(localDate(2026, 8, 11))).toBe(1);
    expect(getDailyNumber(localDate(2026, 8, 12))).toBe(2);
  });

  it("gives every pre-launch date its own distinct number", () => {
    expect(getDailyNumber(localDate(2026, 8, 10))).toBe(0);
    expect(getDailyNumber(localDate(2026, 8, 9))).toBe(-1);
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const numbers = days.map((d) => getDailyNumber(localDate(2026, 8, d)));
    expect(new Set(numbers).size).toBe(numbers.length);
    // No pre-launch date may ever collide with launch day.
    expect(numbers.filter((n) => n === 1)).toHaveLength(1);
  });
});

describe("isPreLaunch", () => {
  it("is active on 9 and 10 August and inactive from 11 August", () => {
    expect(isPreLaunch(localDate(2026, 8, 9))).toBe(true);
    expect(isPreLaunch(localDate(2026, 8, 10))).toBe(true);
    expect(isPreLaunch(localDate(2026, 8, 11))).toBe(false);
    expect(isPreLaunch(localDate(2026, 8, 12))).toBe(false);
    expect(isPreLaunch(localDate(2027, 1, 1))).toBe(false);
  });
});

describe("resolveDailyContext gate flag", () => {
  it("gates before launch and opens on launch day", () => {
    expect(resolveDailyContext("", localDate(2026, 8, 9)).preLaunch).toBe(true);
    expect(resolveDailyContext("", localDate(2026, 8, 10)).preLaunch).toBe(true);
    expect(resolveDailyContext("", localDate(2026, 8, 11)).preLaunch).toBe(false);
  });

  it("?debug=1 bypasses the gate entirely", () => {
    const ctx = resolveDailyContext("?debug=1", localDate(2026, 8, 9));
    expect(ctx.preLaunch).toBe(false);
    expect(ctx.debug).toBe(true);
  });

  it("?debug=1&day=N still resolves relative to the effective date", () => {
    const ctx = resolveDailyContext("?debug=1&day=2", localDate(2026, 8, 9));
    expect(ctx.preLaunch).toBe(false);
    expect(ctx.dateKey).toBe("2026-08-11");
    expect(ctx.puzzleNumber).toBe(1);
    const later = resolveDailyContext("?debug=1&day=3", localDate(2026, 8, 9));
    expect(later.puzzleNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Page-level: the gated ready screen, and no write while gated.
// ---------------------------------------------------------------------------

const saveDailyResultRemote = vi.fn(() => Promise.resolve());

vi.mock("@/lib/dailyResults", () => ({
  saveDailyResultRemote: (...args: unknown[]) => saveDailyResultRemote(...(args as [])),
  fetchDailyResults: vi.fn(() => Promise.resolve([])),
  fetchStreak: vi.fn(() => Promise.resolve(null)),
  formatStreakLine: () => null,
  fetchDailyStats: vi.fn(() => Promise.resolve(null)),
  fetchDailyPercentile: vi.fn(() => Promise.resolve(null)),
  formatPercentileLine: () => "",
  formatAvgMisses: () => "0",
}));

vi.mock("@/lib/sounds", () => {
  const noop = () => {};
  return {
    getSfxEnabled: noop,
    setSfxEnabled: noop,
    getMusicEnabled: noop,
    setMusicEnabled: noop,
    setMuted: noop,
    isMuted: noop,
    getSoundEnabled: () => false,
    setSoundEnabled: noop,
    hasAudioUnlocked: noop,
    unlockAudio: noop,
    startTheme: noop,
    stopTheme: noop,
    prewarmTheme: noop,
    playFlip: noop,
    playDeal: noop,
    playSelect: noop,
    playDeselect: noop,
    playWhoopCall: noop,
    playCorrect: noop,
    playWrong: noop,
    playDiceRoll: noop,
    playDieLand: noop,
    playPeek: noop,
    playReveal: noop,
    playStart: noop,
    playRoundAdvance: noop,
    playTick: noop,
    playSubscribed: noop,
    CLIP_GAIN: 1,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
  },
}));

vi.mock("lottie-react", () => ({ default: () => null }));

import DailyPage from "@/pages/DailyPage";

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <DailyPage />
      </MemoryRouter>
    </HelmetProvider>
  );

describe("gated ready screen", () => {
  beforeEach(() => {
    saveDailyResultRemote.mockClear();
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(localDate(2026, 8, 9, 10));
    window.history.replaceState({}, "", "/");
    // jsdom has neither of these.
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const frames = new Map<number, ReturnType<typeof setTimeout>>();
    let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(
        id,
        setTimeout(() => {
          frames.delete(id);
          cb(Date.now());
        }, 16)
      );
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const t = frames.get(id);
      if (t !== undefined) {
        clearTimeout(t);
        frames.delete(id);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers a live signup CTA, no inline form, and keeps How to Play live", () => {
    renderPage();
    const cta = screen.getByRole("button", { name: "Get the First Daily" });
    expect(cta).toBeEnabled();
    expect(screen.queryByText(/Play Today's Daily/i)).toBeNull();
    expect(screen.getByRole("button", { name: /How to Play/i })).toBeEnabled();
    // The email form lives in the overlay only.
    expect(screen.queryByLabelText("Email address")).toBeNull();
    act(() => cta.click());
    expect(screen.getByTestId("prelaunch-signup")).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notify Me" })).toBeTruthy();
    // Close control dismisses it.
    act(() => screen.getByTestId("prelaunch-close").click());
    expect(screen.queryByTestId("prelaunch-signup")).toBeNull();
  });

  it("never shows the puzzle number before launch", () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/#\s?1\b/);
    expect(document.body.textContent).toContain(DAILY_LAUNCH_LABEL);
  });

  it("writes nothing to daily_results while gated", () => {
    renderPage();
    act(() => screen.getByRole("button", { name: "Get the First Daily" }).click());
    vi.advanceTimersByTime(20_000);
    expect(saveDailyResultRemote).not.toHaveBeenCalled();
    expect(
      Object.keys(window.localStorage).filter((k) => k.startsWith("ww_daily_whoop-"))
    ).toHaveLength(0);
  });
});
