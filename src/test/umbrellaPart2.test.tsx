import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { formatNextPuzzle } from "@/components/MultiplayerWindow";

afterEach(() => {
  cleanup();
  setUmbrellaPreviewForTests(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Part 2 umbrella home", () => {
  it("rounds the local-midnight countdown up to an hour", () => {
    expect(formatNextPuzzle(new Date(2026, 8, 27, 23, 59))).toBe("Next puzzle in 1h");
  });
});