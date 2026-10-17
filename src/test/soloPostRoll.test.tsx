import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import { POST_ROLL_BUFFER_MS } from "@/lib/whoopBrain";
import { useSoloGame } from "@/hooks/useSoloGame";

const mock = vi.hoisted(() => ({
  state: {} as any,
  dispatch: vi.fn(),
  roll: vi.fn(),
  resolveRoll: undefined as (() => void) | undefined,
  names: [] as string[],
}));
vi.mock("@/hooks/useGameState", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useGameState")>("@/hooks/useGameState");
  return { ...actual, useGameState: (_size: string, options: { names: string[] }) => {
    mock.names = options.names;
    return { state: mock.state, dispatch: mock.dispatch, doRollDice: mock.roll };
  } };
});
vi.mock("@/lib/publicState", () => ({ toPublicState: (_state: unknown, seats: unknown) => ({ seats }) }));
vi.mock("@/lib/rolls", () => ({
  pickRoll: () => ({ attribute: "SHAPE", faceIndex: 0 }), pickTumbleSeed: () => 1, rngOf: () => () => 0,
}));
vi.mock("@/lib/whoopBrain", async () => ({
  ...await vi.importActual<typeof import("@/lib/whoopBrain")>("@/lib/whoopBrain"),
  findClaim: () => ({ a: 0, b: 1, confidence: 2 }), pickReactionDelay: () => 600,
}));

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  mock.dispatch.mockClear();
  mock.state = {
    phase: "AWAITING_ROLL", roundNum: 1, roller: 0, rolling: false,
    grid: [null, null], peekingCard: null, scores: [0, 0], wrongBy: [new Set(), new Set()],
    disconnected: [false, false], missesThisRound: [0, 0], rule: ["SHAPE"],
    inFlight: false, claimBy: null, settleKind: null,
  };
  mock.roll.mockImplementation(() => new Promise<void>((resolve) => { mock.resolveRoll = resolve; }));
  return renderHook(() => useSoloGame());
}
const claims = () => mock.dispatch.mock.calls.filter(([action]) => action.type === "CLAIM_START");
afterEach(() => { cleanup(); vi.useRealTimers(); setUmbrellaPreviewForTests(null); });

describe("Solo post-roll grace", () => {
  it("waits 1800ms after the full visible roll even after a long wait to roll", async () => {
    const hook = setup();
    act(() => { vi.advanceTimersByTime(10000); });
    act(() => { hook.result.current.onIntent({ type: "REQUEST_ROLL" }); vi.advanceTimersByTime(150 + ROLL_HERO_MS); });
    mock.state = { ...mock.state, phase: "FLIPPING" };
    await act(async () => { mock.resolveRoll?.(); });
    hook.rerender();
    act(() => { vi.advanceTimersByTime(POST_ROLL_BUFFER_MS - 1); });
    expect(POST_ROLL_BUFFER_MS).toBe(1800);
    expect(claims()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(401); });
    expect(claims()).toHaveLength(1);
  });

  it("retains the full grace when a delayed roll completes late", async () => {
    const hook = setup();
    act(() => { hook.result.current.onIntent({ type: "REQUEST_ROLL" }); vi.advanceTimersByTime(10000); });
    mock.state = { ...mock.state, phase: "FLIPPING" };
    await act(async () => { mock.resolveRoll?.(); });
    hook.rerender();
    act(() => { vi.advanceTimersByTime(1799); });
    expect(claims()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(401); });
    expect(claims()).toHaveLength(1);
  });

  it("names the ON opponent FELIX and preserves the OFF opponent", () => {
    setUmbrellaPreviewForTests(true);
    const hook = setup();
    expect(mock.names[1]).toBe("FELIX");
    setUmbrellaPreviewForTests(false);
    hook.rerender();
    expect(mock.names[1]).toBe("WHOOP");
  });
});