import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DailySoloPrompt, { felixDailyComment } from "@/components/DailySoloPrompt";
import { BUTTON_PALETTE, RAW } from "@/lib/tokens";

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

  it("paints the FELIX says container brand black with literal light copy", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={2} totalMisses={1} mobile onDone={vi.fn()} />
      </MemoryRouter>,
    );

    const prompt = screen.getByTestId("results-solo-prompt");
    const label = screen.getByText("FELIX says:").parentElement?.firstElementChild as HTMLElement;
    const body = screen.getByText(felixDailyComment(2, 1)) as HTMLElement;

    // Brand black is fixed, so the words on it must be fixed light tones too:
    // a themed ink would flip to warm black at night and vanish into the panel.
    expect(prompt.style.background).toBe(rgb(RAW.warmBlack));
    expect(label.style.color).toBe(rgb(RAW.khakiMuted));
    expect(body.style.color).toBe(rgb(RAW.cream));
  });

  it("keeps Done a quiet outline so Play Solo stays the strongest action", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={1} totalMisses={2} mobile onDone={vi.fn()} />
      </MemoryRouter>,
    );

    const solo = screen.getByTestId("results-solo");
    const done = screen.getByTestId("results-done");

    // Solo is the only solid fill in the panel; Done is a cream outline on the
    // brand-black surface, never a second solid block.
    expect(solo.style.getPropertyValue("--ww-button-hover")).toBe(BUTTON_PALETTE.primary.bgHover);
    expect(done.style.background).toBe(rgb(RAW.warmBlack));
    expect(done.style.color).toBe(rgb(RAW.cream));
    expect(done.style.border.toLowerCase()).toBe(`2px solid ${RAW.cream.toLowerCase()}`);
    expect(done.style.background).not.toBe(rgb(RAW.red));
  });

  it("leaves a spent Done on its own inactive surface", () => {
    render(
      <MemoryRouter>
        <DailySoloPrompt roundsSolved={1} totalMisses={2} mobile onDone={vi.fn()} doneDisabled />
      </MemoryRouter>,
    );

    const done = screen.getByTestId("results-done");
    expect(done).toBeDisabled();
    // The literal cream outline is only for the live state; a spent control
    // keeps the shared inactive surface so it never looks like a live action.
    expect(done.style.background).not.toBe(rgb(RAW.warmBlack));
    expect(done.style.border).not.toContain(RAW.cream);
  });
});
