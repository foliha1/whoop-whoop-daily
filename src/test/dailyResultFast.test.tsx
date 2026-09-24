// ============================================================================
// Component-level coverage for the END of a daily run.
//
// The unit tests around `runDailyEndSequence` prove the callback chain fires;
// they say nothing about whether the result screen actually becomes visible.
// This mounts the real page, plays a real run with a debug seed, and asserts
// the result screen is in the DOM, at full opacity, and not sitting behind a
// leftover outgoing fade layer.
// ============================================================================

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

// Fast path: the page's own reducer starts from a state we built, one claim
// before round 3 resolves, instead of playing two full rounds under fake time.
const preset = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("@/lib/dailyEngine", async (orig) => {
  const actual = await orig<typeof import("@/lib/dailyEngine")>();
  return {
    ...actual,
    initDailyState: (seed: string, rng?: unknown) =>
      preset.state ?? actual.initDailyState(seed, rng as never),
  };
});

import {
  dailyReducer,
  initDailyState,
  matchesOn,
  pairsFor,
  MISSES_PER_ROUND,
  type DailyAction,
  type DailyState,
} from "@/lib/dailyEngine";

// The streak line talks to the backend; the run itself must not.
vi.mock("@/lib/dailyResults", async (orig) => ({
  ...(await orig<typeof import("@/lib/dailyResults")>()),
  saveDailyResultRemote: vi.fn(() => Promise.resolve()),
  fetchDailyPercentile: vi.fn(() => Promise.resolve(null)),
  fetchDailyStats: vi.fn(() => Promise.resolve(null)),
  fetchStreak: vi.fn(() => Promise.resolve(null)),
  formatStreakLine: () => null,
}));

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

// lottie-web touches a real canvas on import; jsdom has none.
vi.mock("lottie-react", () => ({ default: () => null }));

import DailyPage from "@/pages/DailyPage";
import { saveDailyResultRemote } from "@/lib/dailyResults";


const SEED = "whoop-test-visible-result-fast";

// --- a mirror of the run, so the test knows which slots to tap -------------
const R = (s: DailyState, a: DailyAction) => dailyReducer(s, a);

function mirrorToPlay(seed: string): DailyState {
  let s = initDailyState(seed);
  s = R(s, { type: "START" });
  s = R(s, { type: "REVEAL" });
  s = R(s, { type: "HIDE" });
  s = R(s, { type: "ROLL_START" });
  return R(s, { type: "PLAY_START", at: 0 });
}

function goodPair(s: DailyState): [number, number] {
  const attr = s.rolls[s.roundIndex - 1].attribute;
  const options = pairsFor(s.grid, attr);
  expect(options.length).toBeGreaterThan(0);
  return options[0];
}

function badPair(s: DailyState): [number, number] {
  const attr = s.rolls[s.roundIndex - 1].attribute;
  for (let i = 0; i < s.grid.length; i++) {
    for (let j = i + 1; j < s.grid.length; j++) {
      const a = s.grid[i];
      const b = s.grid[j];
      if (a && b && !matchesOn(a, b, attr)) return [i, j];
    }
  }
  throw new Error("no mismatched pair available");
}

function mirrorClaim(s: DailyState, i: number, j: number, at: number): DailyState {
  s = R(s, { type: "SELECT", idx: i });
  s = R(s, { type: "SELECT", idx: j });
  s = R(s, { type: "RESOLVE", at });
  if (s.matchedPair.length > 0) s = R(s, { type: "CLEAR_MATCH" });
  if (s.wrongPair.length > 0) s = R(s, { type: "CLEAR_WRONG" });
  return s;
}

function mirrorNextRound(s: DailyState): DailyState {
  if (s.phase === "WHOOPED") s = R(s, { type: "ROUND_END", at: 0 });
  if (s.phase !== "HIDE") return s;
  s = R(s, { type: "ROLL_START" });
  return R(s, { type: "PLAY_START", at: 0 });
}

// --- DOM helpers ----------------------------------------------------------
const tick = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

function slotButton(idx: number): HTMLElement {
  const slot = document.querySelector(`[data-slot="${idx}"]`);
  if (!slot) throw new Error(`slot ${idx} not rendered`);
  // The card exposes role="button" only while taps are live; otherwise drive
  // the card element itself.
  const btn =
    slot.querySelector<HTMLElement>('[role="button"]') ??
    (slot.firstElementChild as HTMLElement | null);
  if (!btn) throw new Error(`slot ${idx} has no card`);
  return btn;
}

async function tapSlot(idx: number) {
  const btn = slotButton(idx);
  await act(async () => {
    btn.click();
  });
}

/** Tap a pair and let the 450ms auto-resolve plus its settle window run out. */
async function claimInDom(i: number, j: number) {
  await tapSlot(i);
  await tapSlot(j);
  await churn(450);  // RESOLVE — parent re-renders from here on
  await churn(2000); // wrong shake / match ghost settle
}

