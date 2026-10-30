// ============================================================================
// Spook Spook — the Halloween skin. Card art only: the classic faces are
// recolored in memory and the back swaps to the Spook design. Card data,
// svgPath and every network payload keep the classic art; the remap happens
// at render time via skinArt(), so each player sees their own choice.
//
// The season runs until 3 Nov 2026 00:00 local time. While it is open the
// skin defaults to ON and a player's choice persists in localStorage
// ("ww-skin": "on" | "off"). Once the season closes the skin is always off
// and the settings switch hides itself.
// ============================================================================

import { useEffect, useState } from "react";
import { CARD_BACK_URL } from "@/lib/assetUrls";
import spookCardBack from "../assets/spook/card-back.svg?url";

const STORAGE_KEY = "ww-skin";

/** 3 Nov 2026 00:00 in the player's local timezone. */
const SEASON_END = new Date(2026, 10, 3).getTime();

/** True while the Spook Spook season is open. */
export function skinSeasonOpen(now: number = Date.now()): boolean {
  return now < SEASON_END;
}

const listeners = new Set<() => void>();

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "on" ? true : raw === "off" ? false : null;
  } catch {
    return null;
  }
}

let enabled: boolean = readStored() ?? true;

/** Whether the skin is active right now: on, and the season still open. */
export function getSkin(): boolean {
  return skinSeasonOpen() && enabled;
}

/**
 * The skin state frozen at page load. Palette-wide decisions (tokens, CSS
 * overrides, pattern URLs) read this instead of the live state, so nothing
 * shifts under a player mid-game — a toggle flip applies on the next open.
 */
export const SPOOK_AT_LOAD = getSkin();

/** Call once at boot, next to initTheme, before first paint. */
export function initSkin(): void {
  if (typeof document === "undefined") return;
  if (SPOOK_AT_LOAD) document.documentElement.setAttribute("data-skin", "spook");
}

export function setSkinEnabled(next: boolean): void {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    /* private mode: the choice just doesn't persist */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeSkin(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive read of the skin state; re-renders when the toggle flips. */
export function useSkin(): boolean {
  const [on, setOn] = useState(getSkin);

  useEffect(() => {
    const sync = () => setOn(getSkin());
    sync();
    return subscribeSkin(sync);
  }, []);

  return on;
}

// --- Spook art --------------------------------------------------------------

// Each classic face carries exactly one card colour; the skin swaps it for
// the Spook palette (case-insensitive).
const RECOLOR: [RegExp, string][] = [
  [/#e79024/i, "#F05123"],
  [/#0072b2/i, "#A7CF38"],
  [/#d72229/i, "#8A4D9E"],
];

const RAW_FACES = import.meta.glob<string>("../assets/cards/[1-4]-*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});
const FACE_URLS = import.meta.glob<string>("../assets/cards/[1-4]-*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Classic art URL → Spook art (data URL for faces, asset URL for the back). */
const SPOOK_BY_CLASSIC_URL = new Map<string, string>();

for (const [path, raw] of Object.entries(RAW_FACES)) {
  try {
    let spook = raw;
    for (const [from, to] of RECOLOR) spook = spook.replace(from, to);
    const classicUrl = FACE_URLS[path];
    if (classicUrl) {
      SPOOK_BY_CLASSIC_URL.set(
        classicUrl,
        `data:image/svg+xml;utf8,${encodeURIComponent(spook)}`,
      );
    }
  } catch {
    /* a face that fails to convert simply keeps its classic art */
  }
}
SPOOK_BY_CLASSIC_URL.set(CARD_BACK_URL, spookCardBack);

/**
 * Map a classic card URL (a face from `cardArt`, or `CARD_BACK_URL`) to its
 * Spook Spook version. Returns the input unchanged when the skin is off, the
 * URL is unknown, or anything goes wrong — it never throws.
 */
export function skinArt(url: string): string {
  try {
    if (!getSkin()) return url;
    return SPOOK_BY_CLASSIC_URL.get(url) ?? url;
  } catch {
    return url;
  }
}
