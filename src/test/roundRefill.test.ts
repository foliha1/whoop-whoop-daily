// v7.3: every round starts on a full board when the draw pile allows.
import { describe, expect, it } from "vitest";
import { initialState, reducer, type State } from "@/lib/gameEngine";

function endRoundWithoutClaim(s: State): State {
  // Force the rotation-claim-window path: the window expiring starts a round.
  const open: State = { ...s, phase: "CLAIM_WINDOW", claimWindowOpen: true, claimWindowToken: 7 };
  return reducer(open, { type: "CLAIM_WINDOW_EXPIRE", token: 7 });
}

describe("round refill", () => {
  it("fills empty spaces from returned cards before the next roll", () => {
    const base = initialState(9, { seatCount: 2, seed: "refill" });
    // Pile ran dry earlier, then two wrong claims returned two cards.
    const returned = base.deck.slice(0, 2);
    const s: State = { ...base, grid: [...base.grid.slice(0, 4), null, null, null, ...base.grid.slice(7)], deck: returned, drawEmpty: false };
    const next = endRoundWithoutClaim(s);
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.grid.filter((c) => c === null)).toHaveLength(1);
    expect(next.grid[4]).toEqual(returned[0]);
    expect(next.grid[5]).toEqual(returned[1]);
    expect(next.deck).toHaveLength(0);
    expect(next.drawEmpty).toBe(true);
  });

  it("leaves a full board alone", () => {
    const base = initialState(9, { seatCount: 2, seed: "full" });
    const next = endRoundWithoutClaim(base);
    expect(next.grid).toEqual(base.grid);
    expect(next.deck).toEqual(base.deck);
  });

  it("a board kept alive by returned cards does not end as a stalemate", () => {
    const base = initialState(9, { seatCount: 2, seed: "stale" });
    // One card on the board, empty pile would end the game; two returned cards keep it going.
    const s: State = { ...base, grid: [base.grid[0], ...Array(8).fill(null)], deck: base.deck.slice(0, 2) };
    const next = endRoundWithoutClaim(s);
    expect(next.phase).toBe("AWAITING_ROLL");
    expect(next.grid.filter((c) => c !== null)).toHaveLength(3);
  });
});
