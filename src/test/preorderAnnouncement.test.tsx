import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreorderAnnouncement, {
  PREORDER_ANNOUNCEMENT,
  introAllowsPreorderAnnouncement,
  shouldShowPreorderNote,
} from "@/components/PreorderAnnouncement";

const mount = (onClose = vi.fn()) => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<PreorderAnnouncement onClose={onClose} />} />
      <Route path="/preorder" element={<h1>Pre-order page</h1>} />
    </Routes>
  </MemoryRouter>,
);

describe("pre-order announcement", () => {
  beforeEach(() => localStorage.clear());

  it("shows once per device until either action marks it seen", () => {
    expect(shouldShowPreorderNote()).toBe(true);
    localStorage.setItem(PREORDER_ANNOUNCEMENT.seenKey, "1");
    expect(shouldShowPreorderNote()).toBe(false);
  });

  it("waits for the intro, then allows the lobby announcement", () => {
    expect(introAllowsPreorderAnnouncement("running")).toBe(false);
    expect(introAllowsPreorderAnnouncement("complete")).toBe(true);
    expect(introAllowsPreorderAnnouncement("skipped")).toBe(true);
    expect(introAllowsPreorderAnnouncement("timeout")).toBe(true);
    expect(introAllowsPreorderAnnouncement("none")).toBe(true);
  });

  it("announces the real game, price, shipping, and actions", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: PREORDER_ANNOUNCEMENT.headline });
    expect(dialog).toHaveTextContent("48 cards, a Match Die, and a canvas drawstring bag.");
    expect(dialog).toHaveTextContent("Pre-order for $35 with free shipping. Ships early December 2026.");
    expect(screen.getByRole("button", { name: "Pre-order now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("opens the pre-order page and marks the announcement seen", async () => {
    const close = vi.fn();
    mount(close);
    fireEvent.click(await screen.findByRole("button", { name: "Pre-order now" }));
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBe("1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pre-order page" })).toBeInTheDocument());
    expect(close).toHaveBeenCalledOnce();
  });

  it("dismisses without navigating and marks the announcement seen", async () => {
    const close = vi.fn();
    mount(close);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBe("1");
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Pre-order page" })).toBeNull();
  });
});
