// Daily study levels (trial). The chosen level only sets how long the nine
// cards stay face up during STUDY; scoring, results and share are unchanged.
import { STUDY_MS } from "@/lib/dailyEngine";

export type StudyLevel = "blink" | "glance" | "look" | "study";

export const STUDY_LEVELS: readonly { key: StudyLevel; name: string; ms: number }[] = [
  { key: "blink", name: "Blink", ms: 3000 },
  { key: "glance", name: "Glance", ms: 6000 },
  { key: "look", name: "Look", ms: STUDY_MS },
  { key: "study", name: "Study", ms: 15000 },
];

export const DEFAULT_STUDY_LEVEL: StudyLevel = "look";

/** Unknown or missing levels (older results) count as Look. */
export function normalizeStudyLevel(value: unknown): StudyLevel {
  return STUDY_LEVELS.some((l) => l.key === value) ? (value as StudyLevel) : DEFAULT_STUDY_LEVEL;
}

/**
 * Score bonus for a finished run; mirrors public.whoop_points_study_bonus.
 * Blink: +0.5 per solved round. Glance: the same, minus the first solved round.
 */
export function studyLevelBonus(level: unknown, roundsSolved: number): number {
  const solved = Math.max(0, Math.min(3, roundsSolved || 0));
  const key = normalizeStudyLevel(level);
  if (key === "blink") return 0.5 * solved;
  if (key === "glance") return 0.5 * Math.max(0, solved - 1);
  return 0;
}

export function studyMsFor(level: unknown): number {
  const key = normalizeStudyLevel(level);
  return STUDY_LEVELS.find((l) => l.key === key)!.ms;
}
