import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WhoopPointsChange from "@/components/WhoopPointsChange";
import { clearBadgeImageCache } from "@/lib/badgeImages";
import type { WhoopPoints } from "@/lib/whoopPoints";

class MockImage {
  static instances: MockImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = "";

  constructor() {
    MockImage.instances.push(this);
  }
}

const points: WhoopPoints = {
  total: 21,
  tier: "rookie",
  todayPoints: 2,
  totalBeforeToday: 19,
  pointsToNextTier: 4,
  nextTierThreshold: 25,
  peakTotal: 21,
  highestTierEver: "rookie",
  badges: [{ key: "rookie", earnedOn: "2026-09-22" }],
  daysAway: 0,
  decayApplied: 0,
  gamesPlayed: 5,
};

describe("Daily results score panel", () => {
  beforeEach(() => {
    MockImage.instances = [];
    clearBadgeImageCache();
    vi.stubGlobal("Image", MockImage);
  });

  it("shows Rookie artwork only after it loads and includes both destinations", async () => {
    render(
      <MemoryRouter>
        <WhoopPointsChange points={points} mobile />
      </MemoryRouter>
    );

    expect(screen.getByTestId("result-tier-tile")).toHaveTextContent("Rookie");
    expect(screen.queryByTestId("result-tier-badge")).toBeNull();
    expect(MockImage.instances[0]?.src).toBe("/badges/rookie.svg");

    act(() => MockImage.instances[0]?.onload?.());
    expect(await screen.findByTestId("result-tier-badge")).toHaveAttribute("alt", "Rookie badge");
    expect(screen.getByRole("link", { name: "Your Stats" })).toHaveAttribute("href", "/you");
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute("href", "/groups");
    expect(screen.getByTestId("result-points-today")).toHaveTextContent("+2 today");
    expect(screen.getByTestId("result-points-total")).toHaveTextContent("21 total");
    expect(screen.queryByText("Your tier", { exact: false })).toBeNull();
    expect(screen.queryByText("Total score", { exact: false })).toBeNull();
  });

  it("keeps the tier tile complete without mapped art", () => {
    render(
      <MemoryRouter>
        <WhoopPointsChange
          points={{ ...points, tier: "unknown" as WhoopPoints["tier"] }}
          mobile
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("result-tier-tile")).toBeInTheDocument();
    expect(screen.queryByTestId("result-tier-badge")).toBeNull();
    expect(MockImage.instances).toHaveLength(0);
  });
});