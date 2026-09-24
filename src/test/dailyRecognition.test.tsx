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

vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-recognition" }));
vi.mock("@/lib/haptics", () => ({
  hapticTap: () => {},
  hapticError: () => {},
  hapticSuccess: () => {},
}));
vi.mock("@/lib/sounds", () => ({ playSubscribed: () => {} }));

import DailyRecognition from "@/components/DailyRecognition";
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

describe("clearSubscribed", () => {
  it.skip("removes only the email and the subscribed flag", () => {
    localStorage.setItem("ww_visitor_id", "visitor-recognition");
    localStorage.setItem("ww_daily_whoop-2026-08-18", '{"seed":"whoop-2026-08-18"}');
    markSubscribed("felix+daily@gmail.com");
    expect(getSubscribedEmail()).toBe("felix+daily@gmail.com");

    clearSubscribed();

    expect(getSubscribedEmail()).toBeNull();
    expect(hasSubscribed()).toBe(false);
    expect(localStorage.getItem("ww_daily_email")).toBeNull();
    expect(localStorage.getItem("ww_daily_subscribed")).toBeNull();
    // Untouched: the visitor id and today's stored result.
    expect(localStorage.getItem("ww_visitor_id")).toBe("visitor-recognition");
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

describe("not-recognized state opens the existing capture", () => {
  it.skip("restores a known address through the same path, with the same response", async () => {
    rpc.mockResolvedValue({ data: true, error: null }); // email_has_history
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onRestored = vi.fn();
    render(<DailyRecognition email={null} onForget={() => {}} onRestored={onRestored} />);

    expect(screen.getByTestId("daily-recognition").textContent).toContain(
      "Already playing?"
    );

    fireEvent.click(screen.getByTestId("daily-restore-open"));
    // Restore wording, not subscribe wording.
    expect(
      screen.getByRole("heading", { name: "Restore your streak." })
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    // Exactly the existing subscribe path: same RPC, same edge function.
    await waitFor(() => expect(screen.getByText("Welcome back.")).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith("email_has_history", {
      p_email: "player@example.com",
    });
    expect(invoke).toHaveBeenCalledWith(
      "ac-subscribe",
      expect.objectContaining({
        body: expect.objectContaining({
          email: "player@example.com",
          visitorId: "visitor-recognition",
          source: "restore",
        }),
      })
    );
    expect(onRestored).toHaveBeenCalledWith("player@example.com", true);
    // The address is on file locally, so the streak read can union rows.
    expect(getSubscribedEmail()).toBe("player@example.com");
  });

  it.skip("gives an unknown address the existing new-signup response", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<DailyRecognition email={null} onForget={() => {}} />);

    fireEvent.click(screen.getByTestId("daily-restore-open"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "brand-new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(screen.getByText("You're in. See you tomorrow.")).toBeTruthy()
    );
  });
});
