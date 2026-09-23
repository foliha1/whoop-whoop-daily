import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardFlipLoader from "@/components/CardFlipLoader";
import ClassicLoading from "@/components/ClassicLoading";
import type { MyGroup } from "@/lib/dailyGroups";
import type { WhoopPoints } from "@/lib/whoopPoints";

let pointsState: { points: WhoopPoints | null; loading: boolean } = { points: null, loading: true };
let groupState: { groups: MyGroup[]; loading: boolean; reload: () => void } = { groups: [], loading: true, reload: vi.fn() };

vi.mock("@/hooks/useWhoopPoints", () => ({
  useWhoopPointsState: () => pointsState,
  usePointsPopulation: () => null,
}));
vi.mock("@/hooks/useMyGroups", () => ({ useMyGroups: () => groupState }));
vi.mock("@/hooks/useSubscriberStatus", () => ({ useSubscriberStatus: () => ({ email: null }) }));
vi.mock("@/lib/dailyResults", () => ({ fetchDailyStats: () => Promise.resolve(null) }));

import YouPage from "@/pages/YouPage";
import GroupsPage from "@/pages/GroupsPage";

const wrap = (path: string, page: React.ReactNode) => (
  <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={path.split("?")[0]} element={page} /></Routes></MemoryRouter></HelmetProvider>
);

afterEach(() => {
  pointsState = { points: null, loading: true };
  groupState = { groups: [], loading: true, reload: vi.fn() };
});

describe("page card loaders", () => {
  it("uses the same card artwork and accessible labels on every surface", () => {
    const { rerender } = render(<ClassicLoading />);
    expect(screen.getByRole("status", { name: "Loading WHOOP! WHOOP! Classic" }).querySelector(".ww-loading-flip")).toBeInTheDocument();
    rerender(<CardFlipLoader label="Loading Your Stats" layout="page" />);
    expect(screen.getByRole("status", { name: "Loading Your Stats" }).querySelector(".ww-loading-flip")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading Your Stats" }).querySelectorAll("img")).toHaveLength(2);
  });

  it("shows a card until Your Stats resolves, then keeps the existing error state", () => {
    const view = render(wrap("/you", <YouPage />));
    expect(screen.getByRole("status", { name: "Loading Your Stats" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Stats" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back/ })).toBeInTheDocument();
    pointsState = { points: null, loading: false };
    view.rerender(wrap("/you", <YouPage />));
    expect(screen.queryByRole("status", { name: "Loading Your Stats" })).not.toBeInTheDocument();
    expect(screen.getByTestId("you-score-error")).toBeInTheDocument();
  });

  it("keeps group invite codes usable during loading, then shows empty controls", async () => {
    const path = "/groups?join=abc234";
    const view = render(wrap(path, <GroupsPage />));
    expect(screen.getByRole("status", { name: "Loading Groups" })).toBeInTheDocument();
    expect(screen.queryByTestId("groups-create")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("group-join-code")).toHaveValue("abc234"));
    groupState = { groups: [], loading: false, reload: vi.fn() };
    view.rerender(wrap(path, <GroupsPage />));
    expect(screen.queryByRole("status", { name: "Loading Groups" })).not.toBeInTheDocument();
    expect(screen.getByTestId("groups-empty")).toBeInTheDocument();
    expect(screen.getByTestId("groups-create")).toBeInTheDocument();
  });

  it("hides stale group rows and membership actions during a refresh", () => {
    const group: MyGroup = { group_id: "g1", name: "Friends", code: "abc234", member_count: 2, my_position: 1, my_points: 3, puzzle_number: 1 };
    groupState = { groups: [group], loading: false, reload: vi.fn() };
    const view = render(wrap("/groups", <GroupsPage />));
    expect(screen.getByTestId("groups-list-item")).toBeInTheDocument();
    groupState = { ...groupState, loading: true };
    act(() => view.rerender(wrap("/groups", <GroupsPage />)));
    expect(screen.getByRole("status", { name: "Loading Groups" })).toBeInTheDocument();
    expect(screen.queryByTestId("groups-list-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("groups-carry-over")).not.toBeInTheDocument();
  });
});