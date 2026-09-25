import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const rpc = vi.fn();
const invoke = vi.fn();
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
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: vi.fn() }));

import DailySignIn from "@/components/DailySignIn";
import { getSubscribedEmail, emailHasHistory } from "@/lib/dailySubscribe";
import { isValidSignInCode, verifySignInCode } from "@/lib/account";

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  rpc.mockReset();
  invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
});

async function toCode() {
  render(<DailySignIn />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.co" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
  await screen.findByLabelText("8-digit code");
}

describe("optional sign-in", () => {
  it("accepts only exactly eight ASCII numeric digits at verification", async () => {
    expect(isValidSignInCode("12345678")).toBe(true);
    expect(isValidSignInCode(" 12345678 ")).toBe(true);
    expect(isValidSignInCode("1234567")).toBe(false);
    expect(isValidSignInCode("123456789")).toBe(false);
    expect(isValidSignInCode("1234567a")).toBe(false);
    expect(isValidSignInCode("１２３４５６７８")).toBe(false);

    await expect(verifySignInCode("a@b.co", "12345")).resolves.toEqual({ ok: false, reason: "invalid_code" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a typed email reveals nothing before verification", async () => {
    expect(getSubscribedEmail()).toBeNull();
    expect(await emailHasHistory("a@b.co")).toBe(false);
    await toCode();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText("8-digit code")).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("refuses a wrong code", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Token has expired or is invalid" } });
    await toCode();
    fireEvent.change(screen.getByLabelText("8-digit code"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
  });

  it("a new player is asked yes/no and never subscribed silently", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockImplementation(async (name: string) =>
      name === "link_device_and_merge"
        ? { data: [{ first_signin: true, games: 0, was_subscriber: false, reminder_answered: false }], error: null }
        : { data: true, error: null }
    );
    await toCode();
    fireEvent.change(screen.getByLabelText("8-digit code"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("Want the daily puzzle by email?");
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No Thanks" }));
    await screen.findByTestId("signin-done");
    expect(rpc).toHaveBeenCalledWith("set_reminder_consent", { p_consented: false, p_source: "post_signin" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("an existing subscriber merges quietly without the prompt", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } }, error: null });
    rpc.mockResolvedValue({ data: [{ first_signin: true, games: 19, was_subscriber: true, reminder_answered: false }], error: null });
    await toCode();
    fireEvent.change(screen.getByLabelText("8-digit code"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(screen.getByTestId("signin-done")).toHaveTextContent("19 games"));
  });
});
