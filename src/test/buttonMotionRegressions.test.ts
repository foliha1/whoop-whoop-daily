import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

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
    expect(css).toContain(".ww-card-shrink");
  });

  it("uses only the outer Daily result entrance for the score block", () => {
    const daily = read("pages/DailyPage.tsx");
    const score = read("components/WhoopPointsChange.tsx");
    expect(daily).toContain("animate={false}");
    expect(score).toContain('className={animate ? "daily-intro" : undefined}');
  });

  it("keeps Classic mode labels on fixed cream, Solo on the on-blue ink", () => {
    const source = read("components/MultiplayerWindow.tsx");
    expect(source).toContain("playModeLabelStyle(RAW.cream)");
    expect(source.match(/playModeLabelStyle\(RAW\.cream\)/g)).toHaveLength(1);
    // The Solo tile sits on the blue fill, which cannot carry cream under Spook.
    expect(source).toContain("playModeLabelStyle(COLORS.onBlue)");
  });

  it("keeps the active-claim pulse legible at every window size", () => {
    const css = read("index.css");
    const pulse = css.slice(
      css.indexOf("/* ── Active claim:"),
      css.indexOf("/* ── Great-match ghost"),
    );
    // Stroke and glow ride a floored strength, never the raw board scale, so a
    // narrow window still gets a full 2px outline and a 5px glow.
    expect(pulse).toContain("--ww-pk: max(var(--ww-k, 1), 1)");
    expect(pulse).not.toContain("var(--ww-k)");
  });
});