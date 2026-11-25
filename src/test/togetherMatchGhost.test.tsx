import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/DailyMatchGhost", () => ({
  default: ({ pair }: { pair: unknown[] }) => (
    <div>{pair.map((_, i) => <div key={i} data-testid="match-ghost" />)}</div>
  ),
}));

import MultiplayerGameView, { matchGhostIndices } from "@/components/MultiplayerGameView";
import { initialState } from "@/hooks/useGameState";
import { toPublicState } from "@/lib/publicState";

if (typeof globalThis.DOMRect === "undefined") {
  (globalThis as Record<string, unknown>).DOMRect = class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
    get top() { return this.y; } get left() { return this.x; }
    get right() { return this.x + this.width; } get bottom() { return this.y + this.height; }
  };
}

describe("Together match ghost on a joiner", () => {
  it("prefers matchedCards over a stale last pair", () => {
    expect(matchGhostIndices([2, 5], [0, 1])).toEqual([2, 5]);
    expect(matchGhostIndices([], [0, 1])).toEqual([0, 1]);
  });

  it("mounts two ghosts from SETTLING/MATCH with no prior two-card selection", async () => {
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
    const idle = { ...base, grid, phase: "AWAITING_ROLL" as const, settleKind: null, selectedCards: [], matchedCards: [] };
    const { rerender } = render(<MemoryRouter><MultiplayerGameView {...props} publicState={idle} /></MemoryRouter>);
    expect(screen.queryAllByTestId("match-ghost")).toHaveLength(0);
    const settling = {
      ...idle, phase: "SETTLING" as const, settleKind: "MATCH" as const,
      selectedCards: [], matchedCards: [2, 5], settleEndsAt: Date.now() + 5000,
    };
    rerender(<MemoryRouter><MultiplayerGameView {...props} publicState={settling} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId("match-ghost")).toHaveLength(2));
  });
});
