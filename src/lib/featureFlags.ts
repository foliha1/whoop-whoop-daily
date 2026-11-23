// ============================================================================
// Feature flags. Flip a value here — one line — to change behaviour.
// ============================================================================

/**
 * Optional sign-in by email code. Off until the sender domain delivers codes.
 * Off: the results email box is a plain daily-reminder signup, and the account
 * items in Settings and the lobby "Restore your streak" link are hidden.
 */
export const SIGN_IN_ENABLED = true;

/**
 * Daily study levels (trial): the Blink / Glance / Look / Study picker on the
 * Daily start screen, the level line on the results screen, and the level in
 * the share image and share text.
 * Off: the start screen shows the welcome line again, every run studies for
 * 10s (Look), and no level is shown to players. The level is still saved with
 * each result and event, so switching this back on needs no other change.
 */
export const STUDY_LEVELS_ENABLED = false;
