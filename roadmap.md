# Roadmap

- [x] Centralize unified UI motion tokens and CSS variables.
- [x] Apply unified entries, capped list stagger, directional screen changes, and modal motion across Daily, YOU, Groups, and Classic.
- [x] Preserve Daily result-dot 70ms replay, screen ground-color fades, and directional How to Play navigation.
- [x] Verify reduced motion, Daily revisit behavior, modal exits, representative viewports/themes, and unchanged gameplay timings.
- [x] Refine YOU tier/score labels and sizes, ladder badges, tier insight spacing, point typography, and centered badge shelf with usable overflow arrows.
- [x] Check YOU layout and badge paging at mobile and desktop widths in both themes.
- [x] Add accessible badge detail views with earned date and tier unlock criteria while preserving shelf layout.
- [x] Verify keyboard paging, focus, screen-reader labels, and reduced-motion behavior on the YOU page.
- [x] Move visible badge details into the modal, reveal shelf overflow only beyond three badges, and refine the hover state.
- [x] Enlarge modal badge, flip it once when decoded, and verify paging and light/night presentation.
- [x] Add the shared card-flip loading state to Your Stats and Groups, including first navigation, refresh, and join-link behavior.
- [x] Verify loading transitions, themes, reduced motion, and responsive layout for both pages.
- [x] Hide Groups player entry points, re-gate `/groups` for debug, and preserve all group data and code.
- [x] Verify the gate and single full-width Your Stats action in the Daily results screen.
- [x] Add reusable, one-time score announcement for returning Daily players, sharing the Your Stats tiles and tracking versioned show/action/dismiss events.
- [x] Verify first-time, returning, seen, failed-points, fresh celebration timing, and 390×520 light/night display and dismissal.

- [x] Daily replay exploit: first attempt counts everywhere; known-email browsers blocked from replaying

## Optional sign-in with email code
- [ ] Build approved plan: code sign-in, server-side identity, first sign-in merge, account deletion, admin lock, events, retention split
- [ ] Reminder consent: yes/no prompt after verification, answer stored with timestamp (option C)
- [ ] Existing subscribers: quiet merge, stay subscribed (option A)
- [ ] Blocked: real code delivery waits on notify.whoop-whoop.com DNS verification
- [x] Sign-in box on Daily results (code only), yes/no reminder prompt, quiet subscriber merge
- [x] Settings: signed-in email, Daily email toggle, Sign Out, Delete Account; privacy policy updated
- [x] Admin panel: signed-in vs anonymous retention + sign-in funnel
- [ ] BLOCKED: sender domain notify.whoop-whoop.com + code-only email template before real delivery
- [x] Email-as-identity removed from server and app (legacy stored-email bridge grandfathered)
- [ ] BLOCKED: full Settings deletion test needs a disposable inbox the owner controls (data wipe verified)

- [ ] Shorten sign-in code expiry to 10 min (blocked: auth setting not reachable from my tools; emails say 60 min until changed)
- [x] Code-only auth emails (all 6) + fast end-of-run test + worker warning fixed

- [x] Add product-specific Daily and Classic home-screen icon sets, manifests, raw head wiring, and verification.

- [x] Save the user-supplied Daily and Classic source marks exactly as provided.
- [x] Replace the written email brand line with light/dark full WHOOP! WHOOP! logos.
- [ ] Use the Daily web-app icon as the inbox avatar (blocked: managed sender has no avatar field; inbox avatars are provider/DNS controlled).

## Final pre-launch batch
- [x] Convert user-facing UK spelling and expand only actual product-title references to “WHOOP! WHOOP!”, including install names; preserve gameplay terms and code identifiers.
- [x] Add a 60-second OTP resend cooldown with existing rate-limit handling.
- [x] Hide Your Stats in Daily Settings while signed out and preserve signed-in direct access.
- [x] Version Daily and Classic install metadata and icon URLs per build.
- [x] Extend the existing Daily theme zone through Your Stats without restarting.
- [x] Verify focused flows, raw install metadata, email templates, and the full test suite; do not publish.

## Groups relaunch prerequisites
- [ ] Key Groups membership by `auth.uid()` (not visitor id) before relaunch; group RPCs are server-only until then (2026-09-25 audit).

## Containment (visitor ids off shared channels)
- [x] Rooms server-only: revoke grants, server-generated code, IP rate cap, no host id in lookups
- [x] Classic uses per-session player keys; server resolves keys to browser ids for seats
- [x] Rejoin confirmed by server (same browser as seat), never display name; test same-name takeover fails
- [x] Signed-out save into linked browser refused; result kept, sign-in prompt, retry
- [x] Verify two-browser game + payload capture + full suite (457/457); publish awaits approval

## Classic reliability batch (approved, unpublished)
- [x] Await seat registration before start (retry once, "Starting…" + retry)
- [x] claim-lock: broadcast failure = unknown; conflict rebroadcasts winner (scoped game_id+claim_window)
- [x] state_request catch-up (subscribe, reconnect, visible)
- [x] ?r=CODE via replaceState
- [x] Per-game reset; grant key gameId:window:seat; host applies grant only for current game AND open window
- [x] Joiner snapshot ordering scoped per gameId; older-game snapshots dropped
- [x] REQUEST_ROLL only from current roller
- [x] Presence blip grace for host and joiners
- [x] Tests incl. late grant after next roll, late game-one snapshot in game two; full suite

## Loading-speed audit batch (planned, unpublished)
- [ ] Stage Daily and Classic game-art preload/decode by screen and interaction
- [ ] Defer active logo animation and music warm-up until after first paint/interaction
- [ ] Remove Classic's nested main-window lazy boundary
- [ ] Gate Daily results-only reads and omit unused lifetime stats
- [ ] Reserve Your Stats late-data section sizes
- [ ] Build and serve unchanged production output for the cold mobile 4G baseline, then repeat after changes with the same profile; analyze bundles and report production cache headers
- [ ] Add regressions, run the full suite, verify the preview, and keep unpublished
