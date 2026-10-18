import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClassicDemo from "@/components/ClassicDemo";
import { setUmbrellaPreviewForTests } from "@/lib/launch";

vi.mock("@/lib/sounds", () => ({ playCorrect: vi.fn(), playDeal: vi.fn(), playDiceRoll: vi.fn(), playDieLand: vi.fn(), playFlip: vi.fn(), playSelect: vi.fn(), playWhoopCall: vi.fn(), playWrong: vi.fn(), startTheme: vi.fn(), stopTheme: vi.fn(), leaveThemeZone: vi.fn(), prewarmTheme: vi.fn(), HOW_TO_PLAY_THEME_FILE: "howto.mp3" }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); setUmbrellaPreviewForTests(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); setUmbrellaPreviewForTests(null); });

describe("Classic tutorial navigation", () => {
  it("cancels outgoing step timers when advancing and going back rapidly", () => {
    render(<ClassicDemo mode="reference" onStart={vi.fn()} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByRole("status")).toHaveTextContent("The Die Decides");
    expect(screen.queryByText("Flip and Remember")).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
  it("keeps reference close separate from starting a game", () => {
    const onStart = vi.fn(); const onClose = vi.fn();
    render(<ClassicDemo mode="reference" onStart={onStart} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});