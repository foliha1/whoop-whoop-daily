import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("button and motion regressions", () => {
  it("keeps Classic's matched pair face up through the reveal beat", () => {
    const source = read("components/MultiplayerGameView.tsx");
    expect(source).toMatch(/<DailyMatchGhost[\s\S]*?startFaceUp/);
  });

  it("does not restore a universal reduced-motion duration override", () => {
    const css = read("index.css");
    expect(css).not.toContain("animation-duration: 0.01ms !important");
    expect(css).not.toContain("transition-duration: 0.01ms !important");
    expect(css).toContain(".ww-card-flip");
    expect(css).toContain(".ww-match-ghost-flip");
    expect(css).toContain(".ww-music-marquee");
  });

  it("uses only the outer Daily result entrance for the score block", () => {
    const daily = read("pages/DailyPage.tsx");
    const score = read("components/WhoopPointsChange.tsx");
    expect(daily).toContain("animate={false}");
    expect(score).toContain('className={animate ? "daily-intro" : undefined}');
  });

  it("keeps Classic mode labels on fixed cream", () => {
    const source = read("components/MultiplayerWindow.tsx");
    expect(source).toContain("playModeLabelStyle(RAW.cream)");
    expect(source.match(/playModeLabelStyle\(RAW\.cream\)/g)).toHaveLength(2);
  });
});