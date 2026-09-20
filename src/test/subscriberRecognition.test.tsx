import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-fresh" }));
vi.mock("@/lib/haptics", () => ({
  hapticTap: () => {},
  hapticError: () => {},
  hapticSuccess: () => {},
}));
vi.mock("@/lib/sounds", () => ({ playSubscribed: () => {} }));

import DailyEmailCapture from "@/components/DailyEmailCapture";
import {
  emailHasHistory,
  fetchServerSubscriberEmail,
  getSubscribedEmail,
} from "@/lib/dailySubscribe";

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  localStorage.clear();
});

describe("server-side recognition by visitor id", () => {
  it("returns the address on file for this visitor", async () => {
    rpc.mockResolvedValue({ data: " Player@Example.COM ", error: null });
    await expect(fetchServerSubscriberEmail()).resolves.toBe("player@example.com");
    expect(rpc).toHaveBeenCalledWith("get_subscriber_email", {
      p_visitor_id: "visitor-fresh",
    });
  });

  it("is null for an unknown visitor, junk, or a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchServerSubscriberEmail()).resolves.toBeNull();
    rpc.mockResolvedValue({ data: "not-an-email", error: null });
    await expect(fetchServerSubscriberEmail()).resolves.toBeNull();
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchServerSubscriberEmail()).resolves.toBeNull();
    rpc.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(fetchServerSubscriberEmail()).resolves.toBeNull();
  });
});

describe("email_has_history", () => {
  it("reports prior history and never calls out for junk", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(emailHasHistory("player@example.com")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("email_has_history", {
      p_email: "player@example.com",
    });
    rpc.mockReset();
    await expect(emailHasHistory("nope")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads as new on a failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(emailHasHistory("player@example.com")).resolves.toBe(false);
  });
});

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign Me Up" }));
}

describe("the form doubles as a restore path", () => {
  it("says Welcome back for an address with history under another visitor id", async () => {
    rpc.mockResolvedValue({ data: true, error: null }); // email_has_history
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onSubscribed = vi.fn();
    render(<DailyEmailCapture onSubscribed={onSubscribed} />);
    expect(
      screen.getByText("New here, or coming back? Drop in your email.")
    ).toBeTruthy();

    submit("player@example.com");

    await waitFor(() => expect(screen.getByText("Welcome back.")).toBeTruthy());
    expect(onSubscribed).toHaveBeenCalledWith("player@example.com", true);
    // The address is on file locally, so the streak/stats reads can union rows.
    expect(getSubscribedEmail()).toBe("player@example.com");
  });

  it("keeps the new-signup message when the address is genuinely new", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onSubscribed = vi.fn();
    render(<DailyEmailCapture onSubscribed={onSubscribed} />);

    submit("brand-new@example.com");

    await waitFor(() =>
      expect(screen.getByText("You're in. See you tomorrow.")).toBeTruthy()
    );
    expect(onSubscribed).toHaveBeenCalledWith("brand-new@example.com", false);
  });
});
