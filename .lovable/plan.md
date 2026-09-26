# Security pass 2 of 3: Classic results

Goal: a Classic result is saved only for a real, server-registered game, by its real host, with the real seats, and with identity taken from the server. Gameplay, UI, sounds and timings do not change.

## Corrections to the brief (checked against code and the live database)

1. **Rematch reuses the game id.** "Play again" (the `NEW_GAME` action in MultiplayerWindow) re-inits the board with the same `gameId`, and the recorder keys the result on that id. So today every rematch result hits `ON CONFLICT (game_id) DO NOTHING` and is silently lost. "One result per game" only works if a rematch gets its own server-registered id. Fix: the rematch path registers a new game id with the same seats (the same `register_room_seats_by_pid` call used by "Let's Play!", run silently in the background) before it re-inits. Nothing on screen changes. Claim windows are then scoped per game too.
2. **"48 cards, first to 12" means scores of 12 or 13, not exactly 12.** A match is worth +2 (the two cards) and a wrong claim is −1, so a seat on 11 who matches ends on 13. Score equals cards held, so the sum of all seats is at most 48. The current check allows any seat 0–60 and never checks the sum.
3. **Not every game ends at 12.** A game can reach `GAME_OVER` three ways: someone reaches 12 (normal), `END_GAME_TABLE_EMPTY` (fewer than 2 players left), or the stall safety (deck runs out). Today all three save as the same kind of row, with nothing to tell them apart. That keeps working, but each row gets an `end_reason`.
4. **claim-lock and release-lock still trust the browser id alone.** Confirmed: `verifySeatOwner` compares only `visitor_id`, and release-lock compares only `rooms.host_visitor_id`.
5. **Edge functions go live when they deploy, not when the app publishes.** If claim-lock started requiring a key before publish, every open tab on the live app would lose its claims. So the key is checked **when it's sent** from now on, and becomes **required** on publish day (listed in the post-publish doc).
6. **Solo already mints a random id on the device.** The recorder makes up a UUID per solo game, because solo's wire id is the constant `"solo-game"`. That id gets replaced by the server-issued one.
7. **Live data:** 12 multiplayer and 17 solo rows since Sep 8, and 1 logged rejection.

## What gets built

### A. Multiplayer save: `save_classic_game(...)` (new; the old function is kept)
Inputs: room id, game id, host visitor id, host player_key, end_reason, seats (seat, name, score), rounds, correct/wrong claims, app version. There are no client times and no identity fields.
Rules, in order (any failure logs a rejection and returns `true`):
1. Rate limits, before anything else: `rl_hit('classic_save_ip', request_ip(), 200)`, plus `rl_hit('classic_save_user', auth.uid(), 200)` when signed in.
2. The room exists, `host_visitor_id = p_visitor_id` and `host_key = p_player_key`. Otherwise `not_host`.
3. `room_seats` has rows for (room, game). Otherwise `unknown_game`.
4. The seat numbers sent equal the registered seat numbers exactly, same set and same count. Otherwise `seat_mismatch`.
5. There is no existing result for this game. Otherwise the save is ignored: return `true` with no rejection log, as today.
6. Duration = `now() − min(room_seats.created_at)` for that game. It must be at least 30 s for `target` and at least 10 s for other endings, and at most 6 h. Otherwise `too_short` / `too_long`.
7. Score rules (below). Otherwise the matching reason.
8. Insert with server-filled identity (section B), `started_at` = seat registration time, `ended_at = now()`, plus `distinct_browsers` and `distinct_users`.

### B. Identity from the server
- `room_members.user_id uuid` (nullable), set only from `auth.uid()` inside the 4-argument `join_room_session`. It is refreshed on each join, so signing in and rejoining updates it.
- `room_seats.user_id uuid` (nullable), copied from the member row inside `register_room_seats_by_pid`.
- New columns on `classic_results`: `seat_identities jsonb` (seat, visitor_id, user_id per seat, from room_seats), `host_user_id`, `end_reason`, `distinct_browsers`, `distinct_users`, `verified boolean default false`. New rows are `verified = true`. Old rows stay false. Names are still shown from the client but are never used as identity.

### C. Solo
- New table `solo_games(id, started_at, visitor_id, user_id, ip, finished_at)`. It is service-only: grants to service_role only and RLS on with no policies.
- `start_solo_game(p_visitor_id)` returns `{ id, started_at }`. Limits: 150 per IP per day (families share wifi), 100 per signed-in user per day, and 1 open game per browser per 5 s. The visitor id is recorded, but the limits never key on it. The call is made quietly in the background when a solo game begins. If it fails, the game plays exactly the same and simply isn't saved.
- `save_solo_game(p_game_id, end_reason, seats, rounds, claims, app_version)`: the id must exist, `finished_at` must be null (one result per id), `now() − started_at` must be at least 30 s for `target` and at least 10 s otherwise, and at most 6 h. Exactly 2 seats. Identity comes from the `solo_games` row plus the session. `finished_at` is set in the same statement, so a second save does nothing. Rate limits match the multiplayer save.

