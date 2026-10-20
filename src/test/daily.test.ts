import { describe, it, expect } from "vitest";
import {
  getDailyDateKey,
  getLocalDateString,
  getDailyNumber,
  getDailySeed,
  dailyStorageKey,
  formatDailyShare,
  formatDailyShareCaption,
  DAILY_LAUNCH_UTC,
} from "@/lib/daily";
import {
  dailyReducer,
  initDailyState,
  liveElapsedMs,
  formatSeconds,
  pairsFor,
  rollsAreSolvable,
  remainingCount,
  currentRoll,
  canPeek,
  STUDY_MS,
  MISSES_PER_ROUND,
  DAILY_ROUNDS,
  type DailyState,
} from "@/lib/dailyEngine";
import { createRng } from "@/lib/rng";
import { createDeck } from "@/cardData";
import { pickRoll } from "@/lib/rolls";

/** Build a Date whose LOCAL calendar parts are exactly the ones given. */
const localDate = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("getDailySeed", () => {
  it("formats whoop-YYYY-MM-DD from local parts", () => {
    expect(getDailySeed(localDate(2026, 8, 4, 5))).toBe("whoop-2026-08-04");
    expect(getDailyDateKey(localDate(2026, 1, 9, 23))).toBe("2026-01-09");
    expect(getLocalDateString(localDate(2026, 1, 9, 23))).toBe("2026-01-09");
  });

  it("is the same for any time on the same local date", () => {
    expect(getDailySeed(localDate(2026, 8, 4, 0))).toBe(getDailySeed(localDate(2026, 8, 4, 23)));
  });

  it("differs for consecutive local dates", () => {
    expect(getDailySeed(localDate(2026, 8, 4))).not.toBe(getDailySeed(localDate(2026, 8, 5)));
  });

  it("two devices in different time zones on the same calendar date share the seed", () => {
    // Same wall-clock calendar date, different absolute instants (different
    // zone offsets) — the local date string is what matters.
    const tokyo = localDate(2026, 8, 4, 9);
    const newYork = localDate(2026, 8, 4, 20);
    expect(getDailySeed(tokyo)).toBe(getDailySeed(newYork));
    expect(getDailyNumber(tokyo)).toBe(getDailyNumber(newYork));
  });

  it("keys storage per seed", () => {
    expect(dailyStorageKey("whoop-2026-08-04")).toBe("ww_daily_whoop-2026-08-04");
  });
});

describe("getDailyNumber", () => {
  it("starts at 1 on launch day, 11 August 2026", () => {
    expect(getDailyNumber(localDate(2026, 8, 11))).toBe(1);
    expect(DAILY_LAUNCH_UTC).toBe(Date.UTC(2026, 7, 11));
  });

  it("is #2 the day after launch", () => {
    expect(getDailyNumber(localDate(2026, 8, 12))).toBe(2);
  });

  it("counts local calendar days elapsed since launch", () => {
    expect(getDailyNumber(localDate(2026, 8, 14, 0))).toBe(4);
    expect(getDailyNumber(localDate(2026, 9, 10, 18))).toBe(31);
  });

  it("never reuses launch day's number for a pre-launch date", () => {
    // Unclamped by design: a clamp to 1 would collide with launch day.
    expect(getDailyNumber(localDate(2026, 8, 10))).toBe(0);
    expect(getDailyNumber(localDate(2026, 8, 9))).toBe(-1);
    expect(getDailyNumber(localDate(2020, 1, 1))).toBeLessThan(0);
  });


  it("advances exactly one day across a daylight saving transition", () => {
    // US spring forward 2027-03-14, fall back 2027-11-07.
    const springKeys = [13, 14, 15].map((d) => getLocalDateString(localDate(2027, 3, d)));
    expect(springKeys).toEqual(["2027-03-13", "2027-03-14", "2027-03-15"]);
    const spring = [13, 14, 15].map((d) => getDailyNumber(localDate(2027, 3, d)));
    expect(spring[1] - spring[0]).toBe(1);
    expect(spring[2] - spring[1]).toBe(1);

    const fall = [6, 7, 8].map((d) => getDailyNumber(localDate(2027, 11, d)));
    expect(fall[1] - fall[0]).toBe(1);
    expect(fall[2] - fall[1]).toBe(1);
    expect(new Set([6, 7, 8].map((d) => getDailySeed(localDate(2027, 11, d)))).size).toBe(3);
  });
});


