import { describe, expect, it } from "vitest";
import { screenMusic, type MusicScreen } from "@/lib/screenMusic";
import { CLASSIC_THEME_FILE, DAILY_THEME_FILE, HOW_TO_PLAY_THEME_FILE } from "@/lib/sounds";

describe("ON and admin-preview screen music", () => {
  it.each(["stats", "results"] as MusicScreen[])("uses Daily on %s", (screen) => {
    expect(screenMusic(screen, true, CLASSIC_THEME_FILE)).toBe(DAILY_THEME_FILE);
  });
  it("uses Classic on entry and other nongame screens", () => {
    expect(screenMusic("entry", true)).toBe(CLASSIC_THEME_FILE);
  });
  it("keeps gameplay silent even after results", () => {
    expect(screenMusic("results", true)).toBe(DAILY_THEME_FILE);
    expect(screenMusic("gameplay", true)).toBeNull();
  });
  it("uses the How to Play theme and restores the underlying screen after closing", () => {
    expect(screenMusic("howTo", true)).toBe(HOW_TO_PLAY_THEME_FILE);
    expect(screenMusic("entry", true)).toBe(CLASSIC_THEME_FILE);
    expect(screenMusic("results", true)).toBe(DAILY_THEME_FILE);
    expect(screenMusic("gameplay", true)).toBeNull();
  });
  it("preserves OFF Daily and Classic screen assignments", () => {
    expect(screenMusic("entry", false)).toBe(DAILY_THEME_FILE);
    expect(screenMusic("results", false, CLASSIC_THEME_FILE)).toBe(CLASSIC_THEME_FILE);
    expect(screenMusic("gameplay", false)).toBeNull();
    expect(screenMusic("howTo", false)).toBe(HOW_TO_PLAY_THEME_FILE);
  });
});