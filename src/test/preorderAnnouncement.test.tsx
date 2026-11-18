import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreorderAnnouncement, {
  PREORDER_ANNOUNCEMENT,
  accountAllowsPreorderAnnouncement,
  introAllowsPreorderAnnouncement,
  shouldShowPreorderNote,
} from "@/components/PreorderAnnouncement";
import { subscribeToUpdates } from "@/lib/updatesSubscribe";

vi.mock("@/lib/updatesSubscribe", () => ({ subscribeToUpdates: vi.fn() }));
const subscribe = vi.mocked(subscribeToUpdates);

const mount = (onClose = vi.fn()) => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<PreorderAnnouncement onClose={onClose} />} />
      <Route path="/preorder" element={<h1>Pre-order page</h1>} />
    </Routes>
  </MemoryRouter>,
);

describe("pre-order announcement", () => {
  beforeEach(() => {
    localStorage.clear();
    subscribe.mockReset().mockResolvedValue(true);
  });

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

  it("shows only to visitors whose restored account state is signed out", () => {
    expect(accountAllowsPreorderAnnouncement(false, null)).toBe(false);
    expect(accountAllowsPreorderAnnouncement(true, "player@example.com")).toBe(false);
    expect(accountAllowsPreorderAnnouncement(true, null)).toBe(true);
  });

  it("announces community preorders with an email signup", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: "Play Whoop! Whoop! IRL" });
    expect(dialog).toHaveTextContent("Preorders are now live exclusively for the Whoop! Whoop! community. Enter your email to get the details.");
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get the details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("keeps an invalid address in the popup without subscribing", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Get the details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That doesn't look like an email.");
    expect(subscribe).not.toHaveBeenCalled();
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBeNull();
  });

  it("keeps a failed signup in the popup without navigating", async () => {
    subscribe.mockResolvedValue(false);
    const close = vi.fn();
    mount(close);
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Get the details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't add you. Try again.");
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Pre-order page" })).toBeNull();
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBeNull();
  });

  it("joins WW: Updates, marks the announcement seen, and opens the details", async () => {
    const close = vi.fn();
    mount(close);
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: " Player@Example.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Get the details" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pre-order page" })).toBeInTheDocument());
    expect(subscribe).toHaveBeenCalledWith("Player@Example.COM", "preorder");
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBe("1");
    expect(close).toHaveBeenCalledOnce();
  });

  it("continues after a successful Enter-key form submission", async () => {
    mount();
    const input = await screen.findByLabelText("Email address");
    fireEvent.change(input, { target: { value: "player@example.com" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pre-order page" })).toBeInTheDocument());
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("dismisses without subscribing or navigating and marks the announcement seen", async () => {
    const close = vi.fn();
    mount(close);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(localStorage.getItem(PREORDER_ANNOUNCEMENT.seenKey)).toBe("1");
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Pre-order page" })).toBeNull();
  });
});
