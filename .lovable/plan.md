# Containment: hide browser ids from other players

Rule: no player's browser id reaches another player's device, in table reads, presence, broadcasts, or RPC responses.

## What I found first
- The client already uses RPCs for room lookup and creation (`create_room`, `get_room_by_code` in `src/lib/rooms.ts`). Nothing in the app reads or writes `rooms` directly. The only other user is the `release-lock` server function, which runs with service rights.
- `rooms` has row security on and no policies, but anon and authenticated still have SELECT/INSERT grants. Before changing anything I'll check with a real anon request whether rows come back, and report what I see. I'll revoke the grants either way.
- The actual leak today is Classic's shared channel. The presence key and meta carry `visitor_id`, the frozen seat map in game state carries `visitor_id`, and so do intents, heartbeats and releases. Joiners also find the host by matching presence `visitor_id`.
- `create_room` and `register_room_seats` are callable by anon with no rate limit. The room code is generated on the client.

## 1. Rooms: server-only
- Revoke all table privileges on `rooms` (and `room_seats`, `claim_locks`) from PUBLIC, anon and authenticated. Keep service_role.
- `create_room(p_visitor_id)` changes:
  - The server generates the code, retries on collision, and returns `{id, room_code, status, is_host, host_key}` to the creator only.
  - It's rate-capped by IP through the existing `rl_hit` + `request_ip`, at 30 rooms per IP per day.
  - The old two-argument version is dropped from client use (execute revoked).
- `get_room_by_code(p_code, p_visitor_id)` returns only `{id, room_code, status, is_host, host_key}`. It never returns `host_visitor_id`.
- Client call sites to move or update: `src/lib/rooms.ts` `createRoom` (drops client code generation) and `findRoomByCode`. No other direct `rooms` access exists; I'll confirm with a repo-wide search and list the results.

## 2. Classic: seats and session keys, never browser ids
Each player gets a random per-session **player key** (`crypto.randomUUID()`, kept in memory for the tab).

- **Register self (new RPC `join_room_session(room_id, visitor_id, player_key)`):** each client calls this once, over its own request, on entering a room. It's stored server-side in a new service-only `room_members` table (room_id, player_key, visitor_id). If the caller is the host, the room's `host_key` is set to their player key.
- **Presence:** the presence key and meta become `{player_key, display_name, is_host?}`. `visitor_id` is removed. Joiners identify the host by `host_key` from the room lookup.
- **Seat map (smallest change for the host):** the host builds the map exactly as now, from presence order, but entries are `{seat, player_key, display_name}`. `register_room_seats(room_id, game_id, host_visitor_id, seats[{seat, player_key}])` checks the host by its own browser id, then resolves each player key to a browser id **on the server** from `room_members` and writes `room_seats` as today. The host never sees anyone else's id.
- **Game state, intents, heartbeats, abandon and releases:** these match players by `player_key` instead of `visitor_id` (`useMultiplayerGame`, `MultiplayerWindow`, `MultiplayerGameView`, `publicState`, `useRoomPresence`, heartbeat hook). The debug overlay stops printing the browser id.
- **Claims:** the client still sends its own `visitor_id` directly to `claim-lock` and `release-lock` over its own request. `verifySeatOwner` is unchanged, so the arbiter, the first-caller unique key, optimistic claim entry, abandon expiry and reconnect all behave the same.
- **Reconnect:** a reloaded tab gets a new player key and re-registers with the same browser id. The server maps both keys to the same browser id. The host treats a new key whose display name and seat match an absent seat as a rejoin, the same as the current visitor_id rejoin rule. This is the riskiest piece; I'll test it explicitly.
- **Trade-off:** player keys are visible to room members, the same way visitor ids are now. A player key grants nothing outside that room's live channel. It can't be used for Daily saves, stats or accounts.

## 3. Signed-out saves into an account's browser
- `save_daily_result`: if there's no session and `visitor_id` is in `player_devices`, return `false` and log `visitor_linked_needs_session` in the rejection log.
- Client (`useDailyGame` save path): on `false` while signed out, if this browser remembers a previous sign-in, the result stays on the device as "pending save". Results then shows "Sign in to save this game". After sign-in, the save is retried once under the session. A real game is never discarded.
- There's no new server lookup revealing whether a browser is linked, so that can't be used as a test.

## Verification
- **Rooms:** an anon REST `select` on `rooms` returns a permission error; the `has_table_privilege` before/after table. `get_room_by_code` output has no host id. The rate cap trips at the limit.
- **Two-browser Classic (Playwright, two contexts):** create, join by code, join by invite link, a match, a miss, a simultaneous WHOOP (both fire together; exactly one wins), results, rematch, and a reload/rejoin mid-game.
- **Payload capture:** hook the realtime websocket frames in both browsers for the whole game. Assert that neither browser id string, and no `visitor_id` key, appears in any presence, broadcast or state frame.
- **Daily:**
  - Link a test browser, drop the session, save: refused, result kept, sign-in prompt shown, saved after sign-in.
  - A fresh anonymous save and a normal signed-in save still work.
  - Test rows are cleaned up afterwards.
- **Tests:** add unit tests for room RPC shapes, player-key seat map and rejoin, no-visitor-id payload builders, and the pending-save retry. Then run the full suite in one run.

## Not changing
Points, tiers, decay, the sign-in flag, Groups visibility, Classic rules. Nothing published until you approve the result.