### D. Score rules (both paths)
- Each score is between 0 and 13. The sum of scores is at most 48.
- `target`: exactly one seat scores 12 or 13, and every other seat is at most 11.
- `table_empty` / `stalled`: no seat is at 12 or above. These are stored with their `end_reason` so the future points system can ignore them.
- Rounds between 1 and 400. Claims between 0 and 400. Correct claims are at least (sum of scores + penalties) / 2 is not enforced; that's too fragile.

### E. Rate limits
All new limits key on `request_ip()` and `auth.uid()` only. The existing per-visitor join limit stays as it is.

### F. claim-lock / release-lock
- claim-lock takes `player_key`. When it's present, it must equal `room_seats.player_key` for that room, game and seat (`bad_seat_key`, 403). The client sends its own key, which it already holds.
- release-lock takes `player_key`. When it's present, it must equal `rooms.host_key`.
- From publish day on, a missing key is refused (post-publish doc).

### G. Record, don't block
The result stores the number of distinct browsers and distinct signed-in users among the seats. IP is never compared, and a game is never rejected for a shared IP.

### H. Rejections
Every rejection returns `true` and inserts `classic_result_rejected` into `analytics_events` with `reason`, `game_id` and `path` ('multi' | 'solo'). The admin Classic view keeps reading `classic_results` unchanged.

## Files and functions touched
- Migration `drizzle/migrations/0023_classic_results_integrity.sql`: the new columns, the `solo_games` table, new `save_classic_game`, `start_solo_game` and `save_solo_game`, a new helper `classic_score_reject_reason`, and in-place replacement of `join_room_session(uuid,text,text,text)` and `register_room_seats_by_pid` (same signatures; they only also write user_id). All new functions are SECURITY DEFINER with `search_path = public`. Each one runs REVOKE from PUBLIC, anon and authenticated, then GRANT only what it needs: save/start to anon + authenticated, and the helper to nobody. Afterwards, re-check the PUBLIC grants on the two replaced functions, because CREATE OR REPLACE keeps old grants.
- `src/lib/classicResults.ts`: new `saveClassicGame` and `startSoloGame` / `saveSoloGame` wrappers, and `end_reason` derived from the final state.
- `src/hooks/useClassicResultRecorder.ts`: takes room id, host key and solo id, and stops sending times and the visitor id as identity.
- `src/components/MultiplayerWindow.tsx`: passes the host key and room id, registers a new game id on rematch, and starts the solo id when a solo game begins.
- `src/lib/claimLock.ts` and `src/hooks/useMultiplayerGame.ts` (release-lock call): send the player key.
- `supabase/functions/_shared/seatOwnership.ts`, `claim-lock/index.ts`, `release-lock/index.ts`: optional key check, then redeploy.
- `src/integrations/supabase/types.ts`: regenerated.
- New `docs/post-publish-classic-results.md`: on publish day, (1) make `player_key` required in claim-lock and release-lock and redeploy, (2) revoke EXECUTE on the old `save_classic_result(...12 args)` from PUBLIC, anon and authenticated, (3) verify with one live multiplayer game and one live solo game.
- Tests: new `src/test/classicResultsIntegrity.test.ts`.

## Tests
Automated, run against the database through its functions and against the edge-function handler with a stubbed client:
1. A made-up game id is rejected (`unknown_game`).
2. A non-host member, and a stranger who knows the code, are both rejected (`not_host`).
3. Wrong seat numbers or the wrong seat count are rejected (`seat_mismatch`).
4. A second save for the same game is ignored, and the row count stays at 1.
5. A solo save with no server id, and one within 30 s of its start, are both rejected.
6. 201 saves with 201 different visitor ids from one IP: the 201st is dropped.
7. claim-lock with the right visitor id and the wrong key gets 403 `bad_seat_key`.
8. Score rules: 14 points, a sum over 48, two winners, and a `target` ending with no winner are each rejected.
9. A rematch registers a new game id, and both results save.

Live, in the preview on the live database: one full 2-browser game plus a rematch, and one full solo game. Each row is read back to confirm server times, seat_identities, user_id for a signed-in seat, the distinct counts and `verified = true`. Then a wrong-key claim-lock call is made directly.

Nothing is published. The post-publish doc lists the same-day steps.

## Risks
- Old tabs keep using the old save and claim paths until publish day. That's accepted, and it's why the key is only required on publish day.
- A 30 s minimum could reject a real very-fast debug game. Normal play can't finish that fast: at least 6 matches, each with a roll, a 2 s flip hold and a 1.9 s settle.
- A host whose tab reloaded gets a new `host_key`, which the save uses. That's fine, because a host reload ends the game anyway.
