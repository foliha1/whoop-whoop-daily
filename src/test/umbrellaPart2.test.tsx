import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { formatNextPuzzle } from "@/components/MultiplayerWindow";

const windowSource = () =>
  readFileSync(resolve(process.cwd(), "src/components/MultiplayerWindow.tsx"), "utf8");

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

describe("Part 2 join-only table screen", () => {
  it("never creates a table when joining with an empty code", () => {
    const source = windowSource();
    // The guard must fire before the create fallback in handleConfirmName.
    const guard = source.indexOf('umbrella && view.action === "join" && code.length === 0');
    expect(guard).toBeGreaterThan(-1);
    const fallback = source.indexOf('if (view.action === "create" || code.length === 0)');
    expect(fallback).toBeGreaterThan(guard);
  });

  it("asks for a code instead of saying to leave it blank on the join-only screen", () => {
    const source = windowSource();
    expect(source).toContain('"Enter the table code your friend shared."');
    expect(source).toContain('"Already have a table code?\\nLeave it blank to start your own."');
  });
});
