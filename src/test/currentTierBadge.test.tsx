import { BADGE_URLS } from "@/lib/assetUrls";
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import { clearBadgeImageCache, loadBadgeImage } from "@/lib/badgeImages";

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

describe("CurrentTierBadge", () => {
  beforeEach(() => {
    MockImage.instances = [];
    clearBadgeImageCache();
    vi.stubGlobal("Image", MockImage);
  });

  it("shows Great Eye only after its fixed art has loaded", async () => {
    render(<CurrentTierBadge tier="great_eye" size={72} testId="badge" />);

    expect(screen.queryByTestId("badge")).toBeNull();
    expect(MockImage.instances).toHaveLength(1);

    act(() => MockImage.instances[0].onload?.());

    const badge = await screen.findByTestId("badge");
    expect(badge).toHaveAttribute("src", BADGE_URLS.great_eye);
    expect(badge).toHaveAttribute("alt", "Great Eye badge");
    expect(badge).toHaveAttribute("data-tier", "great_eye");
  });

  it("renders no element or preload for a tier with no mapped art", () => {
    const unmapped = "unknown_tier" as unknown as React.ComponentProps<typeof CurrentTierBadge>["tier"];
    const { container } = render(<CurrentTierBadge tier={unmapped} size={72} testId="badge" />);

    expect(screen.queryByTestId("badge")).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(MockImage.instances).toHaveLength(0);
  });

  it("follows the current tier when a player's highest tier is higher", async () => {
    const currentTier = "great_eye" as const;
    const highestTierEver = "match_maker" as const;
    expect(highestTierEver).not.toBe(currentTier);

    render(<CurrentTierBadge tier={currentTier} size={72} testId="badge" />);
    act(() => MockImage.instances[0].onload?.());

    const badge = await screen.findByTestId("badge");
    expect(badge).toHaveAttribute("data-tier", "great_eye");
    expect(badge).not.toHaveAttribute("data-tier", highestTierEver);
  });

  it("returns the decoded image object for a future canvas renderer", async () => {
    const loaded = loadBadgeImage("great_eye");
    expect(MockImage.instances).toHaveLength(1);
    act(() => MockImage.instances[0].onload?.());

    await waitFor(async () => expect(await loaded).toBe(MockImage.instances[0]));
    await expect(
      loadBadgeImage("unknown_tier" as unknown as Parameters<typeof loadBadgeImage>[0])
    ).resolves.toBeNull();
  });
});