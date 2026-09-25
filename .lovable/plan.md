# Classic multiplayer reliability batch

Scope: Classic network layer only. No change to game rules, the 2-second flip hold, animation/settle timing, sign-in, points, tiers, or Groups visibility. Not published until approved.

## 1. Seats registered before a game starts
`MultiplayerWindow.tsx` (~744): replace the fire-and-forget `register_room_seats` call with an awaited `registerSeatsWithRetry()`.
- Success means no error AND `data === true`. `data: false` counts as a failure.
- One retry after a short delay on any failure.
- Only after success: set the new `gameId`, freeze the seat map, dispatch the start.
- On final failure: stay in a plain "Starting…" state with a "Try again" button. The lobby is still there and no game state is broadcast. The same `gameId` candidate is reused on retry, so seat rows stay idempotent.

## 2. A server win is never lost (`claim-lock`)
- Insert succeeds but the broadcast fails or throws: return `{ outcome: "unknown", won: null, winner_seat: player_seat }` instead of `{ won: false }`. The lock row stays in place. The client wrapper already maps anything that isn't a clear verdict to "unknown" and retries.
- Unique conflict (23505): look up the existing winner, rebroadcast its `claim_grant` (with the same player_key payload), then return the verdict. If that seat is the caller's, the result is "won", so a retry heals it. Any later caller also heals the host.
- Pull the broadcast into one shared `broadcastGrant()` helper so both paths send the same payload.
- The host's grant dedupe makes duplicate grants harmless (see 5).

## 3. State request for catch-up
- New intent/message `state_request` (it carries no identity beyond the sender's per-session key).
- A joiner sends it on first SUBSCRIBED, on each re-SUBSCRIBED after a channel drop, and on `visibilitychange` to visible (throttled to about 1 per second).
- The host replies by re-sending its latest public snapshot through the existing send path. Snapshots are full state and seq-ordered, so one reply fully repairs a joiner. The host ignores the request while in the lobby unless a lobby snapshot exists.

## 4. Table code kept in the URL
After a table is created or joined (invite link or typed code), run `history.replaceState(null, "", "/classic.html?r=CODE")`, keeping any other existing params such as `mode`. Leaving the table clears `r` the same way.

## 5. Per-game reset
Make the grant dedupe key `${gameId}:${claim_window}:${seat}`. A single `useEffect` keyed on `gameId` in `useMultiplayerGame.ts` clears everything scoped to one game. An audit of the file will produce the final list. Expected so far:
- `grantedRef` (claim grant dedupe)
- `endedForEmptyRef` (empty-table ending)
- pending/optimistic claim refs (in-flight claim window, local claim entry)
- last-applied snapshot seq for the joiner (a new game restarts ordering)
- heartbeat/abandon trackers keyed by seat (last-seen, grace start)
- any "results recorded" or "game over handled" once-flags
Each ref that gets reset will be listed in the final report.

## 6. Only the current roller can roll
In the host's intent handler (`useMultiplayerGame.ts` ~616 / `MultiplayerWindow.tsx` ~1094): `REQUEST_ROLL` is ignored unless the sender's seat, resolved from its player_key, equals the current roller seat. Otherwise it is dropped with a debug log. The host's own local roll goes through the same check.

## 7. Presence blips aren't leaving
- **Host missing (joiner side, ~1179):** during play, the host disappearing from presence switches the joiner to a quiet "Waiting for the host…" overlay. The game ends with "The host left the game." only once the heartbeat logic reports the host gone, using the existing thresholds. If the host returns, the overlay clears and a `state_request` is sent.
- **Joiner seats (host side):** absence from presence only records a grace start. A seat becomes skippable only when heartbeat age passes the existing mobile grace thresholds. Presence returning clears the grace. The empty-table check uses the same "really gone" signal.

## Tests (new, alongside the existing suite)
- Seat registration: delayed success starts the game only after it resolves. `error` then success retries once and starts. A persistent failure or `data:false` stays on "Starting…" with a retry and sets no gameId.
- claim-lock: a broadcast failure returns unknown and keeps the lock. A retry hits the conflict, rebroadcasts, and returns won for the same seat. Another seat gets lost and the grant is rebroadcast.
- Two fresh games in one session with the same claim window and seat: the second grant is applied.
- Reload mid-game: host rejoins and resumes; joiner rejoins and a `state_request` gets the snapshot; typed-code joiner reload keeps `?r=CODE` and rejoins.
- Presence drop: a brief joiner drop doesn't skip their turn; a brief host drop shows "Waiting for the host…" and doesn't end the game; a real timeout still ends or skips as before.
- A stale `REQUEST_ROLL` from a non-roller seat is ignored.
- Full suite in one run, zero skipped.

## Verification
- Two-browser Playwright game on preview: start, claims, a forced reload of the joiner mid-game (catch-up), a reload of the typed-code joiner (URL kept), rematch (second game's grants work).
- Redeploy claim-lock and check its logs.
- Build log clean.

## Technical notes
- Files: `src/components/MultiplayerWindow.tsx`, `src/hooks/useMultiplayerGame.ts`, `src/hooks/useRoomPresence.ts`, `src/hooks/useHeartbeat.ts`, `src/lib/multiplayer.ts`, `src/lib/claimLock.ts` (handle `won: null`), `supabase/functions/claim-lock/index.ts`, plus new tests.
- No database schema changes.
