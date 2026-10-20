// ============================================================================
// Win celebration tests — the streak confetti must fire on a Solo/Together
// win (launched build), only for the viewer's winning seat.
// ============================================================================

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no canvas: stub the burst engine and the brand shapes so the
// component still mounts its canvas node (the thing we assert on).
vi.mock("canvas-confetti", () => {
  const instance = (() => {}) as never as { reset: () => void };
  (instance as { reset?: unknown }).reset = () => {};
  return { default: { create: () => instance } };
});
vi.mock("@/lib/confettiShapes", () => ({ getBrandConfettiShapes: () => [] }));

import ClassicResultScreen, { type ResultEntry } from "@/components/ClassicResultScreen";

const WIN: ResultEntry[] = [
  { seat: 0, name: "YOU", score: 12 },
  { seat: 1, name: "FELIX", score: 6 },
];

const mount = (mySeat: number | null, entries: ResultEntry[] = WIN) =>
  render(
    <ClassicResultScreen
      entries={entries}
      target={12}
      canRematch
      onPlayAgain={() => {}}
      onDone={() => {}}
      mySeat={mySeat}
    />,
  );

afterEach(cleanup);

describe("win celebration (Classic result screen)", () => {
  it("the winning seat sees the streak confetti", async () => {
    mount(0);
    expect(await screen.findByTestId("milestone-confetti", {}, { timeout: 1500 })).toBeInTheDocument();
  });

  it("a losing seat sees no confetti", async () => {
    mount(1);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByTestId("milestone-confetti")).not.toBeInTheDocument();
  });

  it("a spectator sees no confetti", async () => {
    mount(null);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByTestId("milestone-confetti")).not.toBeInTheDocument();
  });

  it("a tie the viewer shares still celebrates", async () => {
    mount(1, [
      { seat: 0, name: "YOU", score: 12 },
      { seat: 1, name: "FELIX", score: 12 },
    ]);
    expect(await screen.findByTestId("milestone-confetti", {}, { timeout: 1500 })).toBeInTheDocument();
  });
});
