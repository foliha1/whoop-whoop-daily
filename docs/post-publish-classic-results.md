# Post-publish: Classic results (security pass 2)

Do these on the day the app is published.

1. **Require the seat key.** In `supabase/functions/_shared/seatOwnership.ts` set `REQUIRE_PLAYER_KEY = true`. Redeploy `claim-lock` and `release-lock`. A claim or release with no `player_key` then gets a 403 `missing_seat_key`.
2. **Retire the old result save.** Run `REVOKE EXECUTE ON FUNCTION public.save_classic_result(uuid, text, boolean, timestamptz, timestamptz, integer, jsonb, integer, integer, integer, text, text) FROM PUBLIC, anon, authenticated;`. Then delete `saveClassicResultRemote` and its types from `src/lib/classicResults.ts`.
3. **Pass 1 leftovers.** The published bundle was checked on 2026-09-26: whoop-whoop.com, 26 JS files. None of the three functions below is called by the published app.
   - `join_room_session(uuid, text, text)` (3 arguments): the published app only calls the 4-argument version. Revoke EXECUTE from PUBLIC, anon and authenticated. Delete the unused `joinRoomSession` wrapper in `src/lib/rooms.ts`.
   - `register_room_seats(...)` (not `_by_pid`): not called. Revoke EXECUTE from PUBLIC, anon and authenticated.
   - `room_seat_keys(...)`: not called. Revoke EXECUTE from PUBLIC, anon and authenticated. Delete the unused `fetchSeatKeys` in `src/lib/rooms.ts`.
   - Before revoking, check the published bundle again to confirm none of these names appears.
4. **Verify.** Play one live multiplayer game and one live solo game. Each should save one `classic_results` row with `verified = true`. A claim-lock call with no key should return 403.
