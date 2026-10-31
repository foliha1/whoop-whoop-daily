import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function loadSkin(skin: "on" | "off") {
  localStorage.setItem("ww-skin", skin);
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
}

describe("Spook ghost", () => {
  it("renders nothing with the skin off", async () => {
    await loadSkin("off");
    const { default: SpookGhost } = await import("@/components/SpookGhost");
    const { container } = render(<SpookGhost />);
    expect(container).toBeEmptyDOMElement();
  });

  it("floats with the skin on", async () => {
    await loadSkin("on");
    const { default: SpookGhost } = await import("@/components/SpookGhost");
    render(<SpookGhost />);
    const layer = screen.getByTestId("spook-ghost");
    expect(layer).toBeInTheDocument();
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveStyle({ pointerEvents: "none" });
  });

  it("renders nothing while paused", async () => {
    await loadSkin("on");
    const mod = await import("@/components/SpookGhost");
    mod.setSpookGhostPaused(true);
    const { container } = render(<mod.default />);
    expect(container).toBeEmptyDOMElement();
    mod.setSpookGhostPaused(false);
  });

  it("renders nothing under reduced motion", async () => {
    await loadSkin("on");
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { default: SpookGhost } = await import("@/components/SpookGhost");
    const { container } = render(<SpookGhost />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Spook cobwebs", () => {
  it("marks the screen frame for the cobweb only under Spook", async () => {
    await loadSkin("on");
    const { default: DailyFrame } = await import("@/components/DailyFrame");
    const { container, unmount } = render(<DailyFrame>hi</DailyFrame>);
    expect(container.querySelector(".ww-spook-frame")).not.toBeNull();
    unmount();

    await loadSkin("off");
    const { default: DailyFrameOff } = await import("@/components/DailyFrame");
    const { container: off } = render(<DailyFrameOff>hi</DailyFrameOff>);
    expect(off.querySelector(".ww-spook-frame")).toBeNull();
  });

  it("keeps every cobweb untappable, decorative and behind the content", () => {
    // The cobweb itself is a CSS pseudo-element, so it is never in the
    // accessibility tree; these rules are what guarantee it stays decorative.
    const css = readFileSync("src/index.css", "utf8");
    const rules = (css.match(/\[data-skin="spook"\][^{]*::before\s*\{[^}]*\}/g) ?? []).filter((rule) =>
      rule.includes("cobweb.svg"),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toContain("pointer-events: none");
      expect(rule).toContain("z-index: -1");
    }
    // Skin-off renders nothing: every cobweb rule is gated on the skin.
    expect(css).not.toMatch(/(^|\})\s*\.ww-spook-frame::before/);
    expect(css).not.toMatch(/(^|\})\s*\.ww-ui-modal-panel::before/);
  });
});
