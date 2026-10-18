import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RollHeroOverlay from "@/components/RollHeroOverlay";
import { setUmbrellaPreviewForTests } from "@/lib/launch";

vi.mock("@/hooks/useServerClock", () => ({ serverNow: () => Date.now() }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { cleanup(); vi.useRealTimers(); setUmbrellaPreviewForTests(null); });

describe.each([true, false])("roll deadline with umbrella %s", (on) => {
  it("keeps completion at 2000ms even after tapping to skip", () => {
    setUmbrellaPreviewForTests(on);
    const complete = vi.fn();
    const rect = { left: 0, top: 0, width: 80, height: 80 } as DOMRect;
    render(<RollHeroOverlay commit={{ roundId: "test", attribute: "COLOR", faceIndex: 0, tumbleSeed: 1, startAt: 0 }} homeRect={rect} targetRect={rect} parentRect={rect} onComplete={complete} />);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByLabelText("Match die showing COLOR"));
    act(() => { vi.advanceTimersByTime(1899); });
    expect(complete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});