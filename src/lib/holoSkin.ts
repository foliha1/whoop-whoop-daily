// ============================================================================
// Holo Day: the Daily #100 skin (holographic / Y2K). CSS-only: every visual
// lives in src/styles/holo.css, gated on html[data-skin="holo"]. Card data,
// art URLs and network payloads are untouched.
//
// It runs for one calendar day, 18 Nov 2026, in each player's LOCAL time, so
// it lines up with Daily #100 wherever they are. While the day is open the
// skin defaults to ON; a player's choice persists in localStorage
// ("ww-skin-holo": "on" | "off"), separate from the Spook Spook key so last
// month's choice doesn't carry over. Outside the day it is always off and the
// settings switch hides itself.
//
// Testing: ?skin=holo forces it on for the tab (sessionStorage), any day;
// ?skin=off clears that.
// ============================================================================

import { useEffect, useState } from "react";

const STORAGE_KEY = "ww-skin-holo";
const PREVIEW_KEY = "ww-skin-preview";

/** True on 18 Nov 2026 in the player's local time. */
export function holoDayOpen(now: Date = new Date()): boolean {
  return now.getFullYear() === 2026 && now.getMonth() === 10 && now.getDate() === 18;
}

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "on" ? true : raw === "off" ? false : null;
  } catch {
    return null;
  }
}

function readPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("skin");
    if (q === "holo") window.sessionStorage.setItem(PREVIEW_KEY, "holo");
    if (q === "off") window.sessionStorage.removeItem(PREVIEW_KEY);
    return window.sessionStorage.getItem(PREVIEW_KEY) === "holo";
  } catch {
    return false;
  }
}

let enabled: boolean = readStored() ?? true;
const listeners = new Set<() => void>();

/** Whether the player has the skin switched on (live; drives the toggle). */
export function getHoloSkin(): boolean {
  return holoDayOpen() && enabled;
}

/**
 * Frozen at page load, like SPOOK_AT_LOAD: the look never changes under a
 * player mid-game. A toggle flip applies the next time the app opens.
 */
export const HOLO_AT_LOAD = readPreview() || getHoloSkin();

/** Call once at boot, after initSkin. Spook wins if both were ever on. */
export function initHoloSkin(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (HOLO_AT_LOAD && !root.hasAttribute("data-skin")) root.setAttribute("data-skin", "holo");
}

export function setHoloSkinEnabled(next: boolean): void {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    /* private mode: the choice just doesn't persist */
  }
  listeners.forEach((fn) => fn());
}

/** Reactive read for the settings switch. */
export function useHoloSkin(): boolean {
  const [on, setOn] = useState(getHoloSkin);
  useEffect(() => {
    const sync = () => setOn(getHoloSkin());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return on;
}
