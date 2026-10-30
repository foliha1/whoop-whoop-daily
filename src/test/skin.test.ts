// Spook Spook skin: the render-time art remap and the season gate.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_BACK_URL, cardArt } from "@/lib/assetUrls";
import { getSkin, setSkinEnabled, skinArt, skinSeasonOpen } from "@/lib/skin";

const NUMBERS = [1, 2, 3, 4] as const;
const SHAPES = ["circle", "square", "star", "tri"] as const;
const COLORS = ["blue", "red", "yellow"] as const;

const OLD_COLORS = ["#e79024", "#0072b2", "#d72229"];
const NEW_COLOR: Record<(typeof COLORS)[number], string> = {
  yellow: "#f05123",
  blue: "#a7cf38",
  red: "#8a4d9e",
};

describe("skinArt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setSkinEnabled(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps all 48 faces to data URLs with the new colour and none of the old", () => {
    for (const n of NUMBERS) {
      for (const s of SHAPES) {
        for (const c of COLORS) {
          const spook = skinArt(cardArt(`${n}-${s}-${c}`));
          expect(spook.startsWith("data:image/svg+xml")).toBe(true);
          const svg = decodeURIComponent(spook).toLowerCase();
          expect(svg).toContain(NEW_COLOR[c]);
          for (const old of OLD_COLORS) expect(svg).not.toContain(old);
        }
      }
    }
  });

  it("maps the card back to the Spook back", () => {
    const spook = skinArt(CARD_BACK_URL);
    expect(spook).not.toBe(CARD_BACK_URL);
    expect(spook).toContain("spook");
  });

  it("returns inputs unchanged when the skin is off", () => {
    setSkinEnabled(false);
    const url = cardArt("2-star-red");
    expect(skinArt(url)).toBe(url);
    expect(skinArt(CARD_BACK_URL)).toBe(CARD_BACK_URL);
  });

  it("returns inputs unchanged once the season has ended", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4));
    expect(skinSeasonOpen()).toBe(false);
    expect(getSkin()).toBe(false);
    const url = cardArt("3-tri-yellow");
    expect(skinArt(url)).toBe(url);
    expect(skinArt(CARD_BACK_URL)).toBe(CARD_BACK_URL);
  });

  it("returns an unknown URL unchanged", () => {
    expect(skinArt("https://example.com/nope.svg")).toBe(
      "https://example.com/nope.svg",
    );
  });

  it("defaults to on while the season is open", async () => {
    window.localStorage.clear();
    vi.resetModules();
    const skin = await import("@/lib/skin");
    expect(skin.getSkin()).toBe(true);
  });
});
