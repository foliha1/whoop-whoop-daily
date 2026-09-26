# Classic responsiveness batch

## Scope
Five items, in order. No change to game rules, the 2-second flip hold, settle/animation durations (match 1900ms, wrong 1600ms, roll 2000ms, final claim window 2000ms), the claim arbiter, points, sign-in, or Groups visibility. Nothing published until approved.

## 1. Instant tap acknowledgment (joiner)
- On pointerdown of an ordinary face-down card, the joiner sets a local `pendingFlip = { idx, at }` and the card gets a press + subtle ring (existing motion tokens; reduced motion = static ring, no scale). The face is never revealed locally.
- Cleared when: a host snapshot shows that card peeking (real flip takes over), a snapshot shows another card/phase that makes the tap invalid (rejected), or after a named `JOINER_TAP_ACK_TIMEOUT_MS = 1000` in `animationTiming.ts`, fading out with the existing exit token.
- Host and solo paths unchanged (they already flip locally).

## 2. Absolute timing for settles and the final claim window
- `PublicState` gains `settleEndsAt` and `claimWindowEndsAt` (host server-clock ms, `null` when inactive). Host stamps them from `serverNow()` when entering SETTLING / CLAIM_WINDOW.
- Joiner feedback (match ghost, wrong-claim settle, claim-window countdown) computes remaining time as `endsAt - serverNow()` like the roll; a late or returning client starts at the correct offset and skips already-elapsed beats instead of replaying from zero. Full duration is used only when remaining equals the total.
- `state_request` replies also resend the active `roll_committed` payload when a roll is in progress (host keeps the last commit until ROLL_SETTLE), so a mid-roll joiner sees the die at the right point.

## 3. No full snapshots during the roll tumble
- The broadcaster skips state sends while `rolling` is true between `roll_committed` and ROLL_SETTLE, except the one boundary snapshot at roll start (if needed for phase) and the settled snapshot after ROLL_SETTLE. Catch-up requests during a roll still get snapshot + commit (item 2).

## 4. Host deadline catch-up
- Load-bearing host timers (flip peek completion, SETTLE_COMPLETE, CLAIM_WINDOW_EXPIRE, abandoned-claim expiry, ROLL_SETTLE, turn skip for away/disconnected seats) become entries in a small deadline queue `{ at, action }` in `src/lib/hostDeadlines.ts`. `setTimeout` remains only as a wake-up that calls `drainDue()`.
- On `visibilitychange` (visible), `pageshow`, and `focus`, the host drains every overdue deadline in `at` order (re-reading state between each, since existing tokens already guard stale actions), suppresses intermediate broadcasts, then sends one state.
- The existing "backgrounded host" known-limitation note is updated: iOS suspension still pauses play, but resume is now immediate and correct.

## 5. Tap-to-screen measurement
- Joiner tags each intent with a random sample id; host records receipt and state-send times against the host clock; joiner records the paint (`requestAnimationFrame` after applying the matching snapshot). Stages use `serverNow()` to align clocks.
- Also records dropped/long animation frames during the WHOOP! WHOOP! board pulse and the die roll via Long Animation Frames (`PerformanceObserver` type `long-animation-frame`), falling back to rAF gap counting where unsupported.
- Sampled per game (about 10%), tagged with role, browser family, and an Instagram in-app flag. No visitor id, player key, name, or room code stored.
- Sent in batches at game end to a new rate-capped RPC `log_classic_timing` (per-IP daily cap via existing `rl_hit`) into a new `classic_timing_samples` table with no client read/write access; admin-only `admin_classic_timing()` returns p50/p95 by role and browser, shown as a small table in the admin page.

## Tests
- Tap ack appears on pointerdown, never shows the face, clears on rejection and on 1s timeout; reduced motion uses a static ring.
- A client joining mid-settle and mid-claim-window computes the correct remaining time.
- A catch-up reply during a roll includes the roll commit.
- No full snapshots are sent between roll commit and roll settle.
- Simulated host background with several overdue deadlines: processed in order on resume, one state sent.
- Timing samples: sampled, no personal fields, sent via the RPC only.
- Full suite in one run, none skipped; two-browser preview check of taps, a match, a wrong claim, a final window, a roll, and a host background/resume.

## Technical notes
- Files: `useMultiplayerGame.ts`, `useGameState.ts` (timer scheduling only, reducer unchanged), `publicState.ts`, `MultiplayerGameView.tsx`, `GameCard.tsx`, `animationTiming.ts`, `index.css`, new `hostDeadlines.ts`, `classicTiming.ts`, one migration (table + grants + RLS + two RPCs), `AdminPage.tsx`.
- Protocol version stays 1: new fields are optional and ignored by older tabs.
