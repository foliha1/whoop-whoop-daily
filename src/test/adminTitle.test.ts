import { describe, expect, it, vi } from "vitest";

// The page module talks to the backend on import; the name itself needs no session.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

import { ADMIN_DASHBOARD_TITLE } from "@/pages/AdminPage";

describe("dashboard name", () => {
  it("is called Whoop! Whoop! Dashboard", () => {
    expect(ADMIN_DASHBOARD_TITLE).toBe("Whoop! Whoop! Dashboard");
  });

  it("keeps the brand in title case, never the old shout caps", () => {
    expect(ADMIN_DASHBOARD_TITLE).not.toMatch(/WHOOP/);
    expect(ADMIN_DASHBOARD_TITLE).toMatch(/^Whoop! Whoop! /);
  });
});
