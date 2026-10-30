import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const burst = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: { create: () => burst } }));
vi.mock("@/lib/confettiShapes", () => ({ getBrandConfettiShapes: () => [] }));

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("shared Daily and Classic confetti palette", () => {
  it.each(["on", "off"] as const)("draws the frozen token palette with skin %s", async (skin) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    localStorage.setItem("ww-skin", skin);
    vi.resetModules();
    const { default: Confetti } = await import("@/components/DailyMilestoneConfetti");
    render(<Confetti />);
    vi.advanceTimersByTime(1);
    expect(burst).toHaveBeenCalledWith(expect.objectContaining({
      colors: skin === "on" ? ["#719803", "#F05123", "#C900FF", "#231f20"] : ["#0072B2", "#E79024", "#d72229", "#231f20"],
    }));
  });
});