import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-helmet-async", () => ({ Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/sounds", () => ({ startTheme: vi.fn(), leaveThemeZone: vi.fn(), prewarmTheme: vi.fn(), HOW_TO_PLAY_THEME_FILE: "howto.mp3" }));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: vi.fn() }));
vi.mock("@/lib/launch", () => ({ useUmbrella: () => false, umbrellaOn: () => false }));

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function load(skin: "on" | "off") {
  localStorage.setItem("ww-skin", skin);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
  vi.resetModules();
  return import("@/lib/skin");
}

describe("seasonal card presentation", () => {
  it.each(["on", "off"] as const)("keeps colour words frozen at page load with skin %s", async (state) => {
    const { colorWord, setSkinEnabled } = await load(state);
    const expected = state === "on" ? ["purple", "green", "pumpkin"] : ["red", "blue", "orange"];
    expect([colorWord("red"), colorWord("blue"), colorWord("yellow")]).toEqual(expected);
    expect(colorWord("blue", { capital: true })).toBe(state === "on" ? "Green" : "Blue");
    setSkinEnabled(state !== "on");
    expect(colorWord("red")).toBe(expected[0]);
  });

  it.each(["on", "off"] as const)("renders About faces and the loader with skin %s", async (state) => {
    const { skinArt, setSkinEnabled } = await load(state);
    const { cardArt, CARD_BACK_URL } = await import("@/lib/assetUrls");
    const { default: SupportPage } = await import("@/pages/SupportPage");
    const { default: CardFlipLoader } = await import("@/components/CardFlipLoader");
    const { container } = render(<MemoryRouter><SupportPage /><CardFlipLoader label="Loading" /></MemoryRouter>);
    const faces = Array.from(container.querySelectorAll<HTMLImageElement>("[data-testid=card-waterfall-trigger] img"));
    const names = ["1-circle-blue", "2-square-red", "3-tri-yellow", "4-star-blue"];
    expect(faces.map((img) => img.getAttribute("src"))).toEqual(names.map((name) => skinArt(cardArt(name))));
    if (state === "on") expect(faces.every((img) => img.src.startsWith("data:image/svg+xml"))).toBe(true);
    const loader = screen.getByRole("status", { name: "Loading" });
    expect(loader.querySelector("img")?.getAttribute("src")).toBe(skinArt(CARD_BACK_URL));
    act(() => setSkinEnabled(state !== "on"));
    expect(faces.map((img) => img.getAttribute("src"))).toEqual(names.map((name) => skinArt(cardArt(name))));
  });

  it.each(["on", "off"] as const)("uses seasonal How to Play descriptions and valid image sources with skin %s", async (state) => {
    const { skinArt } = await load(state);
    const { cardArt } = await import("@/lib/assetUrls");
    const { default: DailyHowToSteps } = await import("@/components/DailyHowToSteps");
    render(<DailyHowToSteps mode="reference" onStart={vi.fn()} onClose={vi.fn()} />);
    const next = () => fireEvent.click(screen.getAllByRole("button", { name: "Next" }).slice(-1)[0]);
    next(); next();
    const study = screen.getByAltText(`A card showing three ${state === "on" ? "green" : "blue"} stars`);
    expect(study.getAttribute("src")).toBe(skinArt(cardArt("3-star-blue")));
    next();
    expect(screen.getByAltText(`Four ${state === "on" ? "pumpkin" : "orange"} stars`).getAttribute("src")).toBe(skinArt(cardArt("4-star-yellow")));
    const shape = document.querySelector<HTMLButtonElement>('button[aria-label="Match the SHAPE"]');
    if (!shape) throw new Error("Missing shape example selector");
    fireEvent.click(shape);
    expect(screen.getByAltText(`Three ${state === "on" ? "purple" : "red"} circles`).getAttribute("src")).toBe(skinArt(cardArt("3-circle-red")));
  });

  it.each(["on", "off"] as const)("preloads valid rendered faces and the correct back with skin %s", async (state) => {
    const { skinArt } = await load(state);
    const { cardArt, CARD_BACK_URL } = await import("@/lib/assetUrls");
    const sources: string[] = [];
    vi.spyOn(window, "Image").mockImplementation(() => {
      const image = document.createElement("img");
      Object.defineProperty(image, "src", { set(value: string) { sources.push(value); image.onload?.(new Event("load")); } });
      return image;
    });
    const { preloadEssentialGameArt, preloadDailyBoardArt } = await import("@/lib/preloadArt");
    await preloadEssentialGameArt();
    await preloadDailyBoardArt([cardArt("2-star-red")]);
    expect(sources).toContain(skinArt(CARD_BACK_URL));
    expect(sources).toContain(skinArt(cardArt("2-star-red")));
    expect(sources.some((src) => src.includes("spook/card-back"))).toBe(state === "on");
  });
});