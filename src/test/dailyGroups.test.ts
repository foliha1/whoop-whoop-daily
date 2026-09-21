import { describe, expect, it } from "vitest";
import {
  GROUP_CODE_ALPHABET,
  GROUP_CODE_LENGTH,
  GROUP_MAX_MEMBERS,
  GROUP_MAX_PER_PERSON,
  bestStanding,
  formatStanding,
  groupJoinUrl,
  normalizeGroupCode,
  ordinal,
  pointsForPosition,
  rankScores,
  sameSeason,
  seasonPoints,
  seasonStart,
} from "@/lib/dailyGroups";

const s = (visitor_id: string, rounds_solved: number, total_misses: number) => ({
  visitor_id,
  rounds_solved,
  total_misses,
});

describe("today ranking", () => {
  it("ranks on rounds then misses", () => {
    const ranked = rankScores([s("a", 2, 0), s("b", 3, 4), s("c", 3, 1)]);
    expect(ranked.find((r) => r.visitor_id === "c")!.position).toBe(1);
    expect(ranked.find((r) => r.visitor_id === "b")!.position).toBe(2);
    expect(ranked.find((r) => r.visitor_id === "a")!.position).toBe(3);
  });

  it("shares a position for identical scores and skips to the next distinct", () => {
    const ranked = rankScores([s("a", 3, 0), s("b", 3, 0), s("c", 3, 0), s("d", 3, 1)]);
    expect(ranked.slice(0, 3).map((r) => r.position)).toEqual([1, 1, 1]);
    expect(ranked[3].position).toBe(4);
  });

  it("never uses elapsed time to break a tie", () => {
    const ranked = rankScores([
      { ...s("a", 3, 1), elapsed_ms: 1_000 },
      { ...s("b", 3, 1), elapsed_ms: 90_000 },
    ]);
    expect(ranked.map((r) => r.position)).toEqual([1, 1]);
  });
});

describe("season points", () => {
  it("awards 3/2/1 and nothing below third", () => {
    expect([1, 2, 3, 4, 20].map(pointsForPosition)).toEqual([3, 2, 1, 0, 0]);
  });

  it("gives every tied player the position's points and nothing to the next distinct", () => {
    const puzzle = { scores: [s("a", 3, 0), s("b", 3, 0), s("c", 3, 0), s("d", 3, 1)] };
    for (const v of ["a", "b", "c"]) {
      expect(seasonPoints(v, [puzzle]).points).toBe(3);
    }
    expect(seasonPoints("d", [puzzle]).points).toBe(0);
  });

  it("scores nothing for puzzles not played", () => {
    const puzzles = [
      { scores: [s("a", 3, 0), s("b", 2, 2)] },
      { scores: [s("a", 3, 0)] },
    ];
    expect(seasonPoints("b", puzzles)).toEqual({ points: 2, played: 1 });
    expect(seasonPoints("a", puzzles)).toEqual({ points: 6, played: 2 });
  });

  it("counts puzzles a mid-season joiner already played", () => {
    const week = [
      { scores: [s("a", 3, 0), s("late", 3, 0)] },
      { scores: [s("a", 3, 0), s("late", 2, 1)] },
    ];
    expect(seasonPoints("late", week)).toEqual({ points: 5, played: 2 });
  });
});

describe("season boundary", () => {
  // Puzzle 1 is 2026-08-11, a Tuesday.
  it("anchors seasons on Monday", () => {
    expect(seasonStart(1)).toBe("2026-08-10");
  });

  it("splits two puzzles either side of a Monday", () => {
    // Puzzle 6 = Sun 2026-08-16, puzzle 7 = Mon 2026-08-17.
    expect(seasonStart(6)).toBe("2026-08-10");
    expect(seasonStart(7)).toBe("2026-08-17");
    expect(sameSeason(6, 7)).toBe(false);
    expect(sameSeason(7, 12)).toBe(true);
  });
});

describe("caps and codes", () => {
  it("keeps the server-side caps in one place", () => {
    expect(GROUP_MAX_MEMBERS).toBe(20);
    expect(GROUP_MAX_PER_PERSON).toBe(5);
  });

  it("uses a 6-character code with no look-alike characters", () => {
    expect(GROUP_CODE_LENGTH).toBe(6);
    expect(GROUP_CODE_ALPHABET).toHaveLength(31);
    for (const ch of "ilo01") {
      expect(GROUP_CODE_ALPHABET).not.toContain(ch);
    }
  });
});

// ---------------------------------------------------- presentation helpers ---

describe("group presentation helpers", () => {
  it("formats ordinals, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st",
    ]);
  });

  it("prefers today's position, falls back to weekly points", () => {
    expect(formatStanding({ my_position: 2, my_points: 5 })).toBe("2nd today");
    expect(formatStanding({ my_position: null, my_points: 1 })).toBe("1 pt this week");
    expect(formatStanding({ my_position: null, my_points: 0 })).toBe("not played yet");
  });

  it("renders nothing to pick from with no groups", () => {
    expect(bestStanding([])).toBeNull();
  });

  it("normalises a pasted code: case, spaces and look-alikes dropped", () => {
    expect(normalizeGroupCode(" AbC-234 ")).toBe("abc234");
    expect(normalizeGroupCode("oil01abc234")).toBe("abc234");
    expect(normalizeGroupCode("abc234extra")).toHaveLength(GROUP_CODE_LENGTH);
  });

  it("builds a join link carrying the code", () => {
    expect(groupJoinUrl("abc234")).toBe("https://whoop-whoop.com/groups?join=abc234");
  });
});

// ------------------------------------------------------------- email linkage ---

describe("group member email linkage", () => {
  const links = [{ visitorId: "devA", email: "honest@example.com" }];
  const results = [
    { visitor_id: "victim", email: "victim@example.com", puzzle_number: 900 },
    { visitor_id: "imposter", email: null, puzzle_number: 900 },
    { visitor_id: "devA", email: "honest@example.com", puzzle_number: 899 },
    { visitor_id: "devB", email: "honest@example.com", puzzle_number: 900 },
  ];

  it("ignores an email the member is not linked to", () => {
    expect(isEmailLinkedToVisitor("imposter", "victim@example.com", links)).toBe(false);
    const mine = resultsForMember(
      { visitor_id: "imposter", email: "victim@example.com" },
      results,
      links,
    );
    expect(mine.map((r) => r.visitor_id)).toEqual(["imposter"]);
  });

  it("counts both devices for a genuinely linked email", () => {
    expect(isEmailLinkedToVisitor("devA", "HONEST@example.com ", links)).toBe(true);
    const mine = resultsForMember(
      { visitor_id: "devA", email: "honest@example.com" },
      results,
      links,
    );
    expect(mine.map((r) => r.visitor_id).sort()).toEqual(["devA", "devB"]);
  });

  it("matches by visitor id alone when no email is stored", () => {
    const mine = resultsForMember({ visitor_id: "devA", email: null }, results, links);
    expect(mine.map((r) => r.visitor_id)).toEqual(["devA"]);
  });
});
