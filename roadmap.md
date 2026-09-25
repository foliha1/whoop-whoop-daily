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
