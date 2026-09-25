import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
const invoke = vi.fn();
const signInWithOtp = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: () => {} }));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-flag-off" }));
vi.mock("@/lib/haptics", () => ({ hapticError: () => {}, hapticSuccess: () => {}, hapticTap: () => {} }));
vi.mock("@/lib/sounds", () => ({ playSubscribed: () => {} }));
// Pins the OFF behaviour for these tests regardless of the live flag value,
// which is release-controlled (flipped on in preview to test the real flow).
vi.mock("@/lib/featureFlags", () => ({ SIGN_IN_ENABLED: false }));

import DailyEmailCapture from "@/components/DailyEmailCapture";
import DailyRecognition from "@/components/DailyRecognition";

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  signInWithOtp.mockReset();
  localStorage.clear();
});

describe("sign-in switched off", () => {
  it("results box subscribes to the reminder, no code, nothing looked up", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onSubscribed = vi.fn();
    render(<DailyEmailCapture onSubscribed={onSubscribed} />);
    expect(screen.getByText("We only send the daily puzzle.", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/coming back/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "New@Example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign Me Up" }));
    await waitFor(() => expect(screen.getByText("You're in. See you tomorrow.")).toBeTruthy());
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("ac-subscribe");
    expect(invoke.mock.calls[0][1].body).toMatchObject({ email: "new@example.com", source: "daily_result" });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(onSubscribed).toHaveBeenCalledWith("new@example.com", false);
  });

  it("lobby shows no restore link while signed out", () => {
    const { container } = render(<DailyRecognition email={null} onForget={() => {}} />);
    expect(container.textContent).toBe("");
  });
});
