import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LaunchAnnouncement, { LAUNCH_NOTE_HEADLINE, shouldShowLaunchNote } from "@/components/LaunchAnnouncement";
import { COLORS } from "@/lib/tokens";

/** Each section's marker must carry that section's own title colour. */
const SECTIONS = [
  { title: "Play Daily!", color: COLORS.orangeStat },
  { title: "Play Solo!", color: COLORS.blue },
  { title: "Play Together!", color: COLORS.red },
];

const mount = () => render(
  <MemoryRouter>
    <LaunchAnnouncement onClose={() => {}} />
  </MemoryRouter>,
);

describe("launch announcement", () => {
  it("shows the raised-hands headline in an accessible dialog", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: LAUNCH_NOTE_HEADLINE });
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent("just got more fun 🙌");
  });

  it("bullets every way to play in that section's title colour", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: LAUNCH_NOTE_HEADLINE });
    for (const { title, color } of SECTIONS) {
      const heading = within(dialog).getByRole("heading", { name: title });
      expect(heading).toHaveStyle({ color });
      const marker = heading.closest("li")?.querySelector<HTMLElement>("[aria-hidden='true']");
      expect(marker?.textContent).toBe("•");
      expect(marker).toHaveStyle({ color });
    }
  });

  it("shows on every entry while the umbrella switch is off", () => {
    expect(shouldShowLaunchNote()).toBe(true);
  });
});
