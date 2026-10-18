import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClassicDemo from "@/components/ClassicDemo";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { playFlip } from "@/lib/sounds";

vi.mock("@/lib/sounds", () => ({ playCorrect: vi.fn(), playDeal: vi.fn(), playDiceRoll: vi.fn(), playDieLand: vi.fn(), playFlip: vi.fn(), playSelect: vi.fn(), playWhoopCall: vi.fn(), playWrong: vi.fn(), startTheme: vi.fn(), stopTheme: vi.fn(), leaveThemeZone: vi.fn(), prewarmTheme: vi.fn(), HOW_TO_PLAY_THEME_FILE: "howto.mp3" }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/components/RollHeroOverlay", () => ({ default: () => null, TUMBLE_MS: 800 }));

beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers(); vi.clearAllMocks(); setUmbrellaPreviewForTests(true);
  vi.stubGlobal("DOMRect", class { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); setUmbrellaPreviewForTests(null); });

describe("Classic tutorial navigation", () => {
  it("cancels outgoing step timers when advancing and going back rapidly", () => {
    render(<ClassicDemo mode="reference" onStart={vi.fn()} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(playFlip).not.toHaveBeenCalled();
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