# Unified Product Motion

## Goal
Replace the product’s mixed presentation timings with one motion language while preserving gameplay animation, reducer timing, layout, copy, colors, and immediate interactivity.

## Inventory

### UI motion — migrate to shared tokens

| Surface | Current location | Old motion | New motion |
|---|---|---|---|
| Daily start sections | `src/pages/DailyPage.tsx`, `.daily-intro` in `src/index.css`, `EntryReveal.tsx` | 600ms `ease-out`, rise 16px; delays 0/120/240/320ms | Enter 250ms, rise 8px, shared curve; 40ms section stagger |
| Classic entry chooser | `MultiplayerWindow.tsx` via `EntryReveal` | Same 600ms/16px/120ms system, after asset gate | Same unified 250ms/8px/40ms system; keep the 700ms asset timeout unchanged |
| Classic display-name screen | `MultiplayerWindow.tsx` | No section reveal | Add shared section reveal/stagger |
| Classic lobby and terminal entry screens | `MultiplayerWindow.tsx` | Mostly instant; intro handoff has 250ms `ease-out` plus 120ms delay | Add shared section reveal/stagger; keep frequently changing status content instant |
| Daily results sections | `DailyPage.tsx`, `.ww-res-in` | 250ms, rise 8px, requested curve, 40ms blocks; constants local | Same visible behavior, now driven by central tokens |
| Daily result dots | `DailyPage.tsx`, `.ww-mark-in` | 180ms, scale 0.6→1; 70ms per mark | 180ms, scale 0.8→1; 30ms list stagger capped at item 6 |
| Daily small result elements (badges/chips) | `WhoopPointsChange.tsx`, badge/result children | Mixed inherited entry or hard appearance | Shared 180ms small-element fade/scale, 0.8→1 |
| Daily revisit results | `DailyPage.tsx` | Replays full section and dot sequence | One 200ms opacity-only fade; zero stagger; dots do not replay |
| Daily ready/play/results cross-fade | `DailyScreenFade.tsx` | 250ms `ease`, opacity; background also transitions | At most 250ms with shared curve; opacity/transform-only rule means background color changes instantly rather than animating |
| App route changes | `App.tsx` | 200ms `ease` out, then 200ms in | 150ms exit and 250ms enter with shared curve |
| YOU page sections | `YouPage.tsx`, `DailyStatsBlock.tsx` | No entry motion | 250ms section entries, 40ms stagger |
| YOU tier/earning rows | `YouPage.tsx` | No entry motion | 250ms row entry, 30ms stagger capped at row 6 |
| YOU badge shelf items/current badge | `YouPage.tsx`, `CurrentTierBadge.tsx` | Decode-gated hard appearance | Decode remains required; small-element fade/scale 0.8→1 over 180ms, list delay capped at item 6 |
| Groups page sections | `GroupsPage.tsx` | No entry motion | 250ms section entries, 40ms stagger |
| Groups list rows | `GroupsPage.tsx` | No entry motion | 250ms row entry, 30ms stagger capped at row 6 |
| Group board sections and Today/Season rows | `DailyGroupBoard.tsx` | Hard list/board and tab swaps; no row motion | Shared section entry; rows use capped 30ms list stagger; screen/content changes remain at or under 250ms |
| Create/join/leave group dialogs | `DailyGroupModals.tsx` | Instant mount/unmount | Backdrop fade; panel fade + scale 0.96→1 over 250ms; reverse exit over 150ms |
| Settings dialog | `SettingsSheet.tsx` | Instant shell; toggle knob 150ms `ease-out` | Modal shell uses 250ms enter/150ms exit; toggle interaction remains a quick targeted transition |
| Daily share dialog | `DailySharePreview.tsx` | Instant mount/unmount | Modal tokens: 250ms enter/150ms exit |
| Daily email dialog | `DailyEmailModal.tsx` | Instant mount/unmount | Modal tokens: 250ms enter/150ms exit; keyboard/visual-viewport behavior unchanged |
| Pre-launch email dialog | `DailyPreLaunchSignup.tsx` | Instant mount/unmount | Modal tokens: 250ms enter/150ms exit |
| Classic leave-game modal | `MultiplayerWindow.tsx` | Instant mount/unmount | Modal tokens: 250ms enter/150ms exit |
| In-game confirmation modals | `MultiplayerGameView.tsx` `ModalShell` | Instant mount/unmount | Modal tokens: 250ms enter/150ms exit; no game-state timing changes |
| Classic results | `ClassicResultScreen.tsx` | Instant full-screen entry | Sections use 250ms/40ms entry; rows use capped 30ms list stagger; modal-style shell exits in 150ms where dismissal is locally owned |
| How to Play slide chrome | `DailyHowToSteps.tsx`, `.ww-step-in/out` | 320ms directional 32px slide + scale 0.97; reduced motion 250ms linear fade | Screen change ≤250ms on shared curve; UI chrome uses 8px/opacity language, exit 150ms; reduced motion fade-only with no delay |
| Classic How to Play chrome/copy | `ClassicDemo.tsx`, `DemoSpotlight.tsx` | Mostly 250ms `ease-out` or 250ms demo curve fades | Shared 250ms curve for chrome/copy only; scripted board/die teaching motion remains untouched |
| Toasts | `src/components/ui/toast.tsx` | Utility defaults, large directional slide, `transition-all` | Shared enter/exit durations and curve, targeted opacity/transform properties only; swipe gesture remains functional |

