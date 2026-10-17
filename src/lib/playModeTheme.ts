import type { ButtonVariant } from "@/lib/tokens";

/** The three ways to play, in lobby order. */
export type PlayMode = "daily" | "solo" | "together";

/**
 * Every play mode keeps one signature fill across the app: the lobby tile and
 * the matching Stats tab pill must agree, so the pairing lives in one place.
 * Fills and foregrounds come from the canonical button palette — accent is
 * brand orange with warm black ink, secondary is blue, primary is red — the
 * same three surfaces the entry tiles use.
 */
export const PLAY_MODE_BUTTON: Record<PlayMode, ButtonVariant> = {
  daily: "accent",
  solo: "secondary",
  together: "primary",
};

/** Stats tabs in lobby order. */
export const PLAY_MODES: readonly PlayMode[] = ["daily", "solo", "together"];
