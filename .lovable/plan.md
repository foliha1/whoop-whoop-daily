# NEW DAILY START — ON-only implementation plan

## Outcome

When the umbrella switch is ON, choosing Daily opens the existing gameplay frame immediately: nine stable face-down cards on the khaki gameplay surface, dimmed behind a small start dialog. The dialog says:

- **Daily #N**
- **10 seconds to study. The die rolls after.**
- **Start**

Start is the only action that begins the run. The launch switch remains OFF, and the current OFF Daily entry remains byte-for-byte unchanged.

## Entry flow

1. Keep the Daily engine in its existing `READY` phase while the board and dialog are visible. Cards are non-interactive and face down; no attempt, timer, analytics start event, or persistence begins on mount or reload.
2. For a brand-new player, open the existing How to Play gate first. Every completion/skip path marks onboarding complete and reveals the board plus start dialog; it does not start the game.
3. For an onboarded player, show the board plus dialog immediately.
4. On **Start**, unlock audio and record the tap, play the shared modal exit fade, then call the existing single `startRun()` funnel. Preserve its art-readiness ceiling, start sound, `run_started` event, and engine sequence. The existing study countdown still starts only when the engine enters `STUDY`; no gameplay timer is rewritten or placed in an effect with changing dependencies.
5. Keep the shared Home control above the dim layer before Start. The start dialog’s keyboard loop includes **Start** and **Home**. Home exits without calling `startRun()` or `forfeit()`, so nothing is saved.
6. After Start, the Home control is replaced by the existing top-left X as soon as the run is in progress. Its leave dialog and forfeit behavior remain unchanged.
7. If today is already played—locally or restored from the server—open today’s result automatically. A reload before Start reconstructs `READY`, the face-down board, and the dialog.

## Current ready-screen inventory and destination when ON

| Current item | ON destination |
|---|---|
| Daily logo | Already hidden in the umbrella Daily; remains absent. Home retains the plain WHOOP! WHOOP! lockup. |
| Full date heading | Replaced on Daily entry by `Daily #N` in the start dialog; Home’s Daily tile already carries the same puzzle number. |
| “Played today” pill and “See Today’s Result” button | Removed from the Daily entry. Played visitors go directly to the result; Home continues to show “See Today’s Results” and its countdown. |
| Streak line | Kept in today’s result and Your Stats. Add the current streak to the Home Settings “Daily history” area so the pre-game information is not lost for signed-out recognized players. |
| How to Play chip | Already present on Home. It remains there and continues to open the same reference walkthrough. First-time Daily visitors still receive the gate automatically before the new start dialog. |
| Settings gear | Already present on Home. It remains the pre-game home for appearance, sound, music, name, account, reminder, and How to Play controls. |
| Main play CTA and “Dealing…” state | Replaced by the dialog’s Start button. Start uses the same art wait and busy guard, preventing double starts. |
| “Playing as … / Not you?”, Forget confirmation, and “Restore your streak” | Move to a clearly labelled **Daily history** section in Home Settings, reusing `DailyRecognition`, its restore modal, local forget behavior, account recheck, and streak refresh. This keeps restoration available before play without crowding the board. |
| Legal footer | Already present on Home below its Daily/Solo/Together choices and remains the legal destination reached by the pre-start Home control. No legal routes are removed. |
| End-of-Daily email capture | Unchanged on the result screen. |
| Home reminder signup | Unchanged on Home; its `source="home"` path remains intact. |
| Prelaunch “Coming …” state, signup CTA/overlay, subscribed state, and focus return | Preserve the current gated ready screen as the sole ON exception when `daily.preLaunch` is true, because a playable board must not be exposed before launch. Debug bypass behavior stays unchanged. |
| Debug seed/day banner | Remains visible in its current fixed position and continues to disable real tracking/persistence. |
| Ready-screen music, audio unlock, art preload, and `ready_viewed` analytics | Keep the same lifecycle intent: pre-start remains the non-playing theme zone; Start is the run-start gesture; preload remains staged; the landing event remains once per puzzle. |

