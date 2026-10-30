import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";

vi.mock("@/hooks/useEntryReady", () => ({ useEntryReady: () => true }));
vi.mock("@/components/LaunchAnnouncement", () => ({ default: () => null, shouldShowLaunchNote: () => false }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

async function loadSkin(skin: "on" | "off") {
  localStorage.setItem("ww-skin", skin);
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
}

describe("Spook lobby isolation", () => {
  it.each(["on", "off"] as const)("uses the correct lobby logo and byline with skin %s", async (skin) => {
    await loadSkin(skin);
    const { default: MultiplayerWindow } = await import("@/components/MultiplayerWindow");
    render(<MemoryRouter><MultiplayerWindow home /></MemoryRouter>);
    expect(screen.getByRole("img", { name: skin === "on" ? "Spook Spook!" : "WHOOP! WHOOP!" })).toBeInTheDocument();
    expect(screen.getByTestId("home-byline")).toHaveTextContent(skin === "on" ? "A haunt by Oleeha & Co." : "A game by Oleeha & Co.");
  });

  it("copies the night logo exactly except for black-to-cream lettering", () => {
    const light = readFileSync("src/assets/spook/spook-logo-light.svg", "utf8");
    const night = readFileSync("src/assets/spook/spook-logo-night.svg", "utf8");
    expect(light).toMatch(/#231f20/i);
    expect(night).not.toMatch(/#231f20/i);
    expect(night).toBe(light.replace(/#231f20/gi, "#F8F2E9"));
  });

  it("preserves every classic seat colour when off", async () => {
    await loadSkin("off");
    const { SEAT_COLORS } = await import("@/components/MultiplayerGameView");
    expect(SEAT_COLORS).toEqual(["#d72229", "#0072B2", "#E79024", "#59cd90", "#97DAFF", "#FFC1C3"]);
  });

  it("uses distinct seasonal accents for seats four through six", async () => {
    await loadSkin("on");
    const { SEAT_COLORS } = await import("@/components/MultiplayerGameView");
    expect(SEAT_COLORS).toEqual(["#C900FF", "#719803", "#F05123", "#C39BD3", "#F9B49C", "#DCEBA6"]);
  });
});