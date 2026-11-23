import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import DailyStartDialog from "@/components/DailyStartDialog";
import { STUDY_LEVELS, normalizeStudyLevel, studyMsFor } from "@/lib/studyLevels";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Daily study levels", () => {
  it("offers Blink 3s, Glance 6s, Look 10s, Study 15s", () => {
    expect(STUDY_LEVELS.map((l) => [l.key, l.ms])).toEqual([
      ["blink", 3000], ["glance", 6000], ["look", 10000], ["study", 15000],
    ]);
  });

  it("counts missing or unknown levels as Look", () => {
    expect(normalizeStudyLevel(undefined)).toBe("look");
    expect(normalizeStudyLevel("forever")).toBe("look");
    expect(studyMsFor(null)).toBe(10000);
  });

  it("preselects Look so an untouched Start plays like today", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    render(<DailyStartDialog puzzleNumber={5} onStart={start} />);
    expect(screen.getByRole("radio", { name: /Look/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => { vi.runAllTimers(); });
    expect(start).toHaveBeenCalledWith("look");
  });

  it("starts with the level the player picked", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    render(<DailyStartDialog puzzleNumber={5} onStart={start} />);
    fireEvent.click(screen.getByRole("radio", { name: /Blink/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => { vi.runAllTimers(); });
    expect(start).toHaveBeenCalledWith("blink");
  });
});
