import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DailySoloPrompt, { felixDailyComment } from "@/components/DailySoloPrompt";
import { BUTTON_PALETTE, COLORS, RAW } from "@/lib/tokens";

/** jsdom normalizes hex colors to rgb(), so compare against the same form. */
const rgb = (hex: string) => {
  const n = hex.replace("#", "");
  return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(
    n.slice(4, 6),
    16,
  )})`;
};

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

  it("keeps Done black in both themes", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={1} totalMisses={2} mobile onDone={vi.fn()} />
      </MemoryRouter>,
    );

    const solo = screen.getByTestId("results-solo");
    const done = screen.getByTestId("results-done");

    // Done's brand black is fixed in both themes. jsdom drops `var()` fills,
    // so the palette's hover token still marks the variant Done came from.
    expect(done.style.background).toBe(rgb(RAW.warmBlack));
    expect(done.style.color).toBe(rgb(RAW.cream));
    expect(done.style.background).not.toBe(rgb(RAW.cream));
    expect(solo.style.getPropertyValue("--ww-button-hover")).toBe(BUTTON_PALETTE.primary.bgHover);
    expect(done.style.getPropertyValue("--ww-button-hover")).toBe(BUTTON_PALETTE.ink.bgHover);
  });

  it("leaves a spent Done on its own inactive surface", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={1} totalMisses={2} mobile onDone={vi.fn()} doneDisabled />
      </MemoryRouter>,
    );

    const done = screen.getByTestId("results-done");
    expect(done).toBeDisabled();
    // A spent control keeps the shared inactive surface, never the live one.
    expect(done.style.getPropertyValue("--ww-button-hover")).toBe(COLORS.panel);
  });
});
