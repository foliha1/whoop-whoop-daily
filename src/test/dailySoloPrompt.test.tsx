import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DailySoloPrompt, { felixDailyComment } from "@/components/DailySoloPrompt";
import { BUTTON_PALETTE } from "@/lib/tokens";

describe("FELIX's Daily result reaction", () => {
  it("varies the reaction for perfect, partial and unsolved runs", () => {
    const perfect = felixDailyComment(3, 0);
    const partial = felixDailyComment(2, 1);
    const unsolved = felixDailyComment(0, 6);
    expect(new Set([perfect, partial, unsolved]).size).toBe(3);
    expect(perfect.length).toBeGreaterThan(0);
    expect(partial.length).toBeGreaterThan(0);
    expect(unsolved.length).toBeGreaterThan(0);
  });

  it("recognises three solved rounds separately from a perfect run", () => {
    expect(felixDailyComment(3, 2)).not.toBe(felixDailyComment(3, 0));
  });
});

describe("Daily Solo prompt", () => {
  it("links directly to Solo and keeps Done in the same panel", () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={3} totalMisses={0} mobile onDone={onDone} />
      </MemoryRouter>,
    );
    const prompt = screen.getByTestId("results-solo-prompt");
    expect(screen.getByText("FELIX says:")).toBeInTheDocument();
    expect(screen.getByTestId("results-solo")).toHaveAttribute("href", "/classic?mode=solo");
    expect(within(prompt).getByTestId("results-done")).toBeInTheDocument();
    screen.getByTestId("results-done").click();
    expect(onDone).toHaveBeenCalledOnce();
  });

  // Play Solo must stay the strongest action in the panel, so Done reads as a
  // quiet outlined surface rather than a second solid fill. jsdom drops
  // `var()` fills, so the palette's hover token is the fill that reaches the DOM.
  it("keeps Done neutral so Play Solo stays the strongest action", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={1} totalMisses={2} mobile onDone={vi.fn()} />
      </MemoryRouter>,
    );

    const hoverOf = (testId: string) =>
      screen.getByTestId(testId).style.getPropertyValue("--ww-button-hover");

    expect(hoverOf("results-done")).toBe(BUTTON_PALETTE.neutral.bgHover);
    expect(hoverOf("results-done")).not.toBe(BUTTON_PALETTE.ink.bgHover);
    expect(hoverOf("results-solo")).toBe(BUTTON_PALETTE.primary.bgHover);
  });
});
