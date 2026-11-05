import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const emptyFunnel = { ready_viewed: 0, run_started: 0, run_finished: 0, run_abandoned: 0, shared: 0, subscribed: 0 };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("admin mode reporting", () => {
  it("applies a quick date window to every range-scoped report and supports custom dates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 17, 32));
    try {
      rpc.mockImplementation(async (name: string) => ({ data: name === "admin_funnel" ? [emptyFunnel] : [], error: null }));
      render(<AdminPage />);
      await screen.findByRole("button", { name: "7 days" });
      fireEvent.click(screen.getByRole("button", { name: "7 days" }));
      await waitFor(() => {
        for (const name of ["admin_funnel", "admin_difficulty", "admin_howto", "admin_attribution", "admin_trend", "admin_headline", "admin_rejections", "admin_game_modes", "admin_classic_timing"]) {
          expect(rpc).toHaveBeenCalledWith(name, { p_from: "2026-10-30", p_to: "2026-11-05" });
        }
      });
      fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
      await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_trend", { p_from: "2026-10-01", p_to: "2026-11-05" }));
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps Solo and Together counts and durations independent, using the selected date range", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "admin_funnel" ? [emptyFunnel] : name === "admin_game_modes" ? [
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
    rpc.mockImplementation(async (name: string) => ({ data: name === "admin_funnel" ? [emptyFunnel] : [], error: name === "admin_game_modes" ? { message: "Unavailable" } : null }));
    render(<AdminPage />);
    await waitFor(() => expect(screen.getAllByText("Report unavailable")).toHaveLength(2));
    expect(screen.queryByText("No Solo games completed in this range.")).toBeNull();
    expect(screen.queryByText("No Together games completed in this range.")).toBeNull();
  });
});