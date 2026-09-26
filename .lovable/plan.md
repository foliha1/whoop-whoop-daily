# Security pass 1 of 3: signed Classic game channel

Goal: only the real host can change a table's game, and no player can act as another player's seat. Gameplay, timings, UI, sounds and Solo stay exactly as they are. Nothing is published.

## Corrections to the brief (checked in the code)

1. **player_key leaks in three more places besides presence.** It is also sent in every `state` snapshot (`PublicState.seatMap[].player_key`, `publicState.ts:60`), in every `heartbeat` (`useHeartbeat.ts:65`, where `player_key: visitorId` is actually the session key), and in every `intent`. Joiners find their own seat by matching `seatMap.player_key` (`useMultiplayerGame.ts:909`, `MultiplayerWindow.tsx:523`). All of these switch to the public id.
2. **The host does not send every message that matters.** `claim_grant` is sent by the `claim-lock` server function, and a second `claim_reject` source is the `release-lock` server function, both through the server broadcast endpoint. The host cannot sign these. Worse, **the host accepts `claim_grant` from the channel today**, so any player can broadcast a fake grant and enter a claim for any seat. The brief doesn't name this, and it is the most serious gap. Fix: the server functions sign their own messages (see C2).
3. **A host refresh doesn't resume the game today.** Host game state lives only in the host's memory, so a host reload ends the game. That was reported in the reliability batch. Requirement E ("joiners recover after a host refresh") can mean either of two things in this pass:
   - (a) Joiners accept the refreshed host's new key within a few seconds and follow whatever that host sends: the lobby, or a new game. This is in scope.
   - (b) The game resumes where it left off after the host reloads. That needs host state saved on the server, which is a separate, larger change and out of scope here.
   Test 4 will check (a), plus a **joiner** refresh mid-game where play continues. Tell me if you meant (b).
4. `claim-lock` identifies the caller by `visitor_id` (the browser id). That id never goes on the channel, so a player can't copy another's. No change there in this pass; it is noted for pass 2.

## Every message type on the channel (`room:{roomId}`, event `msg`)

| Type | Sender | Today | After |
|---|---|---|---|
| presence meta | everyone | contains player_key | public id only |
| `state` | host | unchecked | host-signed |
| `roll_committed` | host | unchecked | host-signed |
| `roll_reject` | host | unchecked | host-signed |
| `event` (NICE / GREAT_MATCH / NOPE) | host | unchecked | host-signed |
| `claim_reject` | host **and** release-lock | unchecked | host-signed or server-signed |
| `claim_grant` | claim-lock | **host trusts it** | server-signed, and the host verifies it |
| `intent` | joiners | seat + player_key | sender-signed, with a nonce |
| `state_request` | joiners | unchecked | unsigned, harmless (it only asks for a reply) |
| `heartbeat` | everyone | contains player_key | public id, sender-signed |
| `{kind:"seat_rekey"}` | host (no envelope) | unchecked | host-signed |
| `{kind:"game_starting"}` | host (no envelope) | unchecked | host-signed |

Heartbeats are signed because a forged heartbeat could keep a departed seat "present" or make a present seat look hidden.

## Approach

**A. Keys for each join.** On every room join, each browser (host included) makes an ECDSA P-256 key pair with WebCrypto, with `extractable:false`, and keeps it in memory only. The public key (raw, base64) is sent with the join request and stored with that browser's room_members row, along with a new random **public id** (`pub_id`). The server returns the `pub_id`. A reload creates a new key pair and a new `pub_id`, and the seat carries over through the existing server check that matches the same browser.

**B. Host messages are signed.** The signature covers a canonical encoding of the whole envelope: `{v, type, seq, gameId, payload, probe}`, plus `roomId` and a `signer` field. Joiners get the host's public key only from the server, never from the channel. If a signature fails, joiners refetch the host key once (by then the host may have re-keyed) and drop the message if it still fails. Refetches are rate-limited to one per 2 seconds.

**C1. Intents and heartbeats are signed.** The signed data includes `seat`, `sentAt`, a 128-bit random `nonce`, `gameId` and the action. The host verifies against **that seat's** key from the server. The host keeps seen nonces for each game (cleared when the game changes, like other per-game state) and drops any it has already seen, and any intent whose `sentAt` is more than 30 seconds outside server time.

**C2. Server-sent messages are signed.** `claim-lock` and `release-lock` sign `claim_grant` and `claim_reject` with a server ECDSA key. The private key is stored as a backend secret. The public key is a constant shipped in the app, so no lookup is needed. The host drops any grant that doesn't verify. The existing checks on game and claim window stay.

