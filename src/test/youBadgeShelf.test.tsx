import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YouBadgeShelf from "@/components/YouBadgeShelf";
import type { EarnedBadge } from "@/lib/whoopPoints";
import { formatBadgeDate } from "@/lib/whoopTiers";

vi.mock("@/components/CurrentTierBadge", () => ({
  default: ({ tier }: { tier: string }) => <img alt={`${tier} badge`} src={`/badges/${tier}.svg`} />,
}));

const badges: EarnedBadge[] = [
  { key: "rookie", earnedOn: "2026-09-01" },
  { key: "great_eye", earnedOn: "2026-09-15" },
  { key: "match_maker", earnedOn: "2026-09-20" },
];

describe("YouBadgeShelf", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollBy = vi.fn();
    HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens a focus-managed detail dialog with the earned date and tier threshold", async () => {
    render(<YouBadgeShelf badges={badges} mobile />);
    const trigger = screen.getByRole("button", { name: /View Great Eye badge details/ });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Great Eye" });
    expect(within(dialog).getByText(`Earned ${formatBadgeDate("2026-09-15")}`)).toBeVisible();
    expect(within(dialog).getByText("Reach 25 total points.")).toBeVisible();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("describes Rookie as earned by playing and keeps the shelf artwork and date", async () => {
    render(<YouBadgeShelf badges={[badges[0]]} mobile />);
    expect(screen.getByTestId("you-badge")).toHaveTextContent("Rookie");
    expect(screen.getByTestId("you-badge")).toHaveTextContent(formatBadgeDate("2026-09-01"));
    fireEvent.click(screen.getByRole("button", { name: /View Rookie badge details/ }));
    expect(within(await screen.findByRole("dialog")).getByText("Play your first Daily game.")).toBeVisible();
  });

  it("pages with arrow keys and honors reduced motion", () => {
    render(<YouBadgeShelf badges={badges} mobile />);
    const track = screen.getByRole("region", { name: /Earned badges/ });
    track.focus();
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    fireEvent.keyDown(track, { key: "Home" });
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "instant" });
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(track.scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "instant" }));
  });
});