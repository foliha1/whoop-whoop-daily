// ============================================================================
// Skill badges (Daily).
//
// - Clean Run 1 / 10 / 25: games with all 3 rounds solved and zero misses
//   (the same rule as the Clean Runs stat).
// - Perfect Day: a full 5-point game. Zero misses means every round was solved
//   on the first try, so this is a clean run with no Peek.
// - No Peek: 10 games finished without using Peek. Not in a row.
// - Worked out from the identity-scoped get_daily_results history, like streak
//   badges, so past games count and signed-in players keep them everywhere.
// - earnedOn is the puzzle date of the game that reached the count.
// ============================================================================

import type { EarnedBadge } from "@/lib/whoopPoints";

export interface SkillHistoryRow {
  puzzle_number: number;
  puzzle_date: string;
  rounds_solved: number;
  total_misses: number;
  peek_used: boolean;
}

interface SkillBadgeDef {
  key: string;
  name: string;
  criteria: string;
  count: number;
  qualifies: (row: SkillHistoryRow) => boolean;
}

const isClean = (r: SkillHistoryRow) => Number(r.rounds_solved) >= 3 && Number(r.total_misses) === 0;

export const SKILL_BADGES: ReadonlyArray<SkillBadgeDef> = [
  { key: "clean-1", name: "Clean Run", criteria: "Solve all 3 rounds with zero misses.", count: 1, qualifies: isClean },
  { key: "clean-10", name: "10 Clean Runs", criteria: "Get 10 clean runs.", count: 10, qualifies: isClean },
  { key: "clean-25", name: "25 Clean Runs", criteria: "Get 25 clean runs.", count: 25, qualifies: isClean },
  { key: "perfect-day", name: "Perfect Day", criteria: "Score all 5 points in one Daily.", count: 1, qualifies: (r) => isClean(r) && !r.peek_used },
  { key: "no-peek", name: "No Peek", criteria: "Finish 10 Dailies without using Peek.", count: 10, qualifies: (r) => !r.peek_used },
];

export const SKILL_BADGE_KEYS = SKILL_BADGES.map((b) => b.key);

export function skillBadge(key: string): SkillBadgeDef | undefined {
  return SKILL_BADGES.find((b) => b.key === key);
}

/** Every skill badge the history has earned, in catalog order. */
export function skillBadgesFrom(rows: ReadonlyArray<SkillHistoryRow>): EarnedBadge[] {
  const seen = new Set<number>();
  const games = [...rows]
    .filter((r) => Number.isInteger(Number(r?.puzzle_number)) && typeof r?.puzzle_date === "string")
    .sort((a, b) => a.puzzle_number - b.puzzle_number)
    .filter((r) => (seen.has(r.puzzle_number) ? false : (seen.add(r.puzzle_number), true)));

  const earned: EarnedBadge[] = [];
  for (const def of SKILL_BADGES) {
    let n = 0;
    for (const game of games) {
      if (!def.qualifies(game)) continue;
      n += 1;
      if (n === def.count) {
        earned.push({ key: def.key, earnedOn: game.puzzle_date.slice(0, 10) });
        break;
      }
    }
  }
  return earned;
}
