import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AllBadgesDialog from "@/components/AllBadgesDialog";
import { formatBadgeDate } from "@/lib/whoopTiers";

vi.mock("@/components/CurrentTierBadge", () => ({
  default: ({ tier }: { tier: string }) => <img alt={`${tier} badge`} src={`/badges/${tier}.svg`} />,
}));

describe("AllBadgesDialog", () => {
  it("shows every badge, with art only for earned ones", async () => {
    render(
      <AllBadgesDialog
        mobile
        earned={[
          { key: "rookie", earnedOn: "2026-08-11" },
          { key: "streak-7", earnedOn: "2026-08-17" },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "See All Badges" }));
    const dialog = await screen.findByRole("dialog", { name: "All Badges" });
    expect(within(dialog).getByText("2 of 18 earned")).toBeVisible();

    const items = within(dialog).getAllByTestId("all-badges-item");
    expect(items).toHaveLength(18);

    const earned = items.filter((el) => el.dataset.earned === "true").map((el) => el.dataset.badge);
    expect(earned).toEqual(["rookie", "streak-7"]);

    const streak7 = items.find((el) => el.dataset.badge === "streak-7") as HTMLElement;
    expect(within(streak7).getByRole("img")).toHaveAttribute("src", "/badges/streak-7.svg");
    expect(within(streak7).getByText(`Earned ${formatBadgeDate("2026-08-17")}`)).toBeVisible();

    const streak30 = items.find((el) => el.dataset.badge === "streak-30") as HTMLElement;
    expect(within(streak30).queryByRole("img")).toBeNull();
    expect(within(streak30).getByTestId("all-badges-locked")).toBeInTheDocument();
    expect(within(streak30).getByText("30-Day Streak")).toBeVisible();
    expect(within(streak30).getByText("Play the Daily 30 days in a row.")).toBeVisible();

    expect(within(dialog).queryByText("Keepsakes")).toBeNull();
  });

  it("adds the keepsake group for players who have it", async () => {
    render(<AllBadgesDialog mobile earned={[{ key: "daily-100", earnedOn: "2026-11-18" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "See All Badges" }));
    const dialog = await screen.findByRole("dialog", { name: "All Badges" });
    expect(within(dialog).getByText("1 of 19 earned")).toBeVisible();
    expect(within(dialog).getByText("Keepsakes")).toBeVisible();
  });

  it("keeps an icon close action outside the scrolling badge list", async () => {
    render(<AllBadgesDialog mobile earned={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "See All Badges" }));
    const dialog = await screen.findByRole("dialog", { name: "All Badges" });
    const close = within(dialog).getByRole("button", { name: "Close all badges" });
    expect(within(dialog).getByTestId("all-badges-scroll").contains(close)).toBe(false);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "All Badges" })).not.toBeInTheDocument();
  });
});
