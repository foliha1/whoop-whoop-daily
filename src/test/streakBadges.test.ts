import { describe, expect, it } from "vitest";
import { streakBadgesFrom, streakDays, withStreakBadges } from "@/lib/streakBadges";
import { badgeCriteria, badgeGroups, badgeName } from "@/lib/badgeCatalog";
import { badgeArt } from "@/lib/whoopTiers";

const day = (n: number) => ({
  puzzle_number: n,
  puzzle_date: new Date(Date.UTC(2026, 7, 10 + n)).toISOString().slice(0, 10),
});
const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i));

describe("streak badges", () => {
  it("earns nothing below three days in a row", () => {
    expect(streakBadgesFrom([day(1), day(2), day(4), day(5)])).toEqual([]);
  });

  it("dates each badge to the day the run reached the milestone", () => {
    expect(streakBadgesFrom(run(1, 8))).toEqual([
      { key: "streak-3", earnedOn: day(3).puzzle_date },
      { key: "streak-7", earnedOn: day(7).puzzle_date },
    ]);
  });

  it("keeps badges from the longest run after a streak breaks", () => {
    const rows = [...run(1, 15), ...run(20, 22)];
    expect(streakBadgesFrom(rows).map((b) => b.key)).toEqual(["streak-3", "streak-7", "streak-14"]);
  });

  it("ignores order and repeated puzzles", () => {
    const rows = [day(3), day(1), day(2), day(2), day(1)];
    expect(streakBadgesFrom(rows)).toEqual([{ key: "streak-3", earnedOn: day(3).puzzle_date }]);
  });

  it("reaches 365 on a full year", () => {
    const badges = streakBadgesFrom(run(1, 365));
    expect(badges).toHaveLength(8);
    expect(badges[7]).toEqual({ key: "streak-365", earnedOn: day(365).puzzle_date });
  });

  it("adds streak badges after others without duplicates", () => {
    const base = [{ key: "rookie", earnedOn: "2026-08-11" }, { key: "streak-3", earnedOn: "2026-08-13" }];
    expect(withStreakBadges(base, streakBadgesFrom(run(1, 7))).map((b) => b.key))
      .toEqual(["rookie", "streak-3", "streak-7"]);
  });

  it("knows every milestone's key, name, rule and art", () => {
    for (const n of [3, 7, 14, 30, 50, 100, 200, 365]) {
      expect(streakDays(`streak-${n}`)).toBe(n);
      expect(badgeName(`streak-${n}`)).toBe(`${n}-Day Streak`);
      expect(badgeCriteria(`streak-${n}`)).toBe(`Play the Daily ${n} days in a row.`);
      expect(badgeArt(`streak-${n}`)).toBeTruthy();
    }
    expect(streakDays("streak-4")).toBeNull();
  });

  it("lists the keepsake in the grid only once earned", () => {
    expect(badgeGroups(false).map((g) => g.title)).toEqual(["Score Tiers", "Skill", "Streaks"]);
    expect(badgeGroups(true).map((g) => g.title)).toEqual(["Score Tiers", "Skill", "Streaks", "Keepsakes"]);
    expect(badgeGroups(false)[0].keys).toEqual(["rookie", "great_eye", "match_maker", "xray_vision", "legend"]);
  });
});

describe("badge art files", () => {
  it("use no masked strokes, which leave hairline rings when scaled", async () => {
    const files = import.meta.glob("@/assets/badges/{streak,clean,perfect,no}_*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBe(13);
    for (const [name, svg] of Object.entries(files)) expect(svg, name).not.toMatch(/mask=/);
  });
});
