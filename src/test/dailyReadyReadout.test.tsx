// ============================================================================
// The Daily must not show its hand before the run begins.
//
// The launched Daily holds the engine in READY behind a non-dismissible start
// dialog, while the board's rule readout sits above it. That readout used to
// fall through to the round's rule, so the first roll was visible the instant
// the page loaded — the exact information the memorize phase exists to protect.
// ============================================================================

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { setUmbrellaPreviewForTests } from "@/lib/launch";

vi.mock("@/integrations/supabase/client", () => {
  const q = () => Promise.resolve({ data: null, error: null });
  return {
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: async () => ({ data: { user: null } }),
        getSession: async () => ({ data: { session: null } }),
      },
      rpc: vi.fn(q),
      functions: { invoke: vi.fn(q) },
      from: () => ({ insert: q, select: () => ({ eq: q }) }),
    },
  };
});

vi.mock("@/lib/dailyResults", async (orig) => ({
  ...(await orig<typeof import("@/lib/dailyResults")>()),
  saveDailyResultRemote: vi.fn(() => Promise.resolve()),
  fetchDailyPercentile: vi.fn(() => Promise.resolve(null)),
  fetchDailyStats: vi.fn(() => Promise.resolve(null)),
  fetchStreak: vi.fn(() => Promise.resolve(null)),
  formatStreakLine: () => null,
}));

// jsdom has no canvas; the share image is not what this test covers.
vi.mock("@/hooks/useDailyShareImage", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const out: Record<string, unknown> = { ...actual };
  for (const [k, v] of Object.entries(actual))
    if (typeof v === "function") out[k] = () => ({ url: null, blob: null, status: "idle" });
  return out;
});

// Web Audio does not exist in jsdom: every sound export is a no-op.
vi.mock("@/lib/sounds", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) out[k] = typeof v === "function" ? () => undefined : v;
  return out;
});

vi.mock("lottie-react", () => ({ default: () => null }));

import DailyPage from "@/pages/DailyPage";

const SEED = "whoop-test-ready-readout";
const RULES = ["Match the shape", "Match the number", "Match the color"];

const tick = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", `/?debug=1&seed=${SEED}`);
  window.localStorage.clear();
  // Returning player: the start dialog shows instead of the How to Play gate.
  window.localStorage.setItem("ww_daily_howto_seen", "1");
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  const frames = new Map<number, ReturnType<typeof setTimeout>>();
  let nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, setTimeout(() => { frames.delete(id); cb(Date.now()); }, 250));
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const t = frames.get(id);
    if (t !== undefined) { clearTimeout(t); frames.delete(id); }
  });
});

afterEach(() => {
  setUmbrellaPreviewForTests(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/?debug=1&seed=${SEED}`]}>
        <DailyPage />
      </MemoryRouter>
    </HelmetProvider>
  );

describe("the Daily before the run starts", () => {
  it("shows no round rule while the start dialog is up", async () => {
    mount();
    await tick(50);

    // The pre-start state really is on screen: dialog open, nothing dealt.
    expect(
      screen.getByRole("heading", { name: /Whoop! Whoop! Daily #/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("daily-start")).toBeInTheDocument();

    for (const rule of RULES) {
      expect(document.body.textContent).not.toContain(rule);
    }
  });

  it("shows the round's rule once the run is actually playing", async () => {
    mount();
    await tick(50);

    await act(async () => {
      screen.getByTestId("daily-start").click();
    });
    await tick(700);   // DEAL → STUDY
    await tick(10000); // STUDY → HIDE
    await tick(1000);  // HIDE → ROLL
    await tick(2000);  // ROLL → PLAY

    // The readout still does its job: exactly one rule is on screen.
    const shown = RULES.filter((rule) => document.body.textContent?.includes(rule));
    expect(shown).toHaveLength(1);
  });
});
