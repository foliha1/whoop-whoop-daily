# Same-day-as-publish change: remove unsigned v1 claim broadcasts

Do this the same day the signed channel (protocol v2) is published. No client change, no migration.

## supabase/functions/claim-lock/index.ts
1. Delete the `const legacy = { v: 1, type: "claim_grant", ... }` line and the "v1 keeps already-open tabs" comment.
2. If `signed` is null (signing seed missing), log and `return false` so the caller reports "unknown" — never send an unsigned grant.
3. Broadcast body becomes exactly one message:
   `messages: [{ topic: \`room:${room_id}\`, event: "msg", payload: signed }]`

## supabase/functions/release-lock/index.ts
1. Delete `const legacyReject = { v: 1, type: "claim_reject", ... }` and its comment.
2. If `signedReject` is null, log and skip the broadcast (the lock row is already deleted).
3. Broadcast body becomes: `messages: [{ topic: \`room:${room_id}\`, event: "msg", payload: signedReject }]`

## Then
- Redeploy both functions (claim-lock, release-lock).
- Verify: one live claim; captured frames show only `v:2` claim_grant with `from:"server"` and a `sig`; zero `v:1` frames. Before the change each grant arrived twice (1 unsigned + 1 signed).
- Effect: tabs still running the pre-publish build stop receiving grants until they reload (accepted rollout rule).