### Gameplay motion — deliberately unchanged

| Motion | Location | Existing timing / behavior | Why untouched |
|---|---|---|---|
| Card flip | `GameCard.tsx` | 500ms, `cubic-bezier(0.4,0,0.2,1)` | Core feedback and settle synchronization |
| Deal-in | `GameCard.tsx`, `.ww-deal` | 900ms linear, 60ms/card | Gameplay board treatment; demo timing also reads it |
| Card selection wash/ring | `.ww-select-*` | 120ms | Claim feedback |
| Active claim/board pulse | `.ww-select-pulse*` | 1000ms loop | Claim-window state signal |
| Wrong match | `.ww-wrong*` | 1000ms linear | Feeds `SETTLE_WRONG_MS` through reveal/hold timing |
| Match ghost | `.ww-great*`, match ghost parts | 300ms delay + 1000ms treatment; total Daily match settle 1900ms | Feeds `SETTLE_MATCH_MS` |
| Daily reveal/hold/final reveal | `animationTiming.ts`, `dailyEndSequence.ts` | 500ms reveal, 100ms hold, 1300ms great, 1500ms final reveal | Load-bearing result handoff |
| Multiplayer die overlay | `RollHeroOverlay.tsx` | 800ms tumble, 250ms landing inside 2000ms total | Server-time synchronized |
| Daily die intro | `DailyRoundIntro.tsx` | 200ms fade-in, 800ms tumble, 800ms hold, 320ms visual exit | Daily ROLL phase timing |
| Claim window / abandon / retry | `animationTiming.ts`, game hooks | 2000ms / 9000ms / 400ms retry | Rules, network safety, and reducer timing |
| Card removal/entry and in-game state effects | `GameCard.tsx`, `MultiplayerGameView.tsx` | Existing card enter/shrink and state-specific fades | Gameplay presentation; changing UI remains instant or quick only |
| Status banner, score chips, turn indicators | `MultiplayerGameView.tsx` | Instant or 200–250ms targeted fades | Frequently changing; no new entry animation |
| How to Play board, card, die, spotlight sequencing | `ClassicDemo.tsx`, `DailyHowToSteps.tsx` | Script-specific 120–2800ms beats and real gameplay timings | Demonstrates game mechanics; only surrounding chrome is unified |

### Decorative, rare — deliberately unchanged

