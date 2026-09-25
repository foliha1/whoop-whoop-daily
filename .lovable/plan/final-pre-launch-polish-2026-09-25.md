# Final pre-launch polish

## What will change

- Sweep visible copy across Daily, Classic, Your Stats, Groups, Settings, sign-in, legal/support pages, install metadata, and all authentication emails. Change only British-to-American spelling and every product-name reference and every “WHOOP!” reference as “WHOOP! WHOOP!” / “Whoop! Whoop!”; keep all other wording and voice intact. Preserve the intentional “W! W!” abbreviation exactly.
- Add a **Resend code** action to the six-digit code screen. It will show a visible 60-second countdown after every successful send, use the existing code-send path and its provider rate limits, restart only after a successful resend, and show the existing plain rate-limit message or a clear send-failure message without leaving the code screen.
- Show **Your Stats** in Daily Settings only when a player is signed in. Keep `/you` available and verify it loads correctly for a signed-in player.
- Add one stable build-version query string to Daily and Classic manifest links and every icon URL, including icons inside both manifests. The same build identifier will be reused throughout a release, so browsers can refresh changed assets after a release without refetching them on every page load.
- Extend the existing Daily theme-music zone to Your Stats. The current gapless loop, volume, preference, and audio-unlock behavior stay unchanged; route handoff will preserve the running source between results and Your Stats so back-and-forth navigation does not restart the track.

## Verification

- Add or update focused tests for resend countdown, success, generic failure, and rate-limit failure; signed-out/signed-in Settings visibility; versioned raw Daily and Classic install metadata; email naming; and continuous music-zone handoff.
- Exercise real preview flows at desktop and mobile sizes: signed-out Settings, signed-in Settings and direct Your Stats, resend countdown/error state, and results ↔ Your Stats music behavior.
- Run the complete automated suite and inspect the latest preview diagnostics. Keep sign-in enabled, leave gameplay/scoring/tiers/decay/Classic rules/Groups visibility untouched, and do not publish.

## Technical details

- Reuse `sendSignInCode`; no new email endpoint or bypass is introduced. Countdown state is local to the sign-in screen and timers are cleaned up on unmount.
- Use the build identifier supplied to the frontend build, with a stable local fallback, in both runtime head tags and generated raw HTML/manifests.
- Add a route-handoff-safe acquire/release layer around the current theme engine. Gameplay still calls the existing immediate stop, while adjacent music screens cancel a pending route release and retain the same loop position.

## Assumptions

- “W! W!” is the one intentional abbreviation and remains unchanged, including install names.
- “Whoop Score” becomes “Whoop! Whoop! Score,” and visible “WHOOP!” references become “WHOOP! WHOOP!” / “Whoop! Whoop!” as context requires. Internal component and variable names remain unchanged where they are not shown to players.
