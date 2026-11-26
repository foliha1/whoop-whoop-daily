// Every Together rule, run against the table server with a fake clock.
import { describe, expect, it } from "vitest";
import { ROTATION_CLAIM_WINDOW_MS, CLAIM_ABANDON_MS } from "@/lib/animationTiming";
import { SETTLE_MATCH_MS, SETTLE_WRONG_MS, TARGET_SCORE } from "@/lib/gameEngine";
import { makeTable, matchingPair, rollAndSettle, startedTable, wrongPair } from "./harness";

describe("lobby", () => {
  it("seats players in order and only the host can start", () => {
    const t = makeTable();
    t.player("aaaaaaaa1", "Ana");
    t.player("bbbbbbbb2", "Ben");
    expect(t.game.seatList.map((s) => s.display_name)).toEqual(["Ana", "Ben"]);
    t.game.start("bbbbbbbb2");
    expect(t.game.isStarted).toBe(false);
    t.game.start("aaaaaaaa1");
    expect(t.game.isStarted).toBe(true);
    expect(t.lastState()?.phase).toBe("AWAITING_ROLL");
  });

  it("needs two players, holds six, and refuses new players mid-game", () => {
    const t = makeTable();
    t.player("solo-player-1");
    t.game.start("solo-player-1");
    expect(t.game.isStarted).toBe(false);
    for (let i = 2; i <= 7; i++) t.player(`player-${i}-xxxx`);
    expect(t.game.seatList.length).toBe(6);
    t.game.start("solo-player-1");
    t.player("late-player-9");
    expect(t.inbox.get("late-player-9")?.some((m) => m.t === "error" && m.reason === "game_in_progress")).toBe(true);
  });

  it("frees a lobby seat when someone leaves before the start", () => {
    const t = makeTable();
    t.player("aaaaaaaa1");
    t.player("bbbbbbbb2");
    t.player("cccccccc3");
    t.game.disconnect("bbbbbbbb2");
    expect(t.game.seatList.map((s) => [s.seat, s.pid])).toEqual([
      [0, "aaaaaaaa1"],
      [1, "cccccccc3"],
    ]);
  });

  it("cleans up names", () => {
    const t = makeTable();
    t.player("aaaaaaaa1", "  \u0007Very long name that goes on and on and on  ");
    expect(t.game.seatList[0].display_name).toBe("Very long name that goes");
  });
});

describe("roll", () => {
  it("only the roller may roll, and the die lands on time", () => {
    const t = startedTable(2);
    t.game.intent(t.pids[1], { type: "REQUEST_ROLL" }, "r1");
    expect(t.acks(t.pids[1]).at(-1)).toMatchObject({ accepted: false, reason: "not_your_roll" });
    t.game.intent(t.pids[0], { type: "REQUEST_ROLL" }, "r0");
    const commit = t.inbox.get(t.pids[1])!.find((m) => m.t === "roll_committed");
    expect(commit).toBeTruthy();
    t.clock.advance(200);
    expect(t.game.state.rolling).toBe(true);
    t.clock.advance(2000);
    expect(t.game.state.phase).toBe("FLIPPING");
    expect(commit && commit.t === "roll_committed" && t.game.state.rule[0]).toBe(
      commit && commit.t === "roll_committed" ? commit.payload.attribute : null,
    );
  });

  it("a double tap rolls once", () => {
    const t = startedTable(2);
    t.game.intent(t.pids[0], { type: "REQUEST_ROLL" });
    t.game.intent(t.pids[0], { type: "REQUEST_ROLL" });
    expect(t.all.filter((m) => m.t === "roll_committed").length).toBe(1);
  });

  it("board taps during the roll are refused as rolling", () => {
    const t = startedTable(2);
    t.game.intent(t.pids[0], { type: "REQUEST_ROLL" });
    t.clock.advance(300);
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 0 }, "f");
    expect(t.acks(t.pids[0]).at(-1)).toMatchObject({ accepted: false, reason: "rolling" });
  });
});

describe("flips", () => {
  it("two flips per turn, each revealed for 2 s, then the turn passes", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    t.game.intent(t.pids[1], { type: "FLIP_START", idx: 0 }, "x");
    expect(t.acks(t.pids[1]).at(-1)).toMatchObject({ accepted: false });
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 0 }, "a");
    expect(t.lastState()?.grid[0].card).not.toBeNull();
    expect(t.lastState()?.peekingCard).toBe(0);
    t.clock.advance(1999);
    expect(t.game.state.peekingCard).toBe(0);
    t.clock.advance(1);
    expect(t.lastState()?.grid[0].card).toBeNull();
    expect(t.game.state.flipper).toBe(0);
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 1 });
    t.clock.advance(2000);
    expect(t.game.state.flipper).toBe(1);
  });

  it("one flip at a time", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 0 }, "a");
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 1 }, "b");
    const flips = t.acks(t.pids[0]).filter((a) => a.t === "ack" && a.id !== "roll");
    expect(flips.map((a) => a.t === "ack" && a.accepted)).toEqual([true, false]);
  });
});

