import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreorderAnnouncement, {
  PREORDER_SIGNUP_ANNOUNCEMENT,
  PREORDER_SIGNUP_SESSION_KEY,
  PREORDER_SUBSCRIBER_ANNOUNCEMENT,
  introAllowsPreorderAnnouncement,
  preorderAnnouncementVariant,
  shouldShowSignupPreorderNote,
  shouldShowSubscriberPreorderNote,
  type PreorderAnnouncementVariant,
} from "@/components/PreorderAnnouncement";
import { subscribeToUpdates } from "@/lib/updatesSubscribe";

vi.mock("@/lib/updatesSubscribe", () => ({ subscribeToUpdates: vi.fn() }));
const subscribe = vi.mocked(subscribeToUpdates);

const mount = (onClose = vi.fn(), variant: PreorderAnnouncementVariant = "signup") => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<PreorderAnnouncement variant={variant} onClose={onClose} />} />
      <Route path="/preorder" element={<h1>Pre-order page</h1>} />
    </Routes>
  </MemoryRouter>,
);

describe("pre-order announcements", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    subscribe.mockReset().mockResolvedValue(true);
  });

  it("shows the original subscriber announcement only once per device", () => {
    expect(shouldShowSubscriberPreorderNote()).toBe(true);
    localStorage.setItem(PREORDER_SUBSCRIBER_ANNOUNCEMENT.seenKey, "1");
    expect(shouldShowSubscriberPreorderNote()).toBe(false);
  });

  it("waits for the intro, then allows either lobby announcement", () => {
    expect(introAllowsPreorderAnnouncement("running")).toBe(false);
    expect(introAllowsPreorderAnnouncement("complete")).toBe(true);
    expect(introAllowsPreorderAnnouncement("skipped")).toBe(true);
    expect(introAllowsPreorderAnnouncement("timeout")).toBe(true);
    expect(introAllowsPreorderAnnouncement("none")).toBe(true);
  });

  it("targets signup to unsubscribed visitors and the original to list members", () => {
    expect(preorderAnnouncementVariant(false, null, false)).toBeNull();
    expect(preorderAnnouncementVariant(true, null, false)).toBe("signup");
    expect(preorderAnnouncementVariant(true, "player@example.com", false)).toBe("subscriber");
    expect(preorderAnnouncementVariant(true, null, true)).toBe("subscriber");
  });

  it("announces community preorders with an email signup", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: "Play Whoop! Whoop! IRL" });
    expect(dialog).toHaveTextContent("Preorders are now live exclusively for the Whoop! Whoop! community. Enter your email to get the details.");
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get the details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("shows the signup once per app visit, not after every return Home", async () => {
    expect(shouldShowSignupPreorderNote()).toBe(true);
    const close = vi.fn();
    const first = mount(close);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(PREORDER_SIGNUP_SESSION_KEY)).toBe("1");
    expect(shouldShowSignupPreorderNote()).toBe(false);
    first.unmount();
    expect(shouldShowSignupPreorderNote()).toBe(false);

    sessionStorage.clear();
    expect(shouldShowSignupPreorderNote()).toBe(true);
    mount();
    expect(await screen.findByRole("dialog", { name: "Play Whoop! Whoop! IRL" })).toBeInTheDocument();
  });

  it("keeps an invalid address in the popup without subscribing", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Get the details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That doesn't look like an email.");
    expect(subscribe).not.toHaveBeenCalled();
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
  });

  it("joins WW: Updates and opens the details", async () => {
    const close = vi.fn();
    mount(close);
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: " Player@Example.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Get the details" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pre-order page" })).toBeInTheDocument());
    expect(subscribe).toHaveBeenCalledWith("Player@Example.COM", "preorder");
    expect(localStorage.getItem(PREORDER_SIGNUP_ANNOUNCEMENT.seenKey)).toBe("1");
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

  it("keeps the original copy and pre-order action for subscribers", async () => {
    const close = vi.fn();
    mount(close, "subscriber");
    const dialog = await screen.findByRole("dialog", { name: PREORDER_SUBSCRIBER_ANNOUNCEMENT.headline });
    expect(dialog).toHaveTextContent("48 cards, a Match Die, and a canvas drawstring bag.");
    expect(dialog).toHaveTextContent("Pre-order for $35 with free shipping. Ships early December 2026.");
    expect(screen.queryByLabelText("Email address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pre-order now" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pre-order page" })).toBeInTheDocument());
    expect(localStorage.getItem(PREORDER_SUBSCRIBER_ANNOUNCEMENT.seenKey)).toBe("1");
    expect(close).toHaveBeenCalledOnce();
  });

  it("dismisses the subscriber version without subscribing", async () => {
    const close = vi.fn();
    mount(close, "subscriber");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(localStorage.getItem(PREORDER_SUBSCRIBER_ANNOUNCEMENT.seenKey)).toBe("1");
    expect(subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Pre-order page" })).toBeNull();
  });
});
