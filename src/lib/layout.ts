/**
 * Single source of truth for the shell edge padding used by every
 * multiplayer screen (play-style, nickname, solo-setup, lobby, in-game).
 * Both PreGameShell and the in-game board import from here so the screens
 * can't drift apart.
 */
export const MOBILE_SHELL_PAD = 12;
export const DESKTOP_SHELL_PAD = 8;

/** Live Classic action row: shared by the game and its How to Play demo. */
export const CLASSIC_ACTION_ROW_HEIGHT = 110.94;
