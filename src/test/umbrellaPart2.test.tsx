import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { dailyStorageKey, getDailySeed } from "@/lib/daily";
import HomePage, { formatNextPuzzle } from "@/pages/HomePage";

const renderHome = (entry = "/") => render(
  <HelmetProvider><MemoryRouter initialEntries={[entry]}><HomePage /></MemoryRouter></HelmetProvider>
);

afterEach(() => {
  cleanup();
  setUmbrellaPreviewForTests(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Part 2 umbrella home", () => {
  it("renders Daily, Solo, and Peeps in order with their fixed colors", () => {
    setUmbrellaPreviewForTests(true);
    renderHome();
    const cards = screen.getByRole("navigation", { name: "Choose a game" }).querySelectorAll("a");
    expect(Array.from(cards).map((card) => card.getAttribute("data-testid"))).toEqual(["home-daily", "home-solo", "home-peeps"]);
    expect(cards[0]).toHaveStyle({ background: "#E79024", color: "#231f20" });
    expect(cards[1]).toHaveStyle({ background: "#0072B2", color: "#F8F2E9" });
    expect(cards[2]).toHaveStyle({ background: "#d72229", color: "#F8F2E9" });
  });

  it("forwards attribution to every destination", () => {
    renderHome("/?utm_source=launch&ref=felix&i=DAILY");
    expect(screen.getByTestId("home-daily")).toHaveAttribute("href", "/daily?utm_source=launch&ref=felix&i=DAILY");
    expect(screen.getByTestId("home-solo")).toHaveAttribute("href", "/classic?mode=solo&utm_source=launch&ref=felix&i=DAILY");
    expect(screen.getByTestId("home-peeps")).toHaveAttribute("href", "/classic?mode=multiplayer&utm_source=launch&ref=felix&i=DAILY");
  });

  it("changes the Daily card after a stored attempt and shows the countdown", () => {
    const seed = getDailySeed();
    localStorage.setItem(dailyStorageKey(seed), JSON.stringify({ elapsedMs: 1, seed, puzzleNumber: 1 }));
    renderHome();
    expect(screen.getByText("See Today's Daily")).toBeInTheDocument();
    expect(screen.getByText(/^Next puzzle in \d+h$/)).toBeInTheDocument();
  });

  it("rounds the local-midnight countdown up to an hour", () => {
    expect(formatNextPuzzle(new Date(2026, 8, 27, 23, 59))).toBe("Next puzzle in 1h");
  });
});