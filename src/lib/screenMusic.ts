import { CLASSIC_THEME_FILE, DAILY_THEME_FILE, HOW_TO_PLAY_THEME_FILE } from "@/lib/sounds";

export type MusicScreen = "entry" | "stats" | "results" | "gameplay" | "howTo";

/** Runtime ON also includes the authorized admin preview. */
export function screenMusic(screen: MusicScreen, umbrella: boolean, legacyTrack = DAILY_THEME_FILE): string | null {
  if (screen === "gameplay") return null;
  if (screen === "howTo") return HOW_TO_PLAY_THEME_FILE;
  if (!umbrella) return legacyTrack;
  return screen === "stats" || screen === "results" ? DAILY_THEME_FILE : CLASSIC_THEME_FILE;
}