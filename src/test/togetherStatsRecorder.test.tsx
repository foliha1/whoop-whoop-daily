import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PublicState } from "@/lib/publicState";
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/playerStats", () => ({ rememberMatch: save }));
import { useTogetherStatsRecorder } from "@/hooks/useTogetherStatsRecorder";
beforeEach(() => save.mockClear());
describe("Together personal totals", () => {
  it("records joiners as well as hosts and includes tied first place", () => {
    const s = { phase: "GAME_OVER", gameId: "g", scores: [12, 12, 2] } as PublicState;
    renderHook(() => useTogetherStatsRecorder(s, 1, true));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "g", won: true, mode: "together" }));
  });
  it("never records unreleased OFF games or spectators", () => {
    const s = { phase: "GAME_OVER", gameId: "g", scores: [12, 3] } as PublicState;
    renderHook(() => useTogetherStatsRecorder(s, 1, false));
    renderHook(() => useTogetherStatsRecorder(s, null, true));
    expect(save).not.toHaveBeenCalled();
  });
  it("a rematch counts once under its new game id", () => {
    const s = { phase: "GAME_OVER", gameId: "g", scores: [12, 3] } as PublicState;
    const { rerender } = renderHook((snapshot) => useTogetherStatsRecorder(snapshot, 1, true), { initialProps: s });
    rerender({ ...s });
    rerender({ ...s, gameId: "g2" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ won: false, id: "g2" }));
  });
});