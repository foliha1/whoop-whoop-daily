import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DailyEmailCapture from "@/components/DailyEmailCapture";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@/lib/dailySubscribe", () => ({ isValidEmail: (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim()), subscribeDaily: subscribe }));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: vi.fn() }));
vi.mock("@/lib/sounds", () => ({ playSubscribed: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ hapticTap: vi.fn(), hapticError: vi.fn(), hapticSuccess: vi.fn() }));

describe("Subscribe feedback", () => {
  beforeEach(() => subscribe.mockReset());
  const setup = () => {
    const confirmed = vi.fn();
    const done = vi.fn();
    render(<DailyEmailCapture source="home" submitLabel="Subscribe" onSubscribed={confirmed} onDone={done} />);
    return { confirmed, done, input: screen.getByRole("textbox", { name: "Email address" }) };
  };
  it("rejects empty and malformed emails without sending", () => {
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("prevents duplicate submits while pending and confirms only success", async () => {
    let resolve: (value: boolean) => void = () => {};
    subscribe.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
    const { input, confirmed, done } = setup();
    fireEvent.change(input, { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(screen.getByRole("button", { name: "Subscribing…" }).hasAttribute("disabled")).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();
    resolve(true);
    await waitFor(() => expect(confirmed).toHaveBeenCalledWith("player@example.com", false));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Let's play" }));
    fireEvent.click(screen.getByRole("button", { name: "Let's play" }));
    expect(done).toHaveBeenCalledOnce();
  });
  it.each(["false", "throw"])("keeps the email and permits retry after %s failure", async kind => {
    if (kind === "false") subscribe.mockResolvedValue(false);
    else subscribe.mockRejectedValue(new Error("offline"));
    const { input, confirmed } = setup();
    fireEvent.change(input, { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    await screen.findByRole("button", { name: "Try again" });
    expect((input as HTMLInputElement).value).toBe("player@example.com");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(confirmed).not.toHaveBeenCalled();
    subscribe.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
  });
});