describe("WHOOP! WHOOP! claims", () => {
  it("first press wins; the second is too slow", () => {
    const t = startedTable(3);
    rollAndSettle(t);
    t.game.intent(t.pids[2], { type: "CLAIM" }, "c2");
    t.game.intent(t.pids[1], { type: "CLAIM" }, "c1");
    expect(t.acks(t.pids[2]).at(-1)).toMatchObject({ accepted: true });
    expect(t.acks(t.pids[1]).at(-1)).toMatchObject({ accepted: false, reason: "too_slow" });
    expect(t.game.state.claimBy).toBe(2);
    const grants = t.inbox.get(t.pids[0])!.filter((m) => m.t === "claim_grant");
    expect(grants).toHaveLength(1);
  });

  it("a right pair scores 2, plays the match hold, and the winner rolls next", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    const pair = matchingPair(t, 1)!;
    expect(pair).toBeTruthy();
    t.game.intent(t.pids[1], { type: "CLAIM" });
    t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[0] });
    expect(t.lastState()?.grid[pair[0]].card).toBeNull(); // one touch never shows a face
    t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[1] });
    t.game.intent(t.pids[1], { type: "PLAYER_RESOLVE_MATCH" });
    expect(t.game.state.scores).toEqual([0, 2]);
    expect(t.lastState()?.settleEndsAt).toBe(t.clock.now() + SETTLE_MATCH_MS);
    expect(t.all.some((m) => m.t === "event" && m.payload.kind === "GREAT_MATCH" && m.payload.seat === 1)).toBe(true);
    t.clock.advance(SETTLE_MATCH_MS);
    expect(t.game.state.phase).toBe("AWAITING_ROLL");
    expect(t.game.state.roller).toBe(1);
  });

  it("a wrong pair costs a card, shows NOPE, and play goes back to flipping", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    const pair = wrongPair(t, 1)!;
    t.game.intent(t.pids[1], { type: "CLAIM" });
    t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[0] });
    t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[1] });
    t.game.intent(t.pids[1], { type: "PLAYER_RESOLVE_MATCH" });
    expect(t.game.state.settleKind).toBe("WRONG");
    expect(t.all.some((m) => m.t === "event" && m.payload.kind === "NOPE")).toBe(true);
    t.clock.advance(SETTLE_WRONG_MS);
    expect(t.game.state.phase).toBe("FLIPPING");
    // The wrong pair stays face up for everyone this round.
    expect(t.lastState()?.grid[pair[0]].card).not.toBeNull();
  });

  it("two wrong calls and you are out of calls for the round", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    for (let k = 0; k < 2; k++) {
      const pair = wrongPair(t, 1)!;
      t.game.intent(t.pids[1], { type: "CLAIM" });
      t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[0] });
      t.game.intent(t.pids[1], { type: "PLAYER_SELECT_CARD", idx: pair[1] });
      t.game.intent(t.pids[1], { type: "PLAYER_RESOLVE_MATCH" });
      t.clock.advance(SETTLE_WRONG_MS);
    }
    t.game.intent(t.pids[1], { type: "CLAIM" }, "third");
    expect(t.acks(t.pids[1]).at(-1)).toMatchObject({ accepted: false, reason: "no_calls_left" });
    expect(t.inbox.get(t.pids[1])!.some((m) => m.t === "claim_reject" && m.payload.reason === "NO_CALLS_LEFT")).toBe(true);
  });

  it("cancel hands the board back with no penalty", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    t.game.intent(t.pids[1], { type: "CLAIM" });
    t.game.intent(t.pids[1], { type: "CANCEL_CLAIM" });
    expect(t.game.state.phase).toBe("FLIPPING");
    expect(t.game.state.claimBy).toBeNull();
    expect(t.game.state.scores).toEqual([0, 0]);
  });

  it("a claim nobody finishes expires after 9 s", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    t.game.intent(t.pids[1], { type: "CLAIM" });
    t.clock.advance(CLAIM_ABANDON_MS - 1);
    expect(t.game.state.phase).toBe("CLAIM_SELECTING");
    t.clock.advance(1);
    expect(t.game.state.phase).toBe("FLIPPING");
  });

  it("claim windows count up so phones can tell grants apart", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    const w0 = t.lastState()!.claimWindow;
    t.game.intent(t.pids[1], { type: "CLAIM" });
    t.game.intent(t.pids[1], { type: "CANCEL_CLAIM" });
    expect(t.lastState()!.claimWindow).toBe(w0 + 1);
  });
});

