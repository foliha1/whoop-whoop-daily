// One place for every badge's name and how to earn it, so the shelf, the
// detail dialog and the All Badges grid always say the same thing.

import { KEEPSAKE_CRITERIA, KEEPSAKE_KEY, KEEPSAKE_NAME, isKeepsakeBadge } from "@/lib/daily100";
import {
  STREAK_MILESTONES,
  streakBadgeCriteria,
  streakBadgeKey,
  streakBadgeName,
  streakDays,
} from "@/lib/streakBadges";
import { SKILL_BADGE_KEYS, skillBadge } from "@/lib/skillBadges";
import { POINTS_TIER_FLOORS, type PointsTier } from "@/lib/whoopPoints";
import { TIER_LADDER, tierName } from "@/lib/whoopTiers";

export function badgeName(key: string): string {
  if (isKeepsakeBadge(key)) return KEEPSAKE_NAME;
  const days = streakDays(key);
  if (days !== null) return streakBadgeName(days);
  const skill = skillBadge(key);
  if (skill) return skill.name;
  return tierName(key as PointsTier) || key;
}

export function badgeCriteria(key: string): string {
  if (isKeepsakeBadge(key)) return KEEPSAKE_CRITERIA;
  const days = streakDays(key);
  if (days !== null) return streakBadgeCriteria(days);
  const skill = skillBadge(key);
  if (skill) return skill.criteria;
  const tier = POINTS_TIER_FLOORS.find((row) => row.tier === key);
  if (!tier) return "Earned through Daily play.";
  return tier.floor === 0 ? "Play your first Daily game." : `Reach ${tier.floor} total points.`;
}

export interface BadgeGroup {
  title: string;
  keys: string[];
}

/**
 * Every badge a player can see in the All Badges grid. The Daily #100 keepsake
 * could only be earned on one day, so it appears only for players who have it.
 */
export function badgeGroups(hasKeepsake: boolean): BadgeGroup[] {
  const groups: BadgeGroup[] = [
    { title: "Score Tiers", keys: TIER_LADDER.map((row) => row.tier) },
    { title: "Skill", keys: [...SKILL_BADGE_KEYS] },
    { title: "Streaks", keys: STREAK_MILESTONES.map((days) => streakBadgeKey(days)) },
  ];
  if (hasKeepsake) groups.push({ title: "Keepsakes", keys: [KEEPSAKE_KEY] });
  return groups;
}
