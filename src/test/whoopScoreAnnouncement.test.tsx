import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhoopScoreAnnouncement, {
  SCORE_ANNOUNCEMENT, hasSeenScoreAnnouncement, hasEarlierDailyResult, isReturningScorePlayer,
} from "@/components/WhoopScoreAnnouncement";
import type { WhoopPoints } from "@/lib/whoopPoints";
import type { StoredDailyResult } from "@/lib/dailyResults";
import { pendingDailyEvents, resetDailyEvents, setDailyTrackingEnabled } from "@/lib/dailyEvents";

vi.mock("@/components/CurrentTierBadge", () => ({
  default: ({ tier }: { tier: string }) => <img alt={`${tier} badge`} src={`/badges/${tier}.svg`} />,
}));

const points: WhoopPoints = {
  total: 29, tier: "great_eye", todayPoints: 4, totalBeforeToday: 25,
  pointsToNextTier: 46, nextTierThreshold: 75, peakTotal: 29,
  highestTierEver: "great_eye", badges: [{ key: "great_eye", earnedOn: "2026-09-22" }],
  daysAway: 0, decayApplied: 0, gamesPlayed: 8,
};

function StatsLanding() {
  const location = useLocation();
  return <span data-testid="stats-landing">{(location.state as { wwReturn?: string })?.wwReturn}</span>;
}

const mount = (onClose = vi.fn()) => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<>
        <button data-testid="results-done">Done</button>
        <WhoopScoreAnnouncement points={points} puzzleNumber={42} onClose={onClose} />
      </>} />
      <Route path="/you" element={<StatsLanding />} />
    </Routes>
  </MemoryRouter>,
);

describe("score announcement", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDailyEvents();
    setDailyTrackingEnabled(true);
  });
  afterEach(() => { resetDailyEvents(); vi.restoreAllMocks(); });

  it("only qualifies a saved result with resolved points and a result before the local date", () => {
    const dates = (values: string[]) => values.map((puzzle_date) => ({ puzzle_date })) as StoredDailyResult[];
    expect(hasEarlierDailyResult(dates([]), "2026-09-22")).toBe(false);
    expect(hasEarlierDailyResult(dates(["2026-09-22"]), "2026-09-22")).toBe(false);
    expect(hasEarlierDailyResult(dates(["2026-09-23"]), "2026-09-22")).toBe(false);
    expect(hasEarlierDailyResult(dates(["2026-09-21", "2026-09-22"]), "2026-09-22")).toBe(true);
    expect(isReturningScorePlayer(points, false, true)).toBe(false);
    expect(isReturningScorePlayer(null, true, true)).toBe(false);
    expect(isReturningScorePlayer({ ...points, gamesPlayed: 9 }, true, false)).toBe(false);
    expect(isReturningScorePlayer(points, true, true)).toBe(true);
  });

  it("shares Your Stats tiles and centrally defined copy with an accessible focus-trapped dialog", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: SCORE_ANNOUNCEMENT.headline });
    expect(within(dialog).getByTestId("you-score")).toHaveTextContent("Great Eye");
    expect(within(dialog).getByRole("img", { name: "great_eye badge" })).toBeVisible();
    expect(within(dialog).getByTestId("you-score")).toHaveTextContent("29");
    expect(within(dialog).getByText(SCORE_ANNOUNCEMENT.intro)).toBeVisible();
    for (const bullet of SCORE_ANNOUNCEMENT.bullets) expect(within(dialog).getByText(bullet)).toBeVisible();
    const primary = within(dialog).getByRole("button", { name: SCORE_ANNOUNCEMENT.primary });
    const secondary = within(dialog).getByRole("button", { name: SCORE_ANNOUNCEMENT.secondary });
    await waitFor(() => expect(primary).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(secondary).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(primary).toHaveFocus();
  });

  it.each(["Escape", "backdrop", "Got it"])("marks seen and restores results focus on %s dismissal", async (method) => {
    const close = vi.fn();
    mount(close);
    await screen.findByRole("dialog");
    if (method === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (method === "backdrop") fireEvent.click(screen.getByTestId("score-announcement-backdrop"));
    else fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(hasSeenScoreAnnouncement()).toBe(true);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(pendingDailyEvents().some((row) => row.event === "announcement_dismissed" && row.props?.version === SCORE_ANNOUNCEMENT.version)).toBe(true);
  });

  it("sends the primary action to Your Stats with results return state and marks seen", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: SCORE_ANNOUNCEMENT.primary }));
    expect(hasSeenScoreAnnouncement()).toBe(true);
    await waitFor(() => expect(screen.getByTestId("stats-landing")).toHaveTextContent("results"));
    expect(pendingDailyEvents().some((row) => row.event === "announcement_primary_tapped" && row.props?.version === SCORE_ANNOUNCEMENT.version)).toBe(true);
  });
});