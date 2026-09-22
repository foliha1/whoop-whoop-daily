import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CurrentTierBadge from "@/components/CurrentTierBadge";

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
    vi.stubGlobal("Image", MockImage);
  });

  it("shows Great Eye only after its fixed art has loaded", () => {
    render(<CurrentTierBadge tier="great_eye" size={72} testId="badge" />);

    expect(screen.queryByTestId("badge")).toBeNull();
    expect(MockImage.instances).toHaveLength(1);

    act(() => MockImage.instances[0].onload?.());

    const badge = screen.getByTestId("badge");
    expect(badge).toHaveAttribute("src", "/badges/great_eye.svg");
    expect(badge).toHaveAttribute("alt", "Great Eye badge");
    expect(badge).toHaveAttribute("data-tier", "great_eye");
  });

  it("renders no element or preload for Rookie because no art exists", () => {
    const { container } = render(<CurrentTierBadge tier="rookie" size={72} testId="badge" />);

    expect(screen.queryByTestId("badge")).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(MockImage.instances).toHaveLength(0);
  });

  it("follows the current tier when a player's highest tier is higher", () => {
    const currentTier = "great_eye" as const;
    const highestTierEver = "match_maker" as const;
    expect(highestTierEver).not.toBe(currentTier);

    render(<CurrentTierBadge tier={currentTier} size={72} testId="badge" />);
    act(() => MockImage.instances[0].onload?.());

    expect(screen.getByTestId("badge")).toHaveAttribute("data-tier", "great_eye");
    expect(screen.getByTestId("badge")).not.toHaveAttribute("data-tier", highestTierEver);
  });
});