const SEED = "whoop-2026-08-04";

describe("daily board and dice are reproducible from the seed", () => {
  it("same seed, same nine cards and same three dice", () => {
    const a = initDailyState(SEED);
    const b = initDailyState(SEED);
    expect(a.grid.map((c) => c!.id)).toEqual(b.grid.map((c) => c!.id));
    expect(a.rolls).toEqual(b.rolls);
    expect(a.grid).toHaveLength(9);
    expect(a.rolls).toHaveLength(DAILY_ROUNDS);
  });

  it("draws all three rolls from the seeded source, in order, after the deal", () => {
    const s = initDailyState(SEED);
    // Reproduce the seeded stream: deck first, then rolls with the bounded
    // repeat re-draw and the triple block — exactly what init does.
    const ATTRS = ["SHAPE", "NUMBER", "COLOR"] as const;
    const rng = createRng(SEED);
    const grid = createDeck(rng).slice(0, 9);
    expect(s.grid.map((c) => c!.id)).toEqual(grid.map((c) => c.id));
    let rolls = [] as { attribute: (typeof ATTRS)[number]; faceIndex: 0 | 1 }[];
    for (let attempt = 0; attempt < 500; attempt++) {
      const candidate = [] as { attribute: (typeof ATTRS)[number]; faceIndex: 0 | 1 }[];
      for (let r = 0; r < 3; r++) {
        let roll = pickRoll(ATTRS, rng);
        for (let i = 0; i < 2; i++) {
          if (r === 0 || roll.attribute !== candidate[r - 1].attribute) break;
          roll = pickRoll(ATTRS, rng);
        }
        if (r === 2 && candidate[0].attribute === candidate[1].attribute) {
          for (let g = 0; g < 50; g++) {
            if (roll.attribute !== candidate[r - 1].attribute) break;
            roll = pickRoll(ATTRS, rng);
          }
        }
        candidate.push(roll);
      }
      if (rollsAreSolvable(grid, candidate)) {
        rolls = candidate;
        break;
      }
    }
    expect(s.rolls).toEqual(rolls);
  });

  it("never rolls the same rule three times in a row", () => {
    for (let d = 0; d < 400; d++) {
      const date = new Date(Date.UTC(2026, 7, 11 + d));
      const { rolls } = initDailyState(`whoop-${date.toISOString().slice(0, 10)}`);
      const same =
        rolls[0].attribute === rolls[1].attribute &&
        rolls[1].attribute === rolls[2].attribute;
      expect(same).toBe(false);
    }
  });

  it("still allows a back-to-back repeat on a known repeating seed", () => {
    const { rolls } = initDailyState("whoop-2026-08-31");
    expect(rolls.map((r) => r.attribute)).toEqual(["COLOR", "COLOR", "NUMBER"]);
  });


  it("differs across days", () => {
    const a = initDailyState("whoop-2026-08-04");
    const b = initDailyState("whoop-2026-08-05");
    expect(a.grid.map((c) => c!.id)).not.toEqual(b.grid.map((c) => c!.id));
  });
});

describe("no-valid-pair guard", () => {
  it("every day's three rolls stay solvable on every reachable board", () => {
    for (let d = 1; d <= 40; d++) {
      const s = initDailyState(`whoop-2026-09-${String(d).padStart(2, "0")}`);
      expect(rollsAreSolvable(s.grid, s.rolls)).toBe(true);
    }
  });

  it("rejects a roll set whose later round has no pair", () => {
    const board = [
      { id: "a", shape: "circle", number: 1, color: "red", svgPath: "" },
      { id: "b", shape: "circle", number: 2, color: "blue", svgPath: "" },
    ] as never as (null | Parameters<typeof pairsFor>[0][number])[];
    expect(pairsFor(board, "SHAPE")).toHaveLength(1);
    expect(
      rollsAreSolvable(board, [
        { attribute: "SHAPE", faceIndex: 0 },
        { attribute: "COLOR", faceIndex: 0 },
      ])
    ).toBe(false);
  });
});

