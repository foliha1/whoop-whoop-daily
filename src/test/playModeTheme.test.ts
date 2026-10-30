import { describe, expect, it } from "vitest";
import { PLAY_MODES, PLAY_MODE_BUTTON } from "@/lib/playModeTheme";
import { BUTTON_PALETTE, RAW } from "@/lib/tokens";

/**
 * The Stats tabs borrow their fill from the lobby tiles, so the two screens can
 * never drift apart: remapping a mode has to keep the lobby's exact surface.
 */
describe("play-mode accents", () => {
  it("gives every mode a tab pill in its lobby tile's own surface and ink", () => {
    expect(BUTTON_PALETTE[PLAY_MODE_BUTTON.daily]).toMatchObject({ bg: RAW.orange, fg: RAW.warmBlack });
    expect(BUTTON_PALETTE[PLAY_MODE_BUTTON.solo]).toMatchObject({ bg: RAW.blue, fg: RAW.onBlue });
    expect(BUTTON_PALETTE[PLAY_MODE_BUTTON.together]).toMatchObject({ bg: RAW.red, fg: RAW.cream });
  });

  it("lists the tabs in lobby order with no mode missing", () => {
    expect([...PLAY_MODES]).toEqual(["daily", "solo", "together"]);
    expect(PLAY_MODES.every((mode) => Boolean(PLAY_MODE_BUTTON[mode]))).toBe(true);
  });
});
