import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MultiplayerGameView, { wrongPairFromGrowth } from "@/components/MultiplayerGameView";
import { initialState, SETTLE_WRONG_MS } from "@/hooks/useGameState";
import { toPublicState } from "@/lib/publicState";
import { SETTLE_REVEAL_HOLD_MS } from "@/lib/animationTiming";

if (typeof globalThis.DOMRect === "undefined") {
  (globalThis as Record<string, unknown>).DOMRect = class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
    get top() { return this.y; } get left() { return this.x; }
    get right() { return this.x + this.width; } get bottom() { return this.y + this.height; }
  };
}

describe("Together wrong-claim pair on a joiner", () => {
  it("finds the two cards a wrong claim just locked", () => {
    expect(wrongPairFromGrowth([[], [4]], [[5, 2], [4]])).toEqual({ seat: 0, idxs: [2, 5] });
    expect(wrongPairFromGrowth([[1, 3]], [[1, 3, 6, 7]])).toEqual({ seat: 0, idxs: [6, 7] });
    expect(wrongPairFromGrowth([[1]], [[1]])).toBeNull();
  });

  it("shakes the locked pair from SETTLING/WRONG with no prior two-card selection", async () => {
    const seatMap = [
      { seat: 0, pid: "host", display_name: "HOST" },
      { seat: 1, pid: "joiner", display_name: "JOIN" },
    ];
    const base = toPublicState(initialState(9, { seatCount: 2 } as never), seatMap, 1, "g1");
    const card = base.grid.find((g) => g.card)?.card ?? ({ id: 1, shape: "circle", color: "red", number: 1 } as never);
    const grid = base.grid.map(() => ({ occupied: true, card }));
    const props = {
      mySeat: 1, onIntent: () => {}, onLeave: () => {}, roomId: "r1", visitorId: "joiner", isHost: false,
    };
    const idle = {
      ...base, grid, phase: "FLIPPING" as const, settleKind: null,
      selectedCards: [], matchedCards: [], wrongBy: [[], []],
    };
    const { container, rerender } = render(
      <MemoryRouter><MultiplayerGameView {...props} publicState={idle} /></MemoryRouter>,
    );
    expect(container.querySelectorAll(".ww-wrong")).toHaveLength(0);
    // Arrive just after the reveal hold so the shake starts right away.
    const settling = {
      ...idle, phase: "SETTLING" as const, settleKind: "WRONG" as const,
      wrongBy: [[2, 5], []],
      settleEndsAt: Date.now() + SETTLE_WRONG_MS - SETTLE_REVEAL_HOLD_MS - 50,
    };
    rerender(<MemoryRouter><MultiplayerGameView {...props} publicState={settling} /></MemoryRouter>);
    await waitFor(() => expect(container.querySelectorAll(".ww-wrong")).toHaveLength(2));
  });
});