/** Advance the machine to PLAY of round 1, with the clock started at `at`. */
function toPlay(at = 1000): DailyState {
  let s = initDailyState(SEED);
  s = dailyReducer(s, { type: "START" });
  s = dailyReducer(s, { type: "REVEAL" });
  s = dailyReducer(s, { type: "HIDE" });
  s = dailyReducer(s, { type: "ROLL_START" });
  return dailyReducer(s, { type: "PLAY_START", at });
}

function pairFor(s: DailyState, correct: boolean): [number, number] {
  const attr = currentRoll(s).attribute;
  if (correct) return pairsFor(s.grid, attr)[0];
  for (let i = 0; i < s.grid.length; i++) {
    for (let j = i + 1; j < s.grid.length; j++) {
      const a = s.grid[i];
      const b = s.grid[j];
      if (!a || !b) continue;
      const same =
        attr === "SHAPE"
          ? a.shape === b.shape
          : attr === "NUMBER"
            ? a.number === b.number
            : a.color === b.color;
      if (!same) return [i, j];
    }
  }
  throw new Error("no mismatched pair on board");
}

/** Solve the current round correctly at time `at`. */
function solveRound(s: DailyState, at: number): DailyState {
  const [i, j] = pairFor(s, true);
  let n = dailyReducer(s, { type: "SELECT", idx: i });
  n = dailyReducer(n, { type: "SELECT", idx: j });
  return dailyReducer(n, { type: "RESOLVE", at });
}

/** Re-enter PLAY for the next round with the clock restarting at `at`. */
function nextRound(s: DailyState, at: number): DailyState {
  let n = dailyReducer(s, { type: "CLEAR_MATCH" });
  n = dailyReducer(n, { type: "ROLL_START" });
  return dailyReducer(n, { type: "PLAY_START", at });
}

describe("start gate", () => {
  it("stays on READY until START, running nothing", () => {
    const s = initDailyState(SEED);
    expect(s.phase).toBe("READY");
    expect(s.faceUp).toBe(false);
    expect(s.startedAt).toBeNull();
    expect(dailyReducer(s, { type: "REVEAL" })).toBe(s);
    expect(dailyReducer(s, { type: "SELECT", idx: 0 })).toBe(s);
    const started = dailyReducer(s, { type: "START" });
    expect(started.phase).toBe("DEAL");
    expect(dailyReducer(started, { type: "START" })).toBe(started);
  });
});

describe("daily phase sequence", () => {
  it("runs READY → DEAL → STUDY → HIDE → ROLL → PLAY, flipping up then down once", () => {
    let s = dailyReducer(initDailyState(SEED), { type: "START" });
    expect(s.phase).toBe("DEAL");

    s = dailyReducer(s, { type: "REVEAL" });
    expect(s.phase).toBe("STUDY");
    expect(s.faceUp).toBe(true);

    s = dailyReducer(s, { type: "HIDE" });
    expect(s.phase).toBe("HIDE");
    expect(s.faceUp).toBe(false);

    s = dailyReducer(s, { type: "ROLL_START" });
    expect(s.phase).toBe("ROLL");

    s = dailyReducer(s, { type: "PLAY_START", at: 500 });
    expect(s.phase).toBe("PLAY");
    expect(s.startedAt).toBe(500);
    expect(STUDY_MS).toBe(10000);
  });

  it("takes card taps directly during PLAY — no claim step", () => {
    const s = toPlay();
    expect(dailyReducer(s, { type: "SELECT", idx: 0 }).selected).toEqual([0]);
  });

  it("deselects on a second tap of the same card, with no miss", () => {
    let s = toPlay(0);
    s = dailyReducer(s, { type: "SELECT", idx: 0 });
    expect(s.selected).toEqual([0]);
    s = dailyReducer(s, { type: "SELECT", idx: 0 });
    expect(s.selected).toEqual([]);
    expect(s.phase).toBe("PLAY");
    expect(s.roundMisses).toBe(0);
    expect(s.totalMisses).toBe(0);
    expect(s.roundEvents[0]).toEqual([]);
    expect(s.wrongPair).toEqual([]);
  });

  it("locks the claim on a second, distinct tap and resolves it", () => {
    let s = toPlay(0);
    const [i, j] = pairFor(s, true);
    s = dailyReducer(s, { type: "SELECT", idx: i });
    s = dailyReducer(s, { type: "SELECT", idx: j });
    expect(s.selected).toEqual([i, j]);
    // a third tap cannot change a locked claim
    const other = s.grid.findIndex((c, k) => c !== null && k !== i && k !== j);
    expect(dailyReducer(s, { type: "SELECT", idx: other }).selected).toEqual([i, j]);
    s = dailyReducer(s, { type: "RESOLVE", at: 1000 });
    expect(s.roundsSolved).toBe(1);
    expect(s.roundEvents[0]).toEqual(["SOLVE"]);
  });
});