## Decisions included for Felix’s review

- **Recommended:** identity restore/forget and the pre-game streak move into Home Settings under “Daily history.” This is the only proposed new location; putting them after the game could let someone play under the wrong identity first.
- **Recommended:** retain the current prelaunch screen only while the date gate is active. Removing it would also remove the first-puzzle email-list path and could expose a puzzle before launch.
- The visible full calendar date and “Played today” pill do not move elsewhere: `Daily #N`, the Home tile state, and direct result opening replace them without adding clutter to gameplay.

## Accessibility, motion, and theme

- Build the popup as an announced dialog with title/body relationships; focus lands on **Start**.
- Trap Tab/Shift+Tab between **Start** and the still-available **Home** control. Escape and backdrop taps do nothing. The dimmed board is inert and hidden from pointer/keyboard interaction until Start.
- Use the existing modal panel, scrim, focus-visible, and semantic color tokens. Light/night values therefore follow the current theme automatically; gameplay remains khaki in both modes as it does now.
- Use the shared modal exit timing from `animationTiming.ts`/`useMotionExit`. Under reduced motion, preserve all states and focus behavior but use the project’s existing opacity-only treatment with no scale or movement.
- Announce the dialog once; do not expose nine disabled cards as actionable controls before Start. Existing study/readout live announcements resume after Start.

## Expected files

- **Add:** `src/components/DailyStartDialog.tsx` — start dialog, dim layer, Home control, focus handling, and shared exit motion.
- **Edit:** `src/pages/DailyPage.tsx` — ON-only entry branching, board-at-READY presentation, onboarding handoff, automatic result opening, and existing start funnel integration.
- **Edit:** `src/components/MultiplayerWindow.tsx` — pass Home’s Daily identity/streak refresh behavior into Settings.
- **Edit:** `src/components/SettingsSheet.tsx` — optional ON Home “Daily history” section.
- **Possibly edit:** `src/components/DailyRecognition.tsx` only if a small presentation prop is needed for the Settings placement; its restore/forget logic will not change.
- **Edit:** `src/test/umbrellaPart3.test.tsx` and add `src/test/dailyStartDialog.test.tsx` for launch gating and dialog behavior.
- **Edit during implementation bookkeeping:** `AGENTS.md` for the new entry-state rule and `roadmap.md` for task completion.
- No backend, migration, analytics allowlist, gameplay rule, scoring, timing, sign-in flag, or Groups change.

## Tests and visual verification

- ON: tile navigation lands on face-down board + exact dialog copy; cards cannot be tapped; Start has initial focus; Tab cycles through Start/Home; Escape and backdrop cannot start or dismiss; Home exits with no local/server attempt.
- ON: Start exits with shared timing, fires once despite repeat input, then follows the existing deal/study flow; verify the 10-second counter starts from 10 only after Start.
- ON: first visit shows How to Play before the board dialog; completing or skipping onboarding reveals the dialog without starting.
- ON: already-played local and server-restored attempts open results directly; reload-before-start shows the dialog again and saves nothing.
- ON: identity restore, masked recognized email, Forget confirmation, streak refresh, result signup, Home signup, and prelaunch signup remain reachable and retain their existing data paths.
- Accessibility: dialog announcement, focus placement/trap, inert board, Home escape path, reduced-motion treatment, and screen-reader labels.
- Screenshots at **390×844, 360×640, and 390×600**, each in **light and night**, covering first-time onboarding, board + popup, popup exit/study start, and already-played result. Confirm no scrolling, overlap, clipped cards, or undersized controls.
- OFF: full regression suite plus the existing static/byte-parity checks; explicitly assert the ready screen’s labels, order, controls, prelaunch states, and behavior are unchanged.
- Keep `src/launch.config.ts` set to `launched: false`; do not publish.
