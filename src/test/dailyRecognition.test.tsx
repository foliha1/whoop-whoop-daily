import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
const invoke = vi.fn();

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: {
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      signOut: (...a: unknown[]) => signOut(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: () => {} }));
// These cover the sign-in build: run them with the switch on.
vi.mock("@/lib/featureFlags", () => ({ SIGN_IN_ENABLED: true }));

vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-recognition" }));
vi.mock("@/lib/haptics", () => ({
  hapticTap: () => {},
  hapticError: () => {},
  hapticSuccess: () => {},
}));
vi.mock("@/lib/sounds", () => ({ playSubscribed: () => {} }));

import DailyRecognition from "@/components/DailyRecognition";
import { renderHook, act } from "@testing-library/react";
import { useSubscriberStatus } from "@/hooks/useSubscriberStatus";
import {
  clearSubscribed,
  getSubscribedEmail,
  hasSubscribed,
  markSubscribed,
  maskEmail,
} from "@/lib/dailySubscribe";

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
  clearSubscribed();
});

describe("maskEmail", () => {
  it("keeps the first character and the whole domain", () => {
    expect(maskEmail("felix@gmail.com")).toBe("f•••@gmail.com");
  });

  it("handles a short local part, a long one, and a plus sign", () => {
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(
      maskEmail("felix.oliha.the.longest.local.part@some-really-long-domain.co.uk")
    ).toBe("f•••@some-really-long-domain.co.uk");
    expect(maskEmail("felix+daily@gmail.com")).toBe("f•••@gmail.com");
  });

  it("never leaks the local part length and is empty for junk", () => {
    expect(maskEmail("felix@gmail.com")).toBe(maskEmail("f@gmail.com"));
    expect(maskEmail(null)).toBe("");
    expect(maskEmail("not-an-email")).toBe("");
    expect(maskEmail("@nope.com")).toBe("");
  });
});

describe("Not you? signs out on this device", () => {
  it("signs out and disconnects this browser, keeping preferences and played games", async () => {
    localStorage.setItem("ww_visitor_id", "visitor-recognition");
    localStorage.setItem("ww_daily_whoop-2026-08-18", '{"seed":"whoop-2026-08-18"}');
    localStorage.setItem("ww_music_enabled", "1");
    const { result } = renderHook(() => useSubscriberStatus());
    act(() => result.current.forgetLocal());
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem("ww_visitor_id")).toBeNull());
    expect(result.current.email).toBeNull();
    expect(getSubscribedEmail()).toBeNull();
    // Played games stay recorded so the Daily can't be replayed.
    expect(localStorage.getItem("ww_daily_whoop-2026-08-18")).toBe(
      '{"seed":"whoop-2026-08-18"}'
    );
    // Device preferences survive.
    expect(localStorage.getItem("ww_music_enabled")).toBe("1");
  });
});

describe("Delete Account keeps played games", () => {
  it("clears identity but keeps today's played record", async () => {
    const { deleteAccount } = await import("@/lib/account");
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    localStorage.setItem("ww_visitor_id", "visitor-recognition");
    localStorage.setItem("ww_daily_whoop-2026-08-18", '{"seed":"whoop-2026-08-18"}');
    localStorage.setItem("ww_daily_subscribed", "1");
    expect(await deleteAccount()).toBe(true);
    expect(localStorage.getItem("ww_visitor_id")).toBeNull();
    expect(localStorage.getItem("ww_daily_subscribed")).toBeNull();
    expect(localStorage.getItem("ww_daily_whoop-2026-08-18")).toBe(
      '{"seed":"whoop-2026-08-18"}'
    );
  });
});

describe("recognized state", () => {
  it("shows the masked address and confirms before forgetting", () => {
    const onForget = vi.fn();
    render(<DailyRecognition email="felix+daily@gmail.com" onForget={onForget} />);

    expect(screen.getByTestId("daily-recognition").textContent).toContain(
      "Playing as"
    );
    expect(screen.getByTestId("daily-recognition-email").textContent).toBe(
      "f•••@gmail.com"
    );

    // Not a large button: a plain inline text action.
    fireEvent.click(screen.getByTestId("daily-not-you"));
    expect(onForget).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-recognition").textContent).toContain(
      "Forget f•••@gmail.com on this device?"
    );

    // Backing out leaves everything alone.
    fireEvent.click(screen.getByTestId("daily-forget-cancel"));
    expect(onForget).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-recognition").textContent).toContain(
      "Playing as"
    );

    fireEvent.click(screen.getByTestId("daily-not-you"));
    fireEvent.click(screen.getByTestId("daily-forget-confirm"));
    expect(onForget).toHaveBeenCalledTimes(1);
  });
});

describe("not-recognized state opens sign-in", () => {
  async function signIn(merge: Record<string, unknown>) {
    verifyOtp.mockResolvedValue({ data: { session: { user: { email: "player@example.com" } } }, error: null });
    rpc.mockImplementation(async (name: string) =>
      name === "link_device_and_merge" ? { data: [merge], error: null } : { data: true, error: null }
    );
    const onRestored = vi.fn();
    render(<DailyRecognition email={null} onForget={() => {}} onRestored={onRestored} />);
    expect(screen.getByTestId("daily-recognition").textContent).toContain("Already playing?");
    fireEvent.click(screen.getByTestId("daily-restore-open"));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "player@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    return onRestored;
  }

  it("restores a known player only after the code, with their history", async () => {
    const onRestored = await signIn({ first_signin: true, games: 12, was_subscriber: true, reminder_answered: false });
    await waitFor(() => expect(screen.getByText("Welcome back — we found 12 games.")).toBeTruthy());
    // Nothing was looked up by the typed address before verification.
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["link_device_and_merge"]);
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "player@example.com" }));
    expect(onRestored).toHaveBeenCalledWith("player@example.com", true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the first-time choice open and blocks unrelated dialog dismissal", async () => {
    const onRestored = await signIn({ first_signin: true, games: 0, was_subscriber: false, reminder_answered: false });
    await screen.findByText("We'll send you the daily puzzle.");
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.queryByTestId("daily-restore-close")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("daily-email-modal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No thanks." }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith("player@example.com", false));
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("played-today state belongs to the current identity", () => {
  const KEY = "ww_daily_whoop-2026-08-18";
  it("sign in, play, sign out: the account's result does not stay", async () => {
    const { saveDailyResult } = await import("@/lib/daily");
    const { clearLocalPlayerData } = await import("@/lib/account");
    saveDailyResult({ seed: "whoop-2026-08-18", elapsedMs: 1 } as never, "account");
    clearLocalPlayerData();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("anonymous play first, then sign in and out: its own result stays", async () => {
    const { saveDailyResult, loadDailyResult } = await import("@/lib/daily");
    const { clearLocalPlayerData, deleteAccount } = await import("@/lib/account");
    saveDailyResult({ seed: "whoop-2026-08-18", elapsedMs: 1 } as never, "anon");
    clearLocalPlayerData();
    expect(loadDailyResult("whoop-2026-08-18")?.owner).toBe("anon");
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteAccount()).toBe(true);
    expect(loadDailyResult("whoop-2026-08-18")?.owner).toBe("anon");
  });
  it("deletion drops an account-owned record", async () => {
    const { saveDailyResult } = await import("@/lib/daily");
    const { deleteAccount } = await import("@/lib/account");
    saveDailyResult({ seed: "whoop-2026-08-18", elapsedMs: 1 } as never, "account");
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteAccount()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
