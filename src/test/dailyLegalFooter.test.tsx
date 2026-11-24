import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DailyLegalFooter from "@/components/DailyLegalFooter";

describe("shared footer", () => {
  it("links to the game's Instagram profile in a new tab", () => {
    render(
      <MemoryRouter>
        <DailyLegalFooter />
      </MemoryRouter>,
    );

    const instagram = screen.getByRole("link", { name: "Instagram" });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/whoop.whoop.game/");
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(instagram).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });
});
