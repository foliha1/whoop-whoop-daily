import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let sessionEmail: string | null = null;

vi.mock("@/lib/account", () => ({
  getSessionEmail: () => sessionEmail,
  onAccountChange: () => () => {},
  getReminderStatus: async () => null,
  setReminder: async () => true,
  deleteAccount: async () => ({ ok: true }),
  signOut: async () => {},
}));

import SettingsSheet from "@/components/SettingsSheet";

beforeEach(() => {
  sessionEmail = null;
});

afterEach(() => cleanup());

describe("Daily Settings stats visibility", () => {
  it("does not offer Your Stats while signed out", () => {
    render(<SettingsSheet product="daily" onClose={() => {}} />);
    expect(screen.queryByTestId("settings-you-link")).toBeNull();
  });

  it("offers Your Stats to a signed-in player", () => {
    sessionEmail = "player@example.com";
    render(<SettingsSheet product="daily" onClose={() => {}} />);
    expect(screen.getByTestId("settings-you-link")).toHaveAttribute("href", "/you");
    expect(screen.getByTestId("settings-you-link")).toHaveTextContent("Your Stats");
  });
});