/** Ready → PLAY of round 1 (start gate, deal, study, hide, roll). */
async function startRun() {
  const play = screen.getByRole("button", { name: /Play Today's Daily/i });
  await act(async () => {
    play.click();
  });
  await tick(700);   // DEAL → STUDY
  await tick(10000); // STUDY → HIDE
  await tick(1000);  // HIDE → ROLL
  await tick(2000);  // ROLL → PLAY
}

async function advanceRound() {
  await tick(2000); // WHOOPED pause / HIDE hold
  await tick(2000); // ROLL hero → PLAY
}

/** The visible current layer plus the leftover outgoing layer, if any. */
function layers() {
  return {
    current: document.querySelector<HTMLElement>('[data-testid="daily-fade-current"]'),
    outgoing: document.querySelector<HTMLElement>('[data-testid="daily-fade-outgoing"]'),
  };
}

async function expectResultVisible() {
  // Give the end chain (settle → reveal → hold → results) and the 250ms fade
  // all the room they need.
  // The parent keeps re-rendering throughout, including across the fade.
  await churn(6000);
  await churn(600);

  const heading = screen.getByRole("heading", { name: /your daily results/i });
  expect(heading).toBeInTheDocument();

  const { current, outgoing } = layers();
  expect(current).not.toBeNull();
  // The results tree must be inside the LIVE layer, not a stale snapshot.
  expect(within(current!).getByRole("button", { name: /share/i })).toBeInTheDocument();
  expect(current!.style.opacity === "" || current!.style.opacity === "1").toBe(true);
  // Nothing may be left covering it.
  expect(outgoing).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", `/?debug=1&seed=${SEED}`);
  window.localStorage.clear();
  // jsdom has neither of these.
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  // jsdom has no rAF under fake timers: back it with setTimeout, keeping the
  // handles distinct so cancelAnimationFrame clears the right one.
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
  preset.state = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A parent that re-renders on demand with unrelated state, the way the live
// app re-renders during the ending (timers, audio, theme). Each bump gives
// DailyPage — and so DailyScreenFade — brand-new `children` element identities.
let bumpParent: () => void = () => {};
const Harness: React.FC = () => {
  const [n, setN] = React.useState(0);
  bumpParent = () => setN((v) => v + 1);
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/?debug=1&seed=${SEED}`]}>
        <div data-parent-renders={n}>
          <DailyPage />
        </div>
      </MemoryRouter>
    </HelmetProvider>
  );
};
const mount = () => render(<Harness />);

/**
 * Advance `ms` while re-rendering the parent every `step` ms. The step must be
 * shorter than the 250ms fade and the 250ms stubbed frame: if an effect wrongly
 * depends on `children`, every bump cancels its timers before they can fire,
 * so the fade never finishes. Fully deterministic under fake timers.
 */
const churn = async (ms: number, step = 100) => {
  for (let t = 0; t < ms; t += step) {
    await act(async () => bumpParent());
    await tick(step);
  }
};


/** Round 3 in PLAY with rounds 1–2 already won, built by the real reducer. */
function atRound3(): DailyState {
  preset.state = null;
  let m = mirrorToPlay(SEED);
  for (let round = 1; round <= 2; round++) {
    const [i, j] = goodPair(m);
    m = mirrorClaim(m, i, j, round * 100);
    m = mirrorNextRound(m);
  }
  expect(m.phase).toBe("PLAY");
  expect(m.roundIndex).toBe(3);
  return m;
}

describe("daily end of run (fast, from round 3)", () => {
  it("round 3 correct match: results appear with 3/3 solved and three round rows", async () => {
    const m = atRound3();
    preset.state = m;
    mount();
    const [i, j] = goodPair(m);
    await claimInDom(i, j);
    await expectResultVisible();
    // ?debug=1 runs never write a result (same rule as the live page).
    expect(saveDailyResultRemote).not.toHaveBeenCalled();
    // The right data: all three rounds solved, no misses, three round rows.
    const live = layers().current!;
    expect(live.textContent).toContain("3/3");
    expect(live.textContent).toMatch(/0\s*Misses/);
    for (const r of ["R1", "R2", "R3"]) expect(live.textContent).toContain(r);
    // The sequence has fully settled: more time changes nothing.
    await tick(5000);
    expect(layers().outgoing).toBeNull();
    expect(screen.getByRole("heading", { name: /your daily results/i })).toBeInTheDocument();
    expect(saveDailyResultRemote).not.toHaveBeenCalled();
  }, 15000);

  it("round 3 ends on misses: results still appear and settle", async () => {
    const m0 = atRound3();
    preset.state = m0;
    mount();
    let m = m0;
    for (let k = 0; k < MISSES_PER_ROUND; k++) {
      const [i, j] = badPair(m);
      await claimInDom(i, j);
      m = mirrorClaim(m, i, j, 500 + k);
    }
    await expectResultVisible();
    const live = layers().current!;
    expect(live.textContent).toContain("2/3");
    await tick(5000);
    expect(layers().outgoing).toBeNull();
    expect(saveDailyResultRemote).not.toHaveBeenCalled();
  }, 15000);
});
