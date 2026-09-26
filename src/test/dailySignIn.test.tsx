import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const rpc = vi.fn();
const invoke = vi.fn();
const trackDaily = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({}),
    },
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: (...a: unknown[]) => trackDaily(...a) }));

import DailySignIn from "@/components/DailySignIn";
import { getSubscribedEmail, emailHasHistory } from "@/lib/dailySubscribe";
import { isValidSignInCode, verifySignInCode } from "@/lib/account";

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  rpc.mockReset();
  invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  trackDaily.mockReset();
});

async function toCode() {
  render(<DailySignIn />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
  await screen.findByLabelText("6-digit code");
}

async function finishResendCooldown() {
  for (let second = 0; second < 60; second += 1) {
    await act(async () => vi.advanceTimersByTime(1_000));
  }
}

describe("optional sign-in", () => {
  it("keeps text on the fixed orange score panel warm black in night mode", () => {
    render(<DailySignIn onAccentSurface />);
    expect(screen.getByRole("heading", { name: "Save your score." })).toHaveStyle({ color: "#231f20" });
    expect(screen.getByText(/Sign in with your email/)).toHaveStyle({ color: "#231f20" });
    expect(screen.getByText(/Signing in doesn't add/)).toHaveStyle({ color: "#231f20" });
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveStyle({ color: "#231f20" });
  });

  it("accepts only exactly six ASCII numeric digits at verification", async () => {
    expect(isValidSignInCode("123456")).toBe(true);
    expect(isValidSignInCode(" 123456 ")).toBe(true);
    expect(isValidSignInCode("12345")).toBe(false);
    expect(isValidSignInCode("1234567")).toBe(false);
    expect(isValidSignInCode("12345a")).toBe(false);
    expect(isValidSignInCode("１２３４５６")).toBe(false);

    await expect(verifySignInCode("a@b.co", "12345")).resolves.toEqual({ ok: false, reason: "invalid_code" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a typed email reveals nothing before verification", async () => {
    expect(getSubscribedEmail()).toBeNull();
    expect(await emailHasHistory("a@b.co")).toBe(false);
    await toCode();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText("6-digit code")).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("holds resend for 60 seconds, then sends another code through the same path", async () => {
    vi.useFakeTimers();
    try {
      render(<DailySignIn />);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
      fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();

      await finishResendCooldown();
      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
      await act(async () => {});

      expect(signInWithOtp).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("status")).toHaveTextContent("A new code is on its way.");
      expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the provider's rate-limit guidance when a resend is rejected", async () => {
    vi.useFakeTimers();
    try {
      render(<DailySignIn />);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
      fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
      await act(async () => {});
      await finishResendCooldown();
      signInWithOtp.mockResolvedValueOnce({ error: { message: "429 Too many requests" } });
      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
      await act(async () => {});
      expect(screen.getByRole("alert")).toHaveTextContent("Too many tries. Wait a minute and try again.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the resend control available after a generic send failure", async () => {
    vi.useFakeTimers();
    try {
      render(<DailySignIn />);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
      fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
      await act(async () => {});
      await finishResendCooldown();
      signInWithOtp.mockResolvedValueOnce({ error: { message: "Temporary provider error" } });
      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
      await act(async () => {});
      expect(screen.getByRole("alert")).toHaveTextContent("We couldn't resend the code. Try again.");
      expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a wrong code", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Token has expired or is invalid" } });
    await toCode();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
  });

  it("keeps a new player's prompt mounted until an explicit decline", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockImplementation(async (name: string) =>
      name === "link_device_and_merge"
        ? { data: [{ first_signin: true, games: 0, was_subscriber: false, reminder_answered: false }], error: null }
        : { data: true, error: null }
    );
    const onSignedIn = vi.fn();
    const onChoiceRequiredChange = vi.fn();
    render(<DailySignIn onSignedIn={onSignedIn} onChoiceRequiredChange={onChoiceRequiredChange} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
    await screen.findByLabelText("6-digit code");
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("We'll send you the daily puzzle.");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onChoiceRequiredChange).toHaveBeenCalledWith(true);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No thanks." }));
    await screen.findByTestId("signin-done");
    expect(rpc).toHaveBeenCalledWith("set_reminder_consent", { p_consented: false, p_source: "post_signin" });
    expect(onChoiceRequiredChange).toHaveBeenLastCalledWith(false);
    expect(onSignedIn).toHaveBeenCalledWith("a@b.co", false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records the affirmative action before completing sign-in", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockImplementation(async (name: string) =>
      name === "link_device_and_merge"
        ? { data: [{ first_signin: true, games: 0, was_subscriber: false, reminder_answered: false }], error: null }
        : { data: true, error: null }
    );
    const onSignedIn = vi.fn();
    render(<DailySignIn onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sounds good" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith("a@b.co", false));
    expect(rpc).toHaveBeenCalledWith("set_reminder_consent", { p_consented: true, p_source: "post_signin" });
    expect(invoke).toHaveBeenCalledWith("ac-subscribe", expect.objectContaining({ body: expect.objectContaining({ email: "a@b.co" }) }));
    expect(trackDaily).toHaveBeenCalledWith("reminder_opt_in", {
      props: { choice: "sounds_good", source: "post_signin" },
    });
  });

  it("an existing subscriber merges quietly without the prompt", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockResolvedValue({ data: [{ first_signin: true, games: 19, was_subscriber: true, reminder_answered: false }], error: null });
    await toCode();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(screen.getByTestId("signin-done")).toHaveTextContent("19 games"));
  });

  it("a previously answered player is never asked again", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockResolvedValue({ data: [{ first_signin: false, games: 2, was_subscriber: false, reminder_answered: true }], error: null });
    await toCode();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByTestId("signin-done");
    expect(screen.queryByText("We'll send you the daily puzzle.")).toBeNull();
  });
});
