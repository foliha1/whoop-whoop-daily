// ============================================================================
// Spook Spook — the Daily share image header. Under the skin the Spook logo
// stands in the lockup slot (light theme → light logo, night theme → night
// logo), fitted to the slot's height without stretching and centred where the
// classic lockup sat. With the skin off the classic lockups load unchanged.
// ============================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyResult } from "@/lib/daily";
import lockupAsset from "@/assets/WhoopWhoop_Daily_Lockup.svg.asset.json";
import lockupCreamAsset from "@/assets/WhoopWhoop_Daily_Lockup_Cream.svg.asset.json";
import spookLogoLight from "@/assets/spook/spook-logo-light.svg?url";
import spookLogoNight from "@/assets/spook/spook-logo-night.svg?url";

const RESULT: DailyResult = {
  seed: "2026-10-31",
  puzzleNumber: 148,
  attributes: ["SHAPE", "NUMBER", "COLOR"],
  elapsedMs: 42_000,
  roundsSolved: 2,
  totalMisses: 1,
  roundEvents: [["SOLVE"], ["MISS", "SOLVE"], []],
  peekUsed: true,
  peekRound: 2,
  failed: false,
  completedAt: "2026-10-31T11:00:00.000Z",
};

/** A canvas + Image stand-in that records every source and every draw rect. */
async function capture(skin: "on" | "off", theme: "light" | "night") {
  localStorage.setItem("ww-skin", skin);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 31, 12));
  vi.resetModules();

  const sources: string[] = [];
  const elementBySrc = new Map<string, object>();
  const draws: unknown[][] = [];

  vi.spyOn(window, "Image").mockImplementation(() => {
    const el: { onload?: (() => void) | null; src?: string } = {};
    Object.defineProperty(el, "src", {
      set(value: string) {
        sources.push(value);
        elementBySrc.set(value, el);
        el.onload?.();
      },
    });
    return el as unknown as HTMLImageElement;
  });

  const ctx: Record<string, unknown> = {
    drawImage: (...args: unknown[]) => {
      draws.push(args);
    },
    measureText: (text: string) => ({ width: String(text).length * 10 }),
  };
  for (const method of [
    "fillRect",
    "save",
    "restore",
    "translate",
    "rotate",
    "beginPath",
    "arc",
    "fill",
    "moveTo",
    "lineTo",
    "stroke",
    "arcTo",
    "closePath",
    "fillText",
  ]) {
    ctx[method] = () => {};
  }

  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })) };
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas"
      ? (canvas as unknown as HTMLCanvasElement)
      : create(tag)
  );

  const { renderDailyShareImage } = await import("@/lib/dailyShareImage");
  await renderDailyShareImage(RESULT, undefined, theme);

  return { sources, draws, elementBySrc };
}

/** The draw rect of `el`, as [x, y, w, h]. */
function rectOf(draws: unknown[][], elementBySrc: Map<string, object>, src: string) {
  const el = elementBySrc.get(src);
  const call = draws.find((args) => args[0] === el);
  if (!call) throw new Error(`${src} was never drawn`);
  return call.slice(1, 5) as number[];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("Spook share image logo", () => {
  it("loads the light Spook logo for the light card under the skin", async () => {
    const { sources } = await capture("on", "light");
    expect(sources).toContain(spookLogoLight);
    expect(sources).not.toContain(lockupAsset.url);
  });

  it("loads the night Spook logo for the night card under the skin", async () => {
    const { sources } = await capture("on", "night");
    expect(sources).toContain(spookLogoNight);
    expect(sources).not.toContain(lockupCreamAsset.url);
  });

  it("loads the classic lockups with the skin off", async () => {
    const light = await capture("off", "light");
    expect(light.sources).toContain(lockupAsset.url);
    const night = await capture("off", "night");
    expect(night.sources).toContain(lockupCreamAsset.url);
    expect(night.sources.some((s) => s.includes("spook/spook-logo"))).toBe(false);
  });

  it("fits the Spook logo into the slot without stretching, centred on the classic one", async () => {
    const off = await capture("off", "light");
    const on = await capture("on", "light");

    const [classicX, , classicW, classicH] = rectOf(
      off.draws,
      off.elementBySrc,
      lockupAsset.url
    );
    const [x, y, w, h] = rectOf(on.draws, on.elementBySrc, spookLogoLight);

    expect(h).toBeCloseTo(classicH, 3); // full slot height
    expect(w / h).toBeCloseTo(147 / 133, 3); // its own aspect ratio
    expect(x + w / 2).toBeCloseTo(classicX + classicW / 2, 3); // centred in the slot
    expect(w).toBeLessThan(classicW); // and it still fits the slot
  });
});
