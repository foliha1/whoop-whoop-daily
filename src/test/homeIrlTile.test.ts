import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Home IRL tile is the one tap to the physical game, so its card fan must
// keep showing one card per brand colour: blue, red and orange.
const src = readFileSync(resolve(__dirname, "../components/MultiplayerWindow.tsx"), "utf8");

describe("Home IRL tile card fan", () => {
  // The compact tile is the permanent treatment; its markup starts at the
  // tile's own class (the retired banner uses a different class string).
  const tile = src.slice(src.indexOf('className="ww-home-irl"'));

  it("shows a blue, a red and an orange card", () => {
    for (const token of ["RAW.blue", "RAW.red", "RAW.orange"]) {
      expect(tile).toContain(`fill={${token}}`);
    }
    expect(tile.match(/<rect /g)?.length).toBe(3);
  });

  it("keeps every card outlined in cream", () => {
    expect(tile.match(/stroke=\{RAW\.cream\}/g)?.length).toBe(3);
  });
});
