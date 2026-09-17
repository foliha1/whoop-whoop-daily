// The results screen's group line must be invisible to a player who is not in
// a group: no prompt, no empty state — so its height is identical to a screen
// with no line at all. Groups need no sign-in, so the only gate is membership.

import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let rows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpc(...args);
      return Promise.resolve({ data: rows, error: null });
    },
  },
}));

import DailyGroupsLine from "@/components/DailyGroupsLine";

const renderLine = () =>
  render(
    <MemoryRouter>
      <DailyGroupsLine puzzleNumber={10} email={null} mobile />
    </MemoryRouter>
  );

describe("groups line on the results screen", () => {
  beforeEach(() => {
    rpc.mockClear();
    rows = [];
  });

  it("renders nothing for a player who is in no group", async () => {
    const { container } = renderLine();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("reads groups with the visitor id and no session", async () => {
    renderLine();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const call = rpc.mock.calls.find((c) => c[0] === "get_my_groups");
    expect(call).toBeTruthy();
    expect((call![1] as { p_visitor_id: string }).p_visitor_id.length).toBeGreaterThan(0);
  });

  it("shows one line for a member", async () => {
    rows = [
      {
        group_id: "g1",
        name: "Sunday Crew",
        code: "abc234",
        member_count: 3,
        my_position: 2,
        my_points: 4,
        puzzle_number: 10,
      },
    ];
    const { findByTestId } = renderLine();
    const line = await findByTestId("results-groups-line");
    expect(line.textContent).toContain("2nd today");
  });
});
