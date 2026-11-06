import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

import SubscribeChip, { SUBSCRIBE_BENEFITS } from "@/components/SubscribeChip";

describe("lobby Subscribe chip", () => {
  it("opens an explainer listing the three benefits", () => {
    render(<SubscribeChip style={{}} />);
    fireEvent.click(screen.getByTestId("lobby-subscribe"));
    expect(screen.getByText("Stay in the loop loop.")).toBeTruthy();
    expect(SUBSCRIBE_BENEFITS.map((b) => b.title)).toEqual(["Daily reminder", "Score keeper", "Game updates"]);
    for (const b of SUBSCRIBE_BENEFITS) expect(screen.getByText(`${b.title}.`)).toBeTruthy();
  });

  it("is shown only to players who are not subscribed", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/MultiplayerWindow.tsx", "utf8");
    expect(src).toContain("const showSubscribeChip = umbrella && !reminderSubscribed;");
  });
});
