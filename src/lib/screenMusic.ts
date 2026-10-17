import { THEME_MP3 } from "@/lib/assetUrls";

export type MusicScreen = "entry" | "stats" | "results" | "gameplay" | "howTo";

/** Runtime ON also includes the authorized admin preview. */
export function screenMusic(screen: MusicScreen, umbrella: boolean, legacyTrack = THEME_MP3.daily): string | null {
  if (screen === "gameplay") return null;
  if (screen === "howTo") return THEME_MP3.howTo;
  if (!umbrella) return legacyTrack;
  return screen === "stats" || screen === "results" ? THEME_MP3.daily : THEME_MP3.classic;
}