import React from "react";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhoopPoints } from "@/lib/whoopPoints";

const { firstAttempt } = vi.hoisted(() => ({ firstAttempt: vi.fn() }));
const points: WhoopPoints = {
  total: 82,
  tier: "match_maker",
  todayPoints: null,
  totalBeforeToday: null,
  pointsToNextTier: 68,
  nextTierThreshold: 150,
  peakTotal: 82,
  highestTierEver: "match_maker",
  badges: [
    { key: "rookie", earnedOn: "2026-08-11" },
    { key: "great_eye", earnedOn: "2026-09-01" },
    { key: "match_maker", earnedOn: "2026-11-18" },
  ],
  daysAway: 0,
  decayApplied: 0,
  gamesPlayed: 20,
};

vi.mock("@/hooks/useWhoopPoints", () => ({
  useWhoopPointsState: () => ({ points, loading: false }),
  usePointsPopulationState: () => ({ population: null, loading: false }),
}));
vi.mock("@/hooks/useSubscriberStatus", () => ({
  useSubscriberStatus: () => ({ email: "player@example.com" }),
}));
vi.mock("@/lib/dailyResults", () => ({
  fetchDailyStats: () => Promise.resolve(null),
  fetchFirstAttempt: firstAttempt,
}));

import YouPage from "@/pages/YouPage";

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <YouPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("Your Badges Day 100 restoration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    firstAttempt.mockReset();
  });

  it("shows the earned badge from the subscribed player's saved result when local storage is empty", async () => {
    firstAttempt.mockResolvedValue({ puzzle_number: 100, is_mine: false });

    renderPage();

    expect(await screen.findByRole("button", { name: /View 100 Days of Daily badge details/ })).toBeInTheDocument();
    expect(firstAttempt).toHaveBeenCalledWith(100, "player@example.com");
    expect(screen.getAllByTestId("you-badge")[0].dataset.badge).toBe("daily-100");
  });

  it("does not award the badge without a local or saved Daily #100 result", async () => {
    firstAttempt.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByRole("button", { name: /View Match Maker badge details/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View 100 Days of Daily badge details/ })).not.toBeInTheDocument();
  });
});
