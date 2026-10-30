// Spook Spook palette shift: with the skin off every RAW/BUTTON value is
// byte-identical to classic; with it on at page load the brand tones shift
// Purple uses the requested large-text minimum (3:1); other specified pairs use 4.5:1.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 12));
  });
  afterEach(() => vi.useRealTimers());

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
    expect(RAW.onRed).toBe("#F8F2E9");
    expect(COLORS.onRed).toBe("#F8F2E9");
    for (const variant of ["primary", "play", "dangerConfirm"] as const) {
      expect(BUTTON_PALETTE[variant]).toMatchObject({ bg: "#d72229", bgHover: "#b81b20", fg: "#F8F2E9" });
    }
    expect(BUTTON_PALETTE.secondary).toMatchObject({
      bg: "#0072B2",
      bgHover: "#005a8f",
      fg: "#F8F2E9",
    });
    expect(COLORS.onBlue).toBe("#F8F2E9");
  });

  it("shifts the brand tones when the skin is on at load", async () => {
    const { RAW, BUTTON_PALETTE } = await loadTokens("on");
    expect(RAW.red).toBe("#C900FF");
    expect(RAW.redHover).toBe("#DB66FF");
    expect(RAW.blue).toBe("#719803");
    expect(RAW.blueHover).toBe("#7FA70A");
    expect(RAW.orange).toBe("#F05123");
    expect(RAW.orangeHover).toBe("#F4724B");
    expect(RAW.orangeStat).toBe("#F05123");
    expect(RAW.blue2).toBe("#231F20");
    expect(RAW.onBlue).toBe("#231F20");
    expect(RAW.onRed).toBe("#231F20");
    for (const variant of ["primary", "play", "dangerConfirm"] as const) expect(BUTTON_PALETTE[variant].fg).toBe("#231F20");
    expect(BUTTON_PALETTE.secondary.fg).toBe("#231F20");
  });

  it("keeps green and pumpkin ink at 4.5:1 under Spook", async () => {
    const { RAW } = await loadTokens("on");
    expect(contrastRatio(RAW.onBlue, RAW.blue)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAW.warmBlack, RAW.orange)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps ink on purple at the requested large-text 3:1 minimum", async () => {
    const { RAW } = await loadTokens("on");
    // Ink on #C900FF is about 3.8:1: large-text AA, not small-text AA.
    expect(contrastRatio(RAW.onRed, RAW.red)).toBeGreaterThanOrEqual(3);
  });

  it("keeps actual light and night text tokens at 4.5:1", () => {
    const css = readFileSync("src/index.css", "utf8");
    const light = css.match(/html\[data-skin="spook"\]\s*\{([^}]+)\}/)?.[1] ?? "";
    const night = css.match(/html\[data-skin="spook"\]\[data-theme="night"\]\s*\{([^}]+)\}/)?.[1] ?? "";
    for (const [block, expected, bg] of [[light, ["#557202", "#9400BD"], "#F8F2E9"], [night, ["#719803", "#DB66FF"], "#231F20"]] as const) {
      const actual = ["blue", "red"].map(color => block.match(new RegExp(`--ww-${color}-text:\\s*(#[a-f0-9]+)`, "i"))?.[1]);
      expect(actual).toEqual(expected);
      for (const color of actual) {
        if (!color) throw new Error("Missing text token");
        expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("removes retired Spook hexes from source and art except light-green card recolouring", () => {
    const retired = new RegExp("#(?:8a4d" + "9e|8a4f" + "9e|a7cf" + "38|a5ce" + "3a)", "gi");
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? (path === "src/test" ? [] : walk(path)) : /\.(tsx?|css|svg)$/.test(path) ? [path] : [];
    });
    const files = [...walk("src"), ...readdirSync("public").filter(name => name.endsWith("_Spook.svg")).map(name => join("public", name))];
    for (const path of files) {
      const matches = readFileSync(path, "utf8").match(retired) ?? [];
      expect(matches, path).toEqual(path === "src/lib/skin.ts" ? ["#A7CF38"] : []);
    }
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