**D. No secrets on the channel.** Presence, `seatMap`, heartbeats and intents carry `pub_id`. `player_key` becomes a server-only session secret used for seat registration. `register_room_seats` takes `pub_id`s (new overload) and resolves each one to its room_members row on the server, so seats still map to real members.

**E. Rejoin.** A refreshed joiner re-registers and gets a new key and `pub_id`. The host re-reads seat keys when presence shows an unknown `pub_id` (this reuses the current `seat_rekey` path). When a message fails with the cached host key, joiners refetch it (B), so a refreshed host is trusted again within about a second.

## Database (one migration; nothing removed or renamed)

- `room_members`: add `pub_id text` (unique within a room) and `sign_pubkey text`, both nullable.
- `room_seats`: add `pub_id text`, nullable.
- New `join_room_session(p_room_id, p_visitor_id, p_player_key, p_sign_pubkey)` overload. It stores the key and `pub_id` and returns `{game_id, seat, pub_id}`.
- New `room_sign_keys(p_room_id, p_visitor_id, p_player_key)`. For any **member** of the room, it returns the host's current key plus `pub_id` → key for every seat in the room's latest game. The caller must match an existing room_members row (browser id + session key). Everyone else gets nothing.
- New `register_room_seats` overload that takes `pub_id`s.
- Every new function is SECURITY DEFINER with `search_path = public` and has EXECUTE revoked from PUBLIC, anon and authenticated. It is then granted back to anon and authenticated only where the client must call it, since these functions do their own membership check. The old signatures stay until after publish.

## Files

- `src/lib/channelSigning.ts` (new): key generation, canonical encoding, sign and verify, nonce store, host-key cache with a single refetch.
- `src/lib/multiplayer.ts`: add `sig` and `signer` to envelopes, `nonce` to intents, `PROTOCOL_VERSION` 2, and wrap the two `{kind}` messages in envelopes.
- `src/lib/publicState.ts`: seatMap uses `pub_id`.
- `src/lib/rooms.ts`: new RPC wrappers.
- `src/hooks/useRoomPresence.ts`: presence meta uses `pub_id`.
- `src/hooks/useHeartbeat.ts`: sign heartbeats and verify them on the host.
- `src/hooks/useMultiplayerGame.ts`: sign on host send, verify on joiner receive, verify intents with nonces, verify grants.
- `src/components/MultiplayerWindow.tsx`: key setup on join, seat registration by `pub_id`, own-seat lookup.
- `src/lib/claimLock.ts`: no change expected.
- `supabase/functions/claim-lock/index.ts`, `supabase/functions/release-lock/index.ts`: sign broadcasts, then redeploy.
- A new backend secret for the server signing key. I generate it; you won't need to paste anything.
- Tests: `src/test/channelSigning.test.ts` (new); update `classicReliability`, `classicResponsiveness` and `securityBoundary` fixtures that use player_key.
- `AGENTS.md`: one rule: "Classic channel messages are signed by the sender's per-join key; keys come only from the server."

## Performance

- Signing and verifying run inside the existing send and receive paths. Nothing waits on the network, because keys are cached. On a joiner, a card tap starts its local ring before the intent is signed, so tap feedback stays instant.
- I'll measure with `performance.now()` around each sign and verify, add `signMs` and `verifyMs` to the existing timing samples, and show p50 and p95 in the admin Classic responsiveness table. A benchmark run under Playwright with 4x CPU slowdown (roughly a mid-range phone) should come in well under 2 ms per state message. If not, I'll report that before going further.
- The existing timing probes keep working: `probe` becomes part of the signed data.

## Tests

1. A `state` message signed by a non-host key is dropped.
2. An intent signed with seat A's key but claiming seat B is dropped.
3. A replayed nonce is dropped. A stale `sentAt` is dropped.
4. After a host re-key, joiners fail once, refetch the key, then accept. After a joiner refresh mid-game, play continues.
5. A normal 3-player game in the simulated host/joiner harness plays as before: the reducer output is identical with signing on.
6. `player_key` appears in no captured presence or broadcast payload. This runs as a unit check plus a live two-browser capture.
7. A fake `claim_grant` without the server signature is ignored by the host.

The full suite runs together in one pass, then a live two-browser game.

## Risks

- **Mixed versions during rollout.** Open v1 tabs can't read v2 messages. The protocol version bump makes them ignore v2 traffic, so a table with mixed versions stalls until everyone reloads. Classic traffic is low, so this is acceptable.
- **Timing of server signing.** Signing in claim-lock adds under 1 ms to each claim.
- **Host reload** still ends the game (see correction 3).
- **Anyone can call release-lock and claim-lock directly with a seat and browser id.** Only the seat's own browser can pass the seat check, so this is left for pass 2.