describe("three-round progression and shrinking board", () => {
  it("removes each matched pair for good: 9 → 7 → 5 → 3", () => {
    let s = toPlay(0);
    expect(remainingCount(s)).toBe(9);
    expect(s.roundIndex).toBe(1);

    s = solveRound(s, 1000);
    expect(s.phase).toBe("HIDE");
    expect(s.roundIndex).toBe(2);
    expect(remainingCount(s)).toBe(7);
    expect(s.faceUp).toBe(false);

    s = nextRound(s, 2000);
    expect(currentRoll(s).attribute).toBe(s.rolls[1].attribute);
    s = solveRound(s, 3000);
    expect(s.roundIndex).toBe(3);
    expect(remainingCount(s)).toBe(5);

    s = nextRound(s, 4000);
    s = solveRound(s, 5000);
    expect(s.phase).toBe("DONE");
    expect(remainingCount(s)).toBe(3);
    // 1s + 1s + 1s of play; roll gaps are not counted.
    expect(s.elapsedMs).toBe(3000);
    expect(s.totalMisses).toBe(0);
    expect(s.roundsSolved).toBe(3);
    expect(dailyReducer(s, { type: "SELECT", idx: 0 })).toBe(s);
  });

  it("pauses the clock between rounds", () => {
    let s = toPlay(0);
    s = solveRound(s, 1000);
    expect(s.startedAt).toBeNull();
    expect(liveElapsedMs(s, 9_999)).toBe(1000);
  });

  it("cannot select an emptied slot", () => {
    let s = toPlay(0);
    const [i] = pairFor(s, true);
    s = solveRound(s, 1000);
    s = nextRound(s, 2000);
    expect(dailyReducer(s, { type: "SELECT", idx: i }).selected).toEqual([]);
  });
});

const wrongOnce = (s: DailyState, at: number): DailyState => {
  const [i, j] = pairFor(s, false);
  let n = dailyReducer(s, { type: "SELECT", idx: i });
  n = dailyReducer(n, { type: "SELECT", idx: j });
  return dailyReducer(n, { type: "RESOLVE", at });
};

