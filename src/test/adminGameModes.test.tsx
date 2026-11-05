import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    auth: {
      getSession: async () => ({ data: { session: { user: { email: "admin@example.test" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/components/AdminBackupBanner", () => ({ default: () => null }));
vi.mock("@/lib/account", () => ({ signOut: vi.fn() }));
import AdminPage from "@/pages/AdminPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("admin mode reporting", () => {
  it("keeps Solo and Together counts and durations independent, using the selected date range", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "admin_funnel" ? [{}] : name === "admin_game_modes" ? [
      { mode: "solo", games_completed: 7, median_seconds: 90, avg_players: 2, avg_correct_claims: 4.5, avg_wrong_claims: 1.2 },
      { mode: "together", games_completed: 3, median_seconds: 240, avg_players: 4, avg_correct_claims: 8.5, avg_wrong_claims: 2.1 },
    ] : [], error: null }));
    render(<AdminPage />);
    await screen.findByText("1:30");
    const solo = screen.getByRole("heading", { name: "Solo" }).closest("section");
    const together = screen.getByRole("heading", { name: "Together" }).closest("section");
    if (!solo || !together) throw new Error("Missing mode reports");
    expect(within(solo).getByText("7")).toBeTruthy();
    expect(within(solo).getByText("1:30")).toBeTruthy();
    expect(within(together).getByText("3")).toBeTruthy();
    expect(within(together).getByText("4:00")).toBeTruthy();
    expect(within(solo).queryByText("8.5")).toBeNull();
    expect(within(together).queryByText("4.5")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("admin_game_modes", {
      p_from: (screen.getByLabelText("From date") as HTMLInputElement).value,
      p_to: (screen.getByLabelText("To date") as HTMLInputElement).value,
    });
    expect(rpc.mock.calls.some(([name]) => name === "admin_classic")).toBe(false);
  });

  it("does not present a failed mode report as zero completed games", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "admin_funnel" ? [{}] : [], error: name === "admin_game_modes" ? { message: "Unavailable" } : null }));
    render(<AdminPage />);
    await waitFor(() => expect(screen.getAllByText("Report unavailable")).toHaveLength(2));
    expect(screen.queryByText("No Solo games completed in this range.")).toBeNull();
    expect(screen.queryByText("No Together games completed in this range.")).toBeNull();
  });
});