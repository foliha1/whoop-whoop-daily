// Spook Spook palette shift: with the skin off every RAW/BUTTON value is
// byte-identical to classic; with it on at page load the brand tones shift
// and every text-on-brand combination must still meet WCAG AA (4.5:1).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio } from "@/lib/contrast";

async function loadTokens(skin: "on" | "off") {
  window.localStorage.clear();
  window.localStorage.setItem("ww-skin", skin);
  vi.resetModules();
  return import("@/lib/tokens");
}

describe("Spook Spook palette", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("leaves RAW and BUTTON exactly as classic when the skin is off", async () => {
    const { RAW, BUTTON_PALETTE, COLORS } = await loadTokens("off");
    expect(RAW.red).toBe("#d72229");
    expect(RAW.redHover).toBe("#b81b20");
    expect(RAW.blue).toBe("#0072B2");
    expect(RAW.blueHover).toBe("#005a8f");
    expect(RAW.orange).toBe("#E79024");
    expect(RAW.orangeHover).toBe("#c47618");
    expect(RAW.orangeStat).toBe("#CC760C");
    expect(RAW.blue2).toBe("#97DAFF");
    expect(RAW.onBlue).toBe("#F8F2E9");
    expect(BUTTON_PALETTE.secondary).toMatchObject({
      bg: "#0072B2",
      bgHover: "#005a8f",
      fg: "#F8F2E9",
    });
    expect(COLORS.onBlue).toBe("#F8F2E9");
  });

  it("shifts the brand tones when the skin is on at load", async () => {
    const { RAW, BUTTON_PALETTE } = await loadTokens("on");
    expect(RAW.red).toBe("#8A4D9E");
    expect(RAW.redHover).toBe("#733F85");
    expect(RAW.blue).toBe("#A7CF38");
    expect(RAW.blueHover).toBe("#8FB52A");
    expect(RAW.orange).toBe("#F05123");
    expect(RAW.orangeHover).toBe("#F4724B");
    expect(RAW.orangeStat).toBe("#F05123");
    expect(RAW.blue2).toBe("#231F20");
    expect(RAW.onBlue).toBe("#231F20");
    expect(BUTTON_PALETTE.secondary.fg).toBe("#231F20");
  });

  it("keeps every text-on-brand combination at 4.5:1 or better under Spook", async () => {
    const { RAW } = await loadTokens("on");
    // onBlue on the green fill, cream on the purple fill, warm black on orange.
    expect(contrastRatio(RAW.onBlue, RAW.blue)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAW.cream, RAW.red)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAW.warmBlack, RAW.orange)).toBeGreaterThanOrEqual(4.5);
    // blueText / redText on cream (light) and on warm black (night) — the
    // same shades index.css sets for --ww-blue-text / --ww-red-text.
    expect(contrastRatio("#55731A", "#F8F2E9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A7CF38", "#231F20")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#8A4D9E", "#F8F2E9")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#C39BD3", "#231F20")).toBeGreaterThanOrEqual(4.5);
  });

  it("stamps data-skin on <html> only when the skin was on at load", async () => {
    window.localStorage.setItem("ww-skin", "on");
    vi.resetModules();
    const skin = await import("@/lib/skin");
    document.documentElement.removeAttribute("data-skin");
    skin.initSkin();
    expect(document.documentElement.getAttribute("data-skin")).toBe("spook");

    window.localStorage.setItem("ww-skin", "off");
    vi.resetModules();
    const skinOff = await import("@/lib/skin");
    document.documentElement.removeAttribute("data-skin");
    skinOff.initSkin();
    expect(document.documentElement.getAttribute("data-skin")).toBeNull();
  });
});