| Motion | Location | Existing timing | Why untouched |
|---|---|---|---|
| Milestone/tier-up confetti | `DailyMilestoneConfetti.tsx` | Existing delayed burst, 3000ms lifetime | Rare celebration and already reduced-motion gated |
| Result button/streak shine | `.ww-sweep-once`, `.ww-sweep-loop` | 900ms once; 3500ms loop capped at 8 | Existing milestone treatment |
| Classic “Great Game!” color chase | `ClassicResultScreen.tsx`, `.ww-chase-letter` | 2000ms step-end cycle | Explicit rare-result exception |
| Classic intro artwork | `IntroAnimation.tsx` | Native Lottie duration, frozen final frame | Branded first-run artwork; asset behavior remains unchanged |
| Lobby/play attention shines and spinners | `MultiplayerWindow.tsx`, `.ww-play-*`, `.ww-shine-*` | Existing 0.8–2s loops | State/attention indicators, not page-entry language |
| Logo art cross-fade | `DailyLogoLockup.tsx` | 200ms opacity | Asset handoff, not section entry |
| Hover/press/toggle feedback | token button styles, `.ww-press`, recall chevron | 120–200ms targeted interactions | Interaction feedback rather than entry/exit motion |

Unused legacy keyframes (`win-open`, `score-bounce`, `double-title-*`, old dice helpers, and similar unreferenced definitions) will not be repurposed; removal is outside this presentational migration unless a changed stylesheet test requires cleanup.

## Shared motion system

In `src/lib/animationTiming.ts`, add named presentation constants and expose matching root variables through `applyAnimationTimingVars()`:

- `UI_ENTER_MS = 250`
- `UI_EXIT_MS = 150`
- `UI_REVISIT_MS = 200`
- `UI_SECTION_STAGGER_MS = 40`
- `UI_LIST_STAGGER_MS = 30`
- `UI_LIST_STAGGER_LIMIT = 6`
- `UI_SMALL_ENTER_MS = 180`
- `UI_ENTER_DISTANCE_PX = 8`
- `UI_MODAL_START_SCALE = 0.96`
- `UI_SMALL_START_SCALE = 0.8`
- `UI_EASE = cubic-bezier(0.23, 1, 0.32, 1)`

Add shared classes/helpers for section entry, capped list entry, small-element entry, revisit fade, modal backdrop/panel entry and exit, and route/screen transitions. All use only opacity and transform. Existing `ENTRY_ASSET_TIMEOUT_MS = 700` remains unchanged.

Reduced motion will keep opacity fades, remove transforms, and force all stagger variables to zero. Controls remain mounted and tappable throughout; animation wrappers never use `pointer-events: none` for incoming content.

## Implementation

1. Centralize the Daily result constants and CSS literals in the new tokens; change mark scale from 0.6 to 0.8 and stagger from 70ms to capped 30ms.
2. Update `EntryReveal`, Daily start, and Classic chooser/display-name/lobby entry structures to consume shared section delays without changing their asset gate.
3. Add reusable presentational wrappers/hooks for section/list entry and controlled modal exit. Apply them to YOU, Groups, group boards, Classic results, and the named dialogs/sheets.
4. Add the explicit Daily revisit branch: one 200ms fade around the completed result, with section and dot classes disabled. Fresh completion retains the full stagger and milestone timing.
5. Move route, Daily screen, and How to Play chrome transitions to the shared curve and durations; leave demo/gameplay choreography intact.
6. Replace `transition-all` in the active toast with explicit opacity/transform transitions while retaining swipe behavior.

## Verification

- Add timing-token and reduced-motion tests, including zero stagger and fade-only transforms.
- Test Daily fresh completion versus revisit: fresh result staggers and dots animate; revisit uses one 200ms fade with no dot replay.
- Test list delay capping: items 1–6 use 0/30/60/90/120/150ms and every later item stays at 150ms.
- Test modal enter and delayed 150ms exit without blocking buttons, Escape, backdrop close, focus return, or visual-viewport handling.
- Verify Daily, YOU, Groups, Classic entry/lobby/results, settings, share, email, create/join/leave dialogs in normal and reduced-motion modes.
- Run focused tests, type-check through the project harness, and browser-check representative 390×520 and desktop flows in light/night themes.
- Confirm `SETTLE_MATCH_MS`, `SETTLE_WRONG_MS`, claim windows, reducer behavior, gameplay animation constants, copy, colors, and layout are byte-for-byte unchanged unless imports move without value changes.
