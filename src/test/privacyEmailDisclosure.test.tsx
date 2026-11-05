// The lobby Subscribe explainer promises "Game updates — the odd note when
// something new drops." That promise is only lawful if the Privacy page says
// the same thing, so this test pins the disclosure down: the page must name
// both mailings and must never go back to the old "daily puzzle only" claim.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
      signInWithOtp: async () => ({}),
      verifyOtp: async () => ({}),
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import PrivacyPage from "@/pages/PrivacyPage";

const renderPrivacy = () =>
  render(
    <HelmetProvider>
      <PrivacyPage />
    </HelmetProvider>
  );

describe("Privacy email disclosure", () => {
  it("discloses the daily reminder and the occasional game update", () => {
    renderPrivacy();
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");

    expect(text).toMatch(/daily puzzle reminder/i);
    expect(text).toMatch(/game update/i);
    expect(text).toMatch(/something new happens in the game/i);
  });

  it("never claims the daily puzzle is the only email", () => {
    renderPrivacy();
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");

    expect(text).not.toMatch(/we do not send anything other than the daily puzzle/i);
    expect(text).not.toMatch(/we only send the daily puzzle/i);
  });

  it("keeps the unsubscribe route next to the disclosure", () => {
    renderPrivacy();
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");

    expect(text).toMatch(/unsubscribe at any time/i);
    expect(text).toMatch(/hello@whoop-whoop\.com/);
  });
});
