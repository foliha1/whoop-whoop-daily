import { describe, expect, it } from "vitest";
import { skillBadgesFrom } from "@/lib/skillBadges";
import { badgeCriteria, badgeGroups, badgeName } from "@/lib/badgeCatalog";

const game = (n: number, o: { solved?: number; misses?: number; peek?: boolean } = {}) => ({
  puzzle_number: n,
  puzzle_date: new Date(Date.UTC(2026, 7, 10 + n)).toISOString().slice(0, 10),
  rounds_solved: o.solved ?? 3,
  total_misses: o.misses ?? 0,
  peek_used: o.peek ?? false,
});
const date = (n: number) => game(n).puzzle_date;
const keys = (rows: ReturnType<typeof game>[]) => skillBadgesFrom(rows).map((b) => b.key);

describe("skill badges", () => {
  it("needs all 3 rounds and zero misses for a clean run", () => {
    expect(keys([game(1, { misses: 1 }), game(2, { solved: 2 })])).toEqual([]);
    expect(skillBadgesFrom([game(1, { peek: true })])).toEqual([{ key: "clean-1", earnedOn: date(1) }]);
  });

  it("gives Perfect Day only to a clean run with no Peek", () => {
    expect(skillBadgesFrom([game(1, { peek: true }), game(2)])).toEqual([
      { key: "clean-1", earnedOn: date(1) },
      { key: "perfect-day", earnedOn: date(2) },
    ]);
  });

  it("dates ladder badges to the game that reached the count, in any order", () => {
    const rows = Array.from({ length: 25 }, (_, i) => game(25 - i, { peek: true }));
    expect(skillBadgesFrom(rows)).toEqual([
      { key: "clean-1", earnedOn: date(1) },
      { key: "clean-10", earnedOn: date(10) },
      { key: "clean-25", earnedOn: date(25) },
    ]);
  });

  it("counts No Peek on any 10 games, not in a row, solved or not", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => game(i + 1, { solved: 0, misses: 6 })),
      game(10, { solved: 2, misses: 2, peek: true }),
      game(11, { solved: 1, misses: 4 }),
    ];
    expect(skillBadgesFrom(rows)).toEqual([{ key: "no-peek", earnedOn: date(11) }]);
  });

  it("counts a repeated puzzle once", () => {
    expect(keys(Array.from({ length: 10 }, () => game(1, { solved: 0, misses: 6 })))).toEqual([]);
  });

  it("has names, rules and a place in the grid", () => {
    expect(badgeName("perfect-day")).toBe("Perfect Day");
    expect(badgeCriteria("no-peek")).toBe("Finish 10 Dailies without using Peek.");
    expect(badgeGroups(false).map((g) => g.title)).toEqual(["Score Tiers", "Skill", "Streaks"]);
  });
});

describe("skill badge art", () => {
  it("has art for every skill badge", async () => {
    const { badgeArt } = await import("@/lib/whoopTiers");
    for (const key of ["clean-1", "clean-10", "clean-25", "perfect-day", "no-peek"]) expect(badgeArt(key)).toBeTruthy();
  });
});
