// Single source of truth for animation timings that BOTH CSS and JS need.
//
// The CSS rules in index.css read these through custom properties
// (`--ww-great-delay`, `--ww-deal-stagger`, `--ww-deal-move`) with the same
// literals as fallbacks; `applyAnimationTimingVars()` writes the authoritative
// values onto :root at startup so the two can never drift.

/** Delay before the great-match ghost animation starts (`.ww-great*`). */
export const GREAT_MATCH_DELAY_MS = 300;
/** Per-card stagger of the deal-in animation (`--ww-deal-i * stagger`). */
export const DEAL_STAGGER_MS = 60;
/** Duration of the deal-in move — a card "lands" at the end of it. */
export const DEAL_MOVE_MS = 900;

// ---- card treatments shared by the board and How to Play -------------------
// These mirror the values in index.css / GameCard so a sequence can be timed
// against them instead of re-guessing durations.
/** Card flip (`rotateY`) in GameCard and the ghost layer. */
export const CARD_FLIP_MS = 500;
/** Selection wash + ring one-shot (`.ww-select-*`). */
export const SELECT_ANIM_MS = 120;
/** Wrong-claim shake + red wash + ring one-shot (`.ww-wrong*`). */
export const WRONG_ANIM_MS = 1000;
/** Programmatic press treatment (`.ww-press` / `.ww-press-on`). */
export const PRESS_ANIM_MS = 200;


// ---- daily-specific match sequence ----------------------------------------
// The daily needs two beats the multiplayer settle does not have: the pair is
// face down when it resolves, so it must flip up and then be held long enough
// to read before the shared ghost treatment plays.
/** Flip-up of the solved pair on the daily board (matches GameCard's flip). */
export const DAILY_MATCH_REVEAL_MS = 500;
/** Beat on the revealed pair before the success animation starts. */
export const DAILY_MATCH_HOLD_MS = 100;
/** Ghost treatment window — the same beat as SETTLE_MATCH_MS in useGameState. */
export const DAILY_MATCH_GREAT_MS = 1300;
/** Whole daily correct-match sequence: reveal → hold → ghost lift and fade. */
export const DAILY_MATCH_SETTLE_MS =
  DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS + DAILY_MATCH_GREAT_MS;

/**
 * Whole wrong-claim sequence on a board whose pair is face down when the claim
 * resolves: reveal → hold → the shared `.ww-wrong*` shake / red wash / ring.
 * Multiplayer's SETTLE_WRONG_MS is exactly this.
 */
export const WRONG_SETTLE_TOTAL_MS =
  DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS + WRONG_ANIM_MS;

/** Delay from a settle starting to the moment its treatment begins playing. */
export const SETTLE_REVEAL_HOLD_MS = DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS;


/** Final beat after round 3: the remaining board is shown before the result. */
export const DAILY_FINAL_REVEAL_MS = 1500;

/** Cross-fade between daily screens (ready, gameplay, reveal, result). */
export const DAILY_SCREEN_FADE_MS = 250;


export function applyAnimationTimingVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--ww-great-delay", `${GREAT_MATCH_DELAY_MS}ms`);
  root.style.setProperty("--ww-deal-stagger", `${DEAL_STAGGER_MS}ms`);
  root.style.setProperty("--ww-deal-move", `${DEAL_MOVE_MS}ms`);
}