describe("per-round miss cap", () => {
  it("spends one miss and the round continues", () => {
    let s = toPlay(0);
    expect(MISSES_PER_ROUND).toBe(2);
    s = wrongOnce(s, 2000);
    expect(s.phase).toBe("PLAY");
    expect(s.roundIndex).toBe(1);
    expect(remainingCount(s)).toBe(9);
    expect(s.roundMisses).toBe(1);
    expect(s.totalMisses).toBe(1);
    expect(s.roundEvents[0]).toEqual(["MISS"]);
    expect(s.failed).toBe(false);
    expect(s.wrongPair).toHaveLength(2);
  });

  it("Whoops the round on the second miss, leaving the board untouched", () => {
    let s = toPlay(0);
    s = wrongOnce(s, 500);
    s = dailyReducer(s, { type: "CLEAR_WRONG" });
    s = wrongOnce(s, 1000);
    expect(s.roundMisses).toBe(2);
    expect(s.phase).toBe("WHOOPED");
    expect(remainingCount(s)).toBe(9);
    expect(s.faceUp).toBe(false);

    s = dailyReducer(s, { type: "ROUND_END", at: 1500 });
    expect(s.phase).toBe("HIDE");
    expect(s.roundIndex).toBe(2);
    // a failed round keeps its cards: the board does not shrink
    expect(remainingCount(s)).toBe(9);
    expect(s.roundsSolved).toBe(0);
    expect(s.faceUp).toBe(false);
  });

  it("resets misses each round", () => {
    let s = toPlay(0);
    s = wrongOnce(s, 500);
    s = dailyReducer(s, { type: "CLEAR_WRONG" });
    expect(s.roundMisses).toBe(1);
    s = solveRound(s, 1000);
    expect(s.roundMisses).toBe(0);
    s = nextRound(s, 2000);
    s = wrongOnce(s, 2500);
    s = dailyReducer(s, { type: "CLEAR_WRONG" });
    expect(s.roundMisses).toBe(1);
    expect(s.totalMisses).toBe(2);
    s = solveRound(s, 3000);
    s = nextRound(s, 4000);
    expect(s.roundMisses).toBe(0);
    s = solveRound(s, 5000);
    expect(s.phase).toBe("DONE");
    expect(s.roundsSolved).toBe(3);
    expect(s.totalMisses).toBe(2);
    expect(s.roundEvents).toEqual([["MISS", "SOLVE"], ["MISS", "SOLVE"], ["SOLVE"]]);
    expect(s.failed).toBe(false);
  });

  it("never ends the run early — all three rounds are played", () => {
    let s = toPlay(0);
    for (let r = 0; r < DAILY_ROUNDS; r++) {
      s = wrongOnce(s, 100 * (r + 1));
      s = dailyReducer(s, { type: "CLEAR_WRONG" });
      expect(s.phase).toBe("PLAY");
      s = wrongOnce(s, 200 * (r + 1));
      expect(s.phase).toBe("WHOOPED");
      s = dailyReducer(s, { type: "ROUND_END", at: 300 * (r + 1) });
      if (r < DAILY_ROUNDS - 1) {
        s = nextRound(s, 1000 * (r + 1));
      }
    }
    expect(s.phase).toBe("DONE");
    expect(s.roundsSolved).toBe(0);
    expect(s.totalMisses).toBe(6);
    expect(s.failed).toBe(true);
    // three failed rounds remove nothing
    expect(remainingCount(s)).toBe(9);
  });

  it("records zero misses on a clean run", () => {
    let s = toPlay(0);
    s = solveRound(s, 1000);
    s = nextRound(s, 2000);
    s = solveRound(s, 3000);
    s = nextRound(s, 4000);
    s = solveRound(s, 5000);
    expect(s.phase).toBe("DONE");
    expect(s.totalMisses).toBe(0);
    expect(s.failed).toBe(false);
    expect(formatSeconds(s.elapsedMs!)).toBe("3.0");
  });
});

describe("peek", () => {
  it("reveals the board once per run and then locks out", () => {
    let s = toPlay(0);
    expect(canPeek(s)).toBe(true);
    s = dailyReducer(s, { type: "PEEK" });
    expect(s.peeking).toBe(true);
    expect(s.faceUp).toBe(true);
    expect(s.peekUsed).toBe(true);
    expect(s.peekRound).toBe(1);
    // no card taps mid-peek
    expect(dailyReducer(s, { type: "SELECT", idx: 0 })).toBe(s);

    s = dailyReducer(s, { type: "PEEK_END" });
    expect(s.peeking).toBe(false);
    expect(s.faceUp).toBe(false);
    expect(canPeek(s)).toBe(false);
    expect(dailyReducer(s, { type: "PEEK" })).toBe(s);
  });

  it("is not available mid-claim or before play", () => {
    const ready = initDailyState(SEED);
    expect(canPeek(ready)).toBe(false);
    expect(dailyReducer(ready, { type: "PEEK" })).toBe(ready);
    const picked = dailyReducer(toPlay(0), { type: "SELECT", idx: 0 });
    expect(canPeek(picked)).toBe(false);
    expect(dailyReducer(picked, { type: "PEEK" })).toBe(picked);
  });
});

