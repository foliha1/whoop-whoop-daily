import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { currentRoll, initDailyState } from "@/lib/dailyEngine";
import { setUmbrellaPreviewForTests } from "@/lib/launch";

const daily = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/hooks/useDailyGame", () => ({ useDailyGame: () => daily.current }));

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
  fetchDailyResults: vi.fn(() => Promise.resolve([])),
  fetchDailyPercentile: vi.fn(() => Promise.resolve(null)),
  fetchDailyStats: vi.fn(() => Promise.resolve(null)),
  fetchStreak: vi.fn(() => Promise.resolve(null)),
  formatStreakLine: () => null,
}));

vi.mock("@/hooks/useDailyShareImage", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const out: Record<string, unknown> = { ...actual };
  for (const [key, value] of Object.entries(actual)) {
    if (typeof value === "function") out[key] = () => ({ url: null, blob: null, status: "idle" });
  }
  return out;
});

vi.mock("@/lib/sounds", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) out[key] = typeof value === "function" ? () => undefined : value;
  return out;
});

vi.mock("lottie-react", () => ({ default: () => null }));

import DailyPage from "@/pages/DailyPage";

const makeDaily = (checkingResult: boolean) => {
  const state = initDailyState("whoop-test-requested-results");
  return {
    state,
    phase: state.phase,
    studyRemaining: 10,
    elapsedMs: 0,
    roll: currentRoll(state),
    tumbleSeed: 1,
    seed: "whoop-test-requested-results",
    puzzleNumber: 101,
    result: null,
    resultSaved: false,
    checkingResult,
    needsSignInToSave: false,
    alreadyPlayed: false,
    debugBypass: false,
    preLaunch: false,
    debugOverride: "none",
    dateKey: "2026-11-19",
    canPeek: false,
    start: vi.fn(),
    select: vi.fn(),
    peek: vi.fn(),
    recheckEmail: vi.fn(() => Promise.resolve()),
    forfeit: vi.fn(() => false),
  };
};

const mountPage = () => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[{ pathname: "/daily", state: { wwOpenResult: true } }]}>
      <DailyPage />
    </MemoryRouter>
  </HelmetProvider>,
);

describe("requested Daily results restoration", () => {
  beforeEach(() => {
    setUmbrellaPreviewForTests(true);
    localStorage.clear();
    localStorage.setItem("ww_daily_howto_seen", "1");
    daily.current = makeDaily(true);
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    cleanup();
    setUmbrellaPreviewForTests(null);
    vi.unstubAllGlobals();
  });

  it("holds a results loader instead of mounting the board or start dialog", async () => {
    const view = mountPage();
    expect(await screen.findByRole("status", { name: "Loading today's results" })).toBeInTheDocument();
    expect(screen.queryByTestId("daily-start")).not.toBeInTheDocument();
    expect(screen.queryByText("9 Cards on Deck")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Peek/ })).not.toBeInTheDocument();

    daily.current = makeDaily(false);
    view.rerender(
      <HelmetProvider>
        <MemoryRouter initialEntries={[{ pathname: "/daily", state: { wwOpenResult: true } }]}>
          <DailyPage />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(await screen.findByTestId("daily-start")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading today's results" })).not.toBeInTheDocument());
  });
});
