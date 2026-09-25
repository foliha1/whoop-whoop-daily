// Regression: importing the account module must not erase this browser's
// reminder-subscription state. A previous version wiped "ww_daily_subscribed"
// (and the legacy "ww_daily_email") at import time, so a player who had signed
// up for the daily reminder was asked for their email again on every load.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));
vi.mock("@/lib/visitor", () => ({ getVisitorId: () => "visitor-regression" }));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: () => {} }));

beforeEach(() => {
  localStorage.clear();
});

describe("the account module never wipes the reminder flag on load", () => {
  it("a fresh import of account leaves a stored subscription in place", async () => {
    localStorage.setItem("ww_daily_subscribed", "1");
    localStorage.setItem("ww_daily_email", "player@example.com");

    vi.resetModules();
    await import("@/lib/account");

    expect(localStorage.getItem("ww_daily_subscribed")).toBe("1");
    expect(localStorage.getItem("ww_daily_email")).toBe("player@example.com");
  });
});
