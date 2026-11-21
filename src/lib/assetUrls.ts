// Build-hashed URLs for static art and music. Everything here lives under
// src/assets so production serves it from /assets/<name>-<hash>.<ext> with the
// same year-long immutable caching as the JS and CSS.

import cardBack from "@/assets/cards/card-back.svg?url";
import dieShape from "@/assets/dice/match-shape.svg?url";
import dieNumber from "@/assets/dice/match-number.svg?url";
import dieColor from "@/assets/dice/match-color.svg?url";
import badgeRookie from "@/assets/badges/rookie.svg?url";
import badgeGreatEye from "@/assets/badges/great_eye.svg?url";
import badgeMatchMaker from "@/assets/badges/match_maker.svg?url";
import badgeXray from "@/assets/badges/xray_vision.svg?url";
import badgeLegend from "@/assets/badges/legend.svg?url";
import badgeStreak3 from "@/assets/badges/streak_3.svg?url";
import badgeStreak7 from "@/assets/badges/streak_7.svg?url";
import badgeStreak14 from "@/assets/badges/streak_14.svg?url";
import badgeStreak30 from "@/assets/badges/streak_30.svg?url";
import badgeStreak50 from "@/assets/badges/streak_50.svg?url";
import badgeStreak100 from "@/assets/badges/streak_100.svg?url";
import badgeStreak200 from "@/assets/badges/streak_200.svg?url";
import badgeStreak365 from "@/assets/badges/streak_365.svg?url";
import badgeClean1 from "@/assets/badges/clean_1.svg?url";
import badgeClean10 from "@/assets/badges/clean_10.svg?url";
import badgeClean25 from "@/assets/badges/clean_25.svg?url";
import badgePerfectDay from "@/assets/badges/perfect_day.svg?url";
import badgeNoPeek from "@/assets/badges/no_peek.svg?url";
import dailyMp3 from "@/assets/sounds/theme.mp3?url";
import classicMp3 from "@/assets/sounds/classic-theme.mp3?url";
import howToMp3 from "@/assets/sounds/how-to-play.mp3?url";
import dailyOgg from "@/assets/sounds/Whoop_Whoop_Daily_Theme.ogg?url";
import classicOgg from "@/assets/sounds/Whoop_Whoop_Classic_Theme.ogg?url";
import howToOgg from "@/assets/sounds/Whoop_Whoop_How_to_Play.ogg?url";

const FACES = import.meta.glob<string>("../assets/cards/[1-4]-*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const FACE_BY_NAME: Record<string, string> = {};
for (const [path, url] of Object.entries(FACES)) {
  FACE_BY_NAME[path.slice(path.lastIndexOf("/") + 1, -4)] = url;
}

/** A card face by its file stem, e.g. "2-star-red". */
export function cardArt(name: string): string {
  const url = FACE_BY_NAME[name];
  if (!url) throw new Error(`unknown card art: ${name}`);
  return url;
}

export const CARD_BACK_URL = cardBack;
export const DIE_ART = { SHAPE: dieShape, NUMBER: dieNumber, COLOR: dieColor } as const;
export const BADGE_URLS = {
  rookie: badgeRookie,
  great_eye: badgeGreatEye,
  match_maker: badgeMatchMaker,
  xray_vision: badgeXray,
  legend: badgeLegend,
  "streak-3": badgeStreak3,
  "streak-7": badgeStreak7,
  "streak-14": badgeStreak14,
  "streak-30": badgeStreak30,
  "streak-50": badgeStreak50,
  "streak-100": badgeStreak100,
  "streak-200": badgeStreak200,
  "streak-365": badgeStreak365,
  "clean-1": badgeClean1,
  "clean-10": badgeClean10,
  "clean-25": badgeClean25,
  "perfect-day": badgePerfectDay,
  "no-peek": badgeNoPeek,
} as const;
export const THEME_MP3 = { daily: dailyMp3, classic: classicMp3, howTo: howToMp3 } as const;
export const THEME_OGG = { daily: dailyOgg, classic: classicOgg, howTo: howToOgg } as const;
