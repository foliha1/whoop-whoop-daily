import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FONT_FAMILY, FONT_FAMILY_UI } from "@/lib/tokens";

// The page module talks to the backend on import; the name itself needs no session.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

import AdminPage, { ADMIN_DASHBOARD_TITLE } from "@/pages/AdminPage";

describe("dashboard name", () => {
  it("is called Whoop! Whoop! Dashboard", () => {
    expect(ADMIN_DASHBOARD_TITLE).toBe("Whoop! Whoop! Dashboard");
  });

  it("keeps the brand in title case, never the old shout caps", () => {
    expect(ADMIN_DASHBOARD_TITLE).not.toMatch(/WHOOP/);
    expect(ADMIN_DASHBOARD_TITLE).toMatch(/^Whoop! Whoop! /);
  });

  it("uses Friend for the sign-in header and Geist for its content and button", async () => {
    render(<AdminPage />);
    const button = await screen.findByRole("button", { name: "Send Code" });
    expect(screen.getByRole("heading", { name: "Sign in" })).toHaveStyle({ fontFamily: FONT_FAMILY });
    expect(screen.getByLabelText("Email")).toHaveStyle({ fontFamily: FONT_FAMILY_UI });
    expect(button).toHaveStyle({ fontFamily: FONT_FAMILY_UI });
  });
});
