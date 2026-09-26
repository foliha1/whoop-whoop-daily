// Host end-game guard: a 2-seat table with one dead-quiet seat must still
// reach END_GAME_TABLE_EMPTY. The isolation check must not misfire when
// lastSeenSpreadMs is null (which is the correct value on a 2-seat table
// with only one watched non-host visitor).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiplayerHost } from "@/hooks/useMultiplayerGame";

let randSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  randSpy.mockRestore();
});

const noopSubscribe = () => () => {};

describe("useMultiplayerHost end-game guard — 2-seat table", () => {
  it("fires END_GAME_TABLE_EMPTY on a 2-seat table with one dead seat, presence connected, spread=null", async () => {
    const seatMap = [
      { seat: 0, pid: "host", display_name: "Host" },
      { seat: 1, pid: "v1", display_name: "V1" },
    ];
    const { result } = renderHook(() =>
      useMultiplayerHost({
        channel: null,
        onBroadcast: noopSubscribe,
        seatMap,
        hostVisitorId: "host",
        enabled: true,
        gameId: "g1",
        roomId: "r1",
        disconnectedSeats: [1],
        awaySeats: [],
        endGameDisconnectedSeats: [1],
        presenceStatus: "connected",
        // Single watched non-host visitor → spread is not a signal.
        lastSeenSpreadMs: null,
      }),
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.phase).toBe("GAME_OVER");
  });

  it("does NOT fire when the host socket is not connected", async () => {
    const seatMap = [
      { seat: 0, pid: "host", display_name: "Host" },
      { seat: 1, pid: "v1", display_name: "V1" },
    ];
    const { result } = renderHook(() =>
      useMultiplayerHost({
        channel: null,
        onBroadcast: noopSubscribe,
        seatMap,
        hostVisitorId: "host",
        enabled: true,
        gameId: "g2",
        roomId: "r1",
        disconnectedSeats: [1],
        awaySeats: [],
        endGameDisconnectedSeats: [1],
        presenceStatus: "connecting",
        lastSeenSpreadMs: null,
      }),
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.phase).not.toBe("GAME_OVER");
  });
});