describe("formatDailyShareCaption", () => {
  it("is a short invitation with the real puzzle number", () => {
    expect(formatDailyShareCaption(1)).toBe(
      "Hey! Look at my Whoop! Whoop! Daily #1.\nHave you done it yet?\nwhoop-whoop.com/daily"
    );
    expect(formatDailyShareCaption(14)).toBe(
      "Hey! Look at my Whoop! Whoop! Daily #14.\nHave you done it yet?\nwhoop-whoop.com/daily"
    );
    expect(formatDailyShareCaption(365)).toBe(
      "Hey! Look at my Whoop! Whoop! Daily #365.\nHave you done it yet?\nwhoop-whoop.com/daily"
    );
  });

  it("carries no score, marks or streak", () => {
    const caption = formatDailyShareCaption(7);
    expect(caption).not.toMatch(/[🔵🔴👀]/u);
    expect(caption).not.toMatch(/of 3|miss|streak|Better than/);
  });
});

describe("formatDailyShare", () => {
  const base = {
    seed: "whoop-2026-08-04",
    puzzleNumber: 14,
    attributes: ["SHAPE", "NUMBER", "COLOR"] as ("SHAPE" | "NUMBER" | "COLOR")[],
    elapsedMs: 12345,
    completedAt: "2026-08-04T00:00:00.000Z",
    peekUsed: false,
    peekRound: null,
  };

  it("formats a clean run", () => {
    expect(
      formatDailyShare({
        ...base,
        roundsSolved: 3,
        totalMisses: 0,
        roundEvents: [["SOLVE"], ["SOLVE"], ["SOLVE"]],
        failed: false,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔵 · R2 🔵 · R3 🔵\n3 of 3 · Clean\n\nhttps://whoop-whoop.com/daily"
    );
  });

  it("formats a run with misses", () => {
    expect(
      formatDailyShare({
        ...base,
        roundsSolved: 3,
        totalMisses: 2,
        roundEvents: [["SOLVE"], ["MISS", "SOLVE"], ["MISS", "SOLVE"]],
        failed: false,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔵 · R2 🔴🔵 · R3 🔴🔵\n3 of 3 · 2 misses\n\nhttps://whoop-whoop.com/daily"
    );
  });

  it("uses the singular for exactly one miss", () => {
    expect(
      formatDailyShare({
        ...base,
        roundsSolved: 2,
        totalMisses: 1,
        roundEvents: [["SOLVE"], ["MISS"], ["SOLVE"]],
        failed: false,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔵 · R2 🔴 · R3 🔵\n2 of 3 · 1 miss\n\nhttps://whoop-whoop.com/daily"
    );
  });

  it("leads the peek round with eyes", () => {
    expect(
      formatDailyShare({
        ...base,
        peekUsed: true,
        peekRound: 2,
        roundsSolved: 3,
        totalMisses: 3,
        roundEvents: [["SOLVE"], ["MISS", "SOLVE"], ["MISS", "MISS"]],
        failed: false,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔵 · R2 👀🔴🔵 · R3 🔴🔴\n3 of 3 · 3 misses\n\nhttps://whoop-whoop.com/daily"
    );
  });

  it("shows a Whooped round as misses with no solve", () => {
    expect(
      formatDailyShare({
        ...base,
        roundsSolved: 2,
        totalMisses: 2,
        roundEvents: [["SOLVE"], ["MISS", "MISS"], ["SOLVE"]],
        failed: false,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔵 · R2 🔴🔴 · R3 🔵\n2 of 3 · 2 misses\n\nhttps://whoop-whoop.com/daily"
    );
  });

  it("replaces the score line when every round fails", () => {
    expect(
      formatDailyShare({
        ...base,
        roundsSolved: 0,
        totalMisses: 6,
        roundEvents: [
          ["MISS", "MISS"],
          ["MISS", "MISS"],
          ["MISS", "MISS"],
        ],
        failed: true,
      })
    ).toBe(
      "WHOOP! WHOOP! #14\nR1 🔴🔴 · R2 🔴🔴 · R3 🔴🔴\nWhooped! Better luck tomorrow.\n\nhttps://whoop-whoop.com/daily"
    );
  });
});
