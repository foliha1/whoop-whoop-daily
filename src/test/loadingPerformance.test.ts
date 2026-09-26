import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("startup loading boundaries", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("deduplicates targeted image loads and waits for decode", async () => {
    const instances: FakeImage[] = [];
    class FakeImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      constructor() { instances.push(this); }
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.resetModules();
    const art = await import("@/lib/preloadArt");
    await Promise.all([
      art.preloadDailyBoardArt(["/cards/a.svg", "/cards/b.svg"]),
      art.preloadDailyBoardArt(["/cards/a.svg"]),
    ]);
    expect(instances).toHaveLength(2);
    expect(instances.every((image) => image.decode.mock.calls.length === 1)).toBe(true);
  });

  it("loads only essential Daily art before the idle board stage", () => {
    const source = read("pages/DailyPage.tsx");
    expect(source).toContain("preloadEssentialGameArt()");
    expect(source).toContain("afterPaintIdleOrInteraction");
    expect(source).toContain("preloadDailyBoardArt(todayArtSources)");
    expect(source).toContain("todayArtReady.current.then");
    expect(source).toContain('if (phase === "READY") return');
  });

  it("keeps Classic to one route chunk and preloads board art only after entry", () => {
    const page = read("pages/MultiplayerPage.tsx");
    const window = read("components/MultiplayerWindow.tsx");
    expect(page).toContain('import MultiplayerWindow from "@/components/MultiplayerWindow"');
    expect(page).not.toContain('React.lazy(() => import("@/components/MultiplayerWindow"))');
    expect(window).toContain('view.kind === "host" || view.kind === "joiner" || view.kind === "solo"');
  });

  it("bounds the Play tap's wait for board art with a named ceiling", async () => {
    const source = read("pages/DailyPage.tsx");
    expect(source).toContain("PLAY_ART_WAIT_CEILING_MS");
    expect(source).toContain("Promise.race([");
    expect(source).toContain("setTimeout(resolve, PLAY_ART_WAIT_CEILING_MS)");
    expect(source).toContain("setPlayWaiting(true)");
    expect(source).toContain("playLoading={playWaiting}");
    const timing = await import("@/lib/animationTiming");
    expect(timing.PLAY_ART_WAIT_CEILING_MS).toBe(1500);
  });

  it("defers active logo and music work and gates results-only reads", () => {
    const logo = read("components/DailyLogoLockup.tsx");
    const daily = read("pages/DailyPage.tsx");
    expect(logo).not.toMatch(/\nloadData\(VARIANTS\.daily\.animation\)/);
    expect(logo).toContain("if (prefersReducedMotion()) return");
    expect(logo).toContain("loadData(art.animation)");
    expect(daily).toContain("afterPaintIdleOrInteraction(() => prewarmTheme())");
    expect(daily).toContain("const resultsDataReady = daily.result !== null && daily.resultSaved");
    expect(daily).toContain("useWhoopPointsState(resultsDataReady");
    expect(read("hooks/useDailyProfile.ts")).not.toContain("fetchDailyStats");
  });
});