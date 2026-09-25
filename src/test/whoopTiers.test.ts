// Presentation rules for the Whoop Score: the names players read, the
// badge art gate, and the results-screen change line.

import { describe, expect, it } from "vitest";
import {
  BADGE_ART,
  SCORE_LABEL,
  TIER_LADDER,
  badgeArt,
  formatPointsChange,
  formatPointsToNext,
  formatTierShare,
  tierName,
  tierRange,
} from "@/lib/whoopTiers";

describe("Whoop Score presentation", () => {
  it("names every tier exactly as the brand does", () => {
    expect(SCORE_LABEL).toBe("YOUR WHOOP! WHOOP! SCORE");
    expect(tierName("rookie")).toBe("Rookie");
    expect(tierName("great_eye")).toBe("Great Eye");
    expect(tierName("match_maker")).toBe("Match Maker");
    expect(tierName("xray_vision")).toBe("X-ray Vision");
    expect(tierName("legend")).toBe("Whoop Legend");
  });

  it("draws the ladder lowest first, with the bands the engine uses", () => {
    expect(TIER_LADDER.map((t) => t.floor)).toEqual([0, 25, 75, 150, 300]);
    expect(tierRange("rookie")).toBe("0\u201324");
    expect(tierRange("great_eye")).toBe("25\u201374");
    expect(tierRange("legend")).toBe("300+");
  });

  it("shows a badge only when its art exists", () => {
    expect(badgeArt("rookie")).toBe("/badges/rookie.svg");
    expect(badgeArt("great_eye")).toBe("/badges/great_eye.svg");
    expect(badgeArt("match_maker")).toBe("/badges/match_maker.svg");
    expect(badgeArt("xray_vision")).toBe("/badges/xray_vision.svg");
    expect(badgeArt("legend")).toBe("/badges/legend.svg");
    expect(badgeArt("unknown_badge")).toBeNull();
    // Every mapped badge points at a file under /badges.
    for (const path of Object.values(BADGE_ART)) {
      expect(path.startsWith("/badges/")).toBe(true);
    }
  });

  it("reports today's earning, and a tier-up only on a real crossing", () => {
    // 21 → 25 crosses into Great Eye.
    const up = formatPointsChange(4, 21, 25);
    expect(up.text).toBe("+4 today");
    expect(up.tierUp).toBe(true);

    // 10 → 14 stays inside Rookie.
    expect(formatPointsChange(4, 10, 14).tierUp).toBe(false);

    // A day not yet played shows nothing.
    const none = formatPointsChange(null, null, 30);
    expect(none.text).toBeNull();
    expect(none.tierUp).toBe(false);

    // Zero earned today is never a tier-up.
    expect(formatPointsChange(0, 25, 25).tierUp).toBe(false);
  });

  it("writes the share and next-tier lines in player words", () => {
    expect(formatTierShare(0.184, "match_maker")).toBe("18% of players are Match Maker");
    expect(formatPointsToNext(12, 75)).toBe("12 points to Match Maker");
    expect(formatPointsToNext(1, 25)).toBe("1 point to Great Eye");
  });
});