describe("rotation and the last-flip window", () => {
  it("after everyone flips with no claim, claims stay open 2 s, then the roll passes on", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    [0, 0, 1, 1].forEach((seat, k) => {
      t.game.intent(t.pids[seat], { type: "FLIP_START", idx: k }, `f${k}`);
      t.clock.advance(2000);
    });
    expect(t.acks(t.pids[0]).every((a) => a.t === "ack" && a.accepted)).toBe(true);
    expect(t.game.state.phase).toBe("CLAIM_WINDOW");
    expect(t.lastState()?.claimWindowEndsAt).toBe(t.clock.now() + ROTATION_CLAIM_WINDOW_MS);
    t.clock.advance(ROTATION_CLAIM_WINDOW_MS);
    expect(t.game.state.phase).toBe("AWAITING_ROLL");
    expect(t.game.state.roller).toBe(1);
  });
});

describe("players who leave", () => {
  it("a closed phone is skipped after 15 s and welcomed back on reconnect", () => {
    const t = startedTable(3);
    rollAndSettle(t);
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 0 });
    t.clock.advance(2000);
    t.game.disconnect(t.pids[1]);
    t.game.intent(t.pids[0], { type: "FLIP_START", idx: 1 });
    t.clock.advance(2000);
    expect(t.game.state.flipper).toBe(1);
    t.clock.advance(15000);
    expect(t.game.state.flipper).toBe(2); // skipped
    expect(t.lastState()?.disconnectedSeats).toEqual([1]);
    t.game.connect(t.pids[1]);
    expect(t.lastState(t.pids[1])?.disconnectedSeats).toEqual([]);
  });

  it("a hidden tab shows as away at once and is skipped after 15 s", () => {
    const t = startedTable(3);
    rollAndSettle(t);
    t.game.visibility(t.pids[0], true);
    expect(t.lastState()?.awaySeats).toEqual([0]);
    t.clock.advance(15000);
    expect(t.game.state.flipper).toBe(1);
    t.game.visibility(t.pids[0], false);
    expect(t.lastState()?.awaySeats).toEqual([]);
  });

  it("the game ends when fewer than two players remain for 60 s", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    t.game.disconnect(t.pids[1]);
    t.clock.advance(59_000);
    expect(t.game.state.phase).not.toBe("GAME_OVER");
    t.clock.advance(1_000);
    expect(t.game.state.phase).toBe("GAME_OVER");
  });

  it("a reconnecting phone gets the board and a mid-roll die at once", () => {
    const t = startedTable(2);
    t.game.disconnect(t.pids[1]);
    t.game.intent(t.pids[0], { type: "REQUEST_ROLL" });
    t.clock.advance(400);
    t.inbox.set(t.pids[1], []);
    t.game.connect(t.pids[1]);
    const got = t.inbox.get(t.pids[1])!.map((m) => m.t);
    expect(got).toContain("state");
    expect(got).toContain("roll_committed");
  });
});

describe("end of game and rematch", () => {
  it("reaching the target ends the game; only the host can rematch", () => {
    const t = startedTable(2);
    let guard = 0;
    while (t.game.state.phase !== "GAME_OVER" && guard++ < 200) {
      if (t.game.state.phase === "AWAITING_ROLL") rollAndSettle(t);
      const pair = matchingPair(t, 0);
      if (!pair) {
        t.game.intent(t.pids[t.game.state.flipper], {
          type: "FLIP_START",
          idx: t.game.state.grid.findIndex((c) => c),
        });
        t.clock.advance(4500);
        continue;
      }
      t.game.intent(t.pids[0], { type: "CLAIM" });
      t.game.intent(t.pids[0], { type: "PLAYER_SELECT_CARD", idx: pair[0] });
      t.game.intent(t.pids[0], { type: "PLAYER_SELECT_CARD", idx: pair[1] });
      t.game.intent(t.pids[0], { type: "PLAYER_RESOLVE_MATCH" });
      t.clock.advance(SETTLE_MATCH_MS);
    }
    expect(t.game.state.phase).toBe("GAME_OVER");
    expect(t.game.state.scores[0]).toBeGreaterThanOrEqual(TARGET_SCORE);
    const firstGame = t.game.gameId;
    t.game.intent(t.pids[1], { type: "NEW_GAME" }, "n1");
    expect(t.acks(t.pids[1]).at(-1)).toMatchObject({ accepted: false, reason: "host_only" });
    t.game.intent(t.pids[0], { type: "NEW_GAME" }, "n0");
    expect(t.game.gameId).not.toBe(firstGame);
    expect(t.game.state.scores).toEqual([0, 0]);
    expect(t.lastState()?.claimWindow).toBe(0);
  });
});

describe("hidden card faces", () => {
  it("the draw pile and face-down cards never leave the server", () => {
    const t = startedTable(2);
    rollAndSettle(t);
    const st = t.lastState()!;
    expect("deck" in st).toBe(false);
    expect(st.deckCount).toBe(48 - 9);
    expect(st.grid.every((g) => g.card === null)).toBe(true);
  });
});
