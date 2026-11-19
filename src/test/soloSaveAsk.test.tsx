import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/account", () => ({
  getSessionUserId: () => null,
  onAccountChange: () => () => {},
}));
vi.mock("@/lib/dailyEvents", () => ({ trackDaily: vi.fn() }));
vi.mock("@/components/DailyEmailModal", () => ({
  default: () => <div data-testid="signin-dialog" />,
}));

import ClassicResultScreen from "@/components/ClassicResultScreen";
import { trackDaily } from "@/lib/dailyEvents";

const entries = [{ seat: 0, name: "FELIX", score: 12 }, { seat: 1, name: "OLI", score: 7 }];
const base = { entries, target: 12, canRematch: true, onPlayAgain: () => {}, onDone: () => {} };

describe("Solo result save ask", () => {
  it("asks a signed-out Solo player to save their wins and opens sign-in", async () => {
    render(<ClassicResultScreen {...base} askToSave />);
    const ask = await screen.findByTestId("solo-save-ask");
    expect(ask).toHaveTextContent("Save your wins!");
    expect(trackDaily).toHaveBeenCalledWith("subscribe_shown", { props: { source: "solo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save My Wins" }));
    expect(await screen.findByTestId("signin-dialog")).toBeInTheDocument();
  });

  it("shows no ask at a Together table and no Daily link anywhere", async () => {
    render(<ClassicResultScreen {...base} />);
    await screen.findByRole("button", { name: "Done" });
    expect(screen.queryByTestId("solo-save-ask")).toBeNull();
    expect(screen.queryByText("Play today's Daily")).toBeNull();
  });
});
