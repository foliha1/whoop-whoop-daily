// ============================================================================
// Night mode — theming only.
//
// Default follows the OS via `prefers-color-scheme`. A manual choice is
// persisted in localStorage and wins over the OS from then on. The resolved
// theme is written to `data-theme` on <html>, which is what flips the CSS
// custom properties the `COLORS` tokens point at.
// ============================================================================

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "night";
export type Theme = "light" | "night";

const STORAGE_KEY = "ww-theme-mode";

/** Surface color per theme — mirrors --ww-surface, for the theme-color meta. */
const SURFACE: Record<Theme, string> = {
  light: "#F8F2E9",
  night: "#231F20",
};

const listeners = new Set<() => void>();

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "night" ? raw : "system";
  } catch {
    return "system";
  }
}

let mode: ThemeMode = readStoredMode();

function prefersNight(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(m: ThemeMode = mode): Theme {
  if (m === "system") return prefersNight() ? "night" : "light";
  return m;
}

/** Write the resolved theme to the document and keep the head meta in sync. */
export function applyTheme(theme: Theme = resolveTheme()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "night") root.setAttribute("data-theme", "night");
  else root.removeAttribute("data-theme");

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = SURFACE[theme];
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode: the choice just doesn't persist */
  }
  applyTheme();
  listeners.forEach((fn) => fn());
}

/** Call once at boot, before first paint, so there is no light flash. */
export function initTheme(): void {
  mode = readStoredMode();
  applyTheme();
  if (typeof window === "undefined") return;
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", () => {
    // Only the OS-following mode reacts; a manual choice stays put.
    if (mode !== "system") return;
    applyTheme();
    listeners.forEach((fn) => fn());
  });
}

/** Subscribe to mode/theme changes. */
export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive read of the current mode + resolved theme. */
export function useThemeMode() {
  const [state, setState] = useState(() => ({ mode: getThemeMode(), theme: resolveTheme() }));

  useEffect(() => {
    const sync = () => setState({ mode: getThemeMode(), theme: resolveTheme() });
    sync();
    return subscribeTheme(sync);
  }, []);

  return {
    mode: state.mode,
    theme: state.theme,
    setMode: setThemeMode,
    /** Manual override: flip to the opposite of whatever is on screen. */
    toggle: () => setThemeMode(resolveTheme() === "night" ? "light" : "night"),
  };